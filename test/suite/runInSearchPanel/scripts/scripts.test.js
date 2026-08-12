const assert = require('assert');
const vscode = require('vscode');
const search = require('../../../../src/search');
const scriptStorage = require('../../../../src/scriptStorage');

// Exercises search.js's buildSearchArgs() directly - the per-step arg builder
// runInSearchPanel uses for its (possibly array-valued) find/replace - rather
// than driving the real Search panel UI. args here are passed already shaped
// the way _expandArgs() feeds them internally: find/replace/etc. as arrays,
// one entry per step.
suite('runInSearchPanel - scripts', () => {

  let document;

  suiteSetup(async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
    if (extension && !extension.isActive) await extension.activate();

    document = await vscode.workspace.openTextDocument({ content: '' });
    await vscode.window.showTextDocument(document, { preview: false });
  });

  test('resolves a $${script:name}$$ reference in a single-string replace', async () => {
    await scriptStorage.save('test-search-script', "return 'hello ' + 'world';");

    try {
      const args = { find: ['foo'], replace: ['$${script:test-search-script}$$'], isRegex: [true] };
      const result = await search.buildSearchArgs(args, 0);

      assert.strictEqual(result.replace, 'hello world');
    } finally {
      await scriptStorage.delete('test-search-script');
    }
  });

  test('resolves a $${script:name}$$ reference in one step of an array replace (runInSearchPanel multi-step shape)', async () => {
    await scriptStorage.save('test-search-script-2', "return 'qrs';");

    try {
      const args = {
        find: ['"field2"\\s*:\\s*"cdf"', '("field1"\\s*:\\s*)"abc"'],
        replace: ['', '$${script:test-search-script-2}$$'],
        isRegex: [true, true],
      };
      const result = await search.buildSearchArgs(args, 1);

      assert.strictEqual(result.replace, 'qrs');
    } finally {
      await scriptStorage.delete('test-search-script-2');
    }
  });

  // vscode's own search engine does the real matching later, so there is no
  // captured text at resolve time - $n must survive into the Replace field
  // for vscode to substitute, rather than being blanked out here.
  test('a \\U$1 capture group in a script is passed through as a literal $1 for vscode to resolve', async () => {
    await scriptStorage.save('test-search-capgroup', 'return \\U$1 + "qrs";');

    try {
      const args = {
        find: ['("field1"\\s*:\\s*)"abc"'],
        replace: ['$${script:test-search-capgroup}$$'],
        isRegex: [true],
      };
      const result = await search.buildSearchArgs(args, 0);

      assert.strictEqual(result.replace, '$1qrs');
    } finally {
      await scriptStorage.delete('test-search-capgroup');
    }
  });

  test('a bare $1 capture group in a script is passed through as a literal $1 for vscode to resolve', async () => {
    await scriptStorage.save('test-search-capgroup-bare', 'return $1 + "-suffix";');

    try {
      const args = {
        find: ['("field1"\\s*:\\s*)"abc"'],
        replace: ['$${script:test-search-capgroup-bare}$$'],
        isRegex: [true],
      };
      const result = await search.buildSearchArgs(args, 0);

      assert.strictEqual(result.replace, '$1-suffix');
    } finally {
      await scriptStorage.delete('test-search-capgroup-bare');
    }
  });

  test('REGRESSION: a replace with no special variables resolves unchanged', async () => {
    const args = { find: ['foo'], replace: ['plain replacement text'], isRegex: [false] };
    const result = await search.buildSearchArgs(args, 0);

    assert.strictEqual(result.replace, 'plain replacement text');
  });

  test('a $${script:name}$$ reference in find is left unresolved (scripts are not supported in find)', async () => {
    await scriptStorage.save('test-search-script-3', "return 'should-not-run';");

    try {
      const args = { find: ['$${script:test-search-script-3}$$'], replace: ['x'], isRegex: [true] };
      const result = await search.buildSearchArgs(args, 0);

      assert.strictEqual(result.find, '$${script:test-search-script-3}$$');
    } finally {
      await scriptStorage.delete('test-search-script-3');
    }
  });
});
