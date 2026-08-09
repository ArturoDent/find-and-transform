const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const testHelpers = require('../testHelpers');
const { parseSelectionMarkers, sortSelectionsByPosition } = testHelpers;

// Exercises each restrictFind mode end-to-end. Every subfolder of this
// directory is named after the restrictFind value it tests (e.g. line/,
// selections/, nextSelect/, ...) and contains one or more numbered fixture
// pairs - input.txt/expected.txt, input2.txt/expected2.txt, input3.txt/
// expected3.txt, ... - with |/[...]/{...} selection markers (see
// testHelpers.parseSelectionMarkers). Both mode folders and fixture pairs
// within them are discovered automatically: a new restrictFind/<mode>/ or an
// extra input<N>.txt/expected<N>.txt in an existing mode folder (e.g. to
// test the same mode from a different starting selection) is picked up with
// no code change. Fixture pairs that aren't both present and non-empty are
// skipped, so this suite works incrementally as fixtures get authored.
suite('restrictFind modes', () => {

  let document;
  let editor;

  /** @type {{ mode: string, inputFile: string, expectedFile: string, label: string }[]} */
  const cases = [];

  for (const modeName of fs.readdirSync(__dirname, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)) {

    const modeDir = path.join(__dirname, modeName);

    for (const fileName of fs.readdirSync(modeDir)) {
      const match = fileName.match(/^input(\d*)\.txt$/);
      if (!match) continue;

      const suffix = match[1];
      const expectedFile = `expected${suffix}.txt`;
      const inputPath = path.join(modeDir, fileName);
      const expectedPath = path.join(modeDir, expectedFile);

      if (fs.existsSync(expectedPath) && fs.statSync(inputPath).size > 0 && fs.statSync(expectedPath).size > 0) {
        // Optional description<N>.txt - its (trimmed, single-line) content
        // shows up in the test name, e.g. "restrictFind: nextSelect (2: cursor
        // sits on a match)" - falls back to just the suffix if absent.
        const descriptionPath = path.join(modeDir, `description${suffix}.txt`);
        const description = fs.existsSync(descriptionPath) ? fs.readFileSync(descriptionPath, 'utf8').trim() : '';

        let label = modeName;
        if (suffix && description) label = `${modeName} (${suffix}: ${description})`;
        else if (suffix) label = `${modeName} (${suffix})`;
        else if (description) label = `${modeName} (${description})`;

        cases.push({ mode: modeName, inputFile: fileName, expectedFile, label });
      }
    }
  }

  suiteSetup(async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
    if (extension && !extension.isActive) await extension.activate();

    if (!cases.length) return;  // nothing to open yet if every mode folder is still empty

    // A genuinely separate untitled scratch document, not a real fixture file -
    // VS Code caches TextDocument instances per URI, so opening an actual
    // fixture path here would make it the SAME object loadFixtureWithSelections()
    // later re-opens to read "fresh" text, silently reading back its own edits
    // instead of the original file on disk.
    document = await vscode.workspace.openTextDocument({ content: '' });
    editor = await vscode.window.showTextDocument(document, { preview: false });
  });

  suiteTeardown(async () => {
    // Deliberately not reverting/closing here: `document` is an untitled scratch
    // doc, and by now it has unsaved content from the tests - closing it would
    // prompt "Save changes?" (a real, unscriptable native dialog, same risk as
    // the saveAs case in findInCurrentFile.test.js). The whole VS Code test
    // instance is torn down non-interactively once Mocha finishes.
  });

  /**
   * Load a marked fixture (see parseSelectionMarkers) into the shared
   * document and set editor.selections to the selections it described.
   * @param {string} fixtureFileName - filename relative to this suite's directory
   */
  async function loadFixtureWithSelections(fixtureFileName) {
    editor = await testHelpers.loadFixtureWithSelections(document, path.resolve(__dirname, fixtureFileName));
  }

  /**
   * Poll the shared document's text until it matches expectedText or timeoutMs
   * elapses, then assert. Guards against the runCommands/paste timing issue
   * noted in prePostCommands.js: https://github.com/microsoft/vscode/issues/190831
   * @param {string} expectedText
   * @param {number} [timeoutMs]
   */
  async function assertEventualText(expectedText, timeoutMs = 3000) {
    /** @param {string} text */
    const normalize = (text) => text.replace(/\r\n/g, '\n');
    expectedText = normalize(expectedText);

    let actualText = normalize(document.getText());
    const deadline = Date.now() + timeoutMs;

    while (actualText !== expectedText && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      actualText = normalize(document.getText());
    }

    assert.strictEqual(actualText, expectedText);
  }

  // Shared find/replace across all modes - only restrictFind and the cursor/
  // selection markers vary between mode folders. Capitalizing "const" makes
  // each restrictFind mode's scoping easy to see in expected.txt.
  const find = "(const)";
  const replace = "\\U$1";

  cases.forEach(({ mode, inputFile, expectedFile, label }) => {
    test(`restrictFind: ${label}`, async function () {
      this.timeout(10000);

      await loadFixtureWithSelections(path.join(mode, inputFile));

      const expectedRaw = (await vscode.workspace.openTextDocument(
        vscode.Uri.file(path.resolve(__dirname, mode, expectedFile))
      )).getText();
      const { text: expectedText, selections: expectedSelections } = parseSelectionMarkers(expectedRaw);

      await vscode.commands.executeCommand('findInCurrentFile', { find, isRegex: true, replace, restrictFind: mode });

      await assertEventualText(expectedText);
      assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), sortSelectionsByPosition(expectedSelections));
    });
  });
});
