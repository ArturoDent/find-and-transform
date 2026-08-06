const path = require('path');
const { Writable } = require('stream');

const { runTests } = require('@vscode/test-electron');

// Known-benign noise printed by the real VS Code instance @vscode/test-electron
// launches. Can't be trimmed with the --log CLI flag: the extension host's own
// console output (i.e. Mocha's reporter) rides the same logging channel VS Code
// gates by --log level, so raising it hides our own test results too - filtering
// has to happen here instead. Anything NOT matching one of these is forwarded
// untouched, so real failure output always still gets through.
const NOISE_PATTERNS = [
  /^\[main /,                                   // VS Code's own internal process logger (update/storage/agent-host services); Mocha's reporter never uses this prefix
  /^Warning: 'cached-data' is not in the list of known options/,
  /^\(Use `Code --trace-deprecation/,
  /^Started local extension host with pid/,
  /^Loading development extension at/,
  /^\[AgentHost/,                                // AgentHost renderer/protocol/token noise
  /^\[AccountPolicyGate\]/,
  /^Settings Sync:/,
  /^Unknown channel: agentHostClientProxy$/,
  /^\[vscode\.mermaid-markdown-features\]:/,
  /^Tool "renderMermaidDiagram" was not contributed\.$/,
];

/**
 * Wrap a writable stream (process.stdout/process.stderr) so that lines
 * matching NOISE_PATTERNS are dropped and everything else is forwarded as-is.
 * @param {NodeJS.WritableStream} target
 * @returns {NodeJS.WritableStream}
 */
function filterNoise(target) {
  let buffered = '';

  return new Writable({
    write(chunk, _encoding, callback) {
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';

      for (const line of lines) {
        if (!NOISE_PATTERNS.some((pattern) => pattern.test(line))) target.write(line + '\n');
      }
      callback();
    },
    final(callback) {
      if (buffered && !NOISE_PATTERNS.some((pattern) => pattern.test(buffered))) target.write(buffered);
      callback();
    }
  });
}

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../');

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Download VS Code, unzip it and run the integration test
    // --disable-extensions: isolate the test host from other bundled/built-in extensions
    // (e.g. vscode.mermaid-markdown-features), which otherwise load alongside ours and
    // can interfere with the test run; --extensionDevelopmentPath still loads ours regardless
    // stdout/stderr: filtered through filterNoise() to drop VS Code's own startup noise
    // while forwarding Mocha's test output and any real failures untouched
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions'],
      stdout: filterNoise(process.stdout),
      stderr: filterNoise(process.stderr),
    });
  } catch {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
