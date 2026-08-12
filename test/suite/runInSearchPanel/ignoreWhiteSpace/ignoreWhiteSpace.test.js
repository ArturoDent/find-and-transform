const assert = require('assert');
const vscode = require('vscode');
const search = require('../../../../src/search');

// buildSearchArgs() builds the Search panel's query from indexedArgs.find, collapsing
// whitespace into `\s*` only when ignoreWhiteSpace is set - mirrors the shape
// runAllSearches()'s _expandArgs() actually produces: ignoreWhiteSpace: true expands to
// an array of trues, but a false/omitted flag never gets expanded into an array at all
// (see _expandArgs()'s `args[key] || args[key] === ""` guard), so it arrives here as
// undefined rather than [false].
suite('runInSearchPanel - ignoreWhiteSpace', () => {

  let document;

  suiteSetup(async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
    if (extension && !extension.isActive) await extension.activate();

    document = await vscode.workspace.openTextDocument({ content: '' });
    await vscode.window.showTextDocument(document, { preview: false });
  });

  test('ignoreWhiteSpace: true collapses whitespace runs in the find into \\s* for the search query', async () => {
    const args = { find: ['someWord-A   someWord-B'], replace: [''], isRegex: [true], ignoreWhiteSpace: [true] };
    const result = await search.buildSearchArgs(args, 0);

    assert.strictEqual(result.query, '\\n{0}someWord-A\\s*someWord-B');
  });

  test('ignoreWhiteSpace omitted (false) leaves whitespace in the find untouched', async () => {
    const args = { find: ['someWord-A   someWord-B'], replace: [''], isRegex: [true] };
    const result = await search.buildSearchArgs(args, 0);

    assert.strictEqual(result.query, 'someWord-A   someWord-B');
  });
});
