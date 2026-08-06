const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

// Exercises the real "findInCurrentFile" command end-to-end (find -> run jsOp ->
// clipboard -> postCommands), using args copied from real keybindings.json entries.
// One editor tab is opened for the whole suite; each test loads its own starting
// fixture text into that shared document via loadFixture(), instead of
// reopening/closing an editor per test.
suite('findInCurrentFile - keybinding integration', () => {

  let document;
  let editor;

  suiteSetup(async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
    if (extension && !extension.isActive) await extension.activate();

    const fixtureUri = vscode.Uri.file(path.resolve(__dirname, 'markdownToc/input.md'));
    document = await vscode.workspace.openTextDocument(fixtureUri);
    editor = await vscode.window.showTextDocument(document);
  });

  suiteTeardown(async () => {
    if (document.isDirty) await vscode.commands.executeCommand('workbench.action.files.revert');
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  /**
   * Replace the shared document's entire content with the given fixture file's text.
   * Call this at the start of each test() rather than relying on state left by
   * a previous test - each test declares its own starting fixture explicitly.
   * @param {string} fixtureFileName - filename relative to this suite's directory
   */
  async function loadFixture(fixtureFileName) {
    const fixtureUri = vscode.Uri.file(path.resolve(__dirname, fixtureFileName));
    const fixtureDocument = await vscode.workspace.openTextDocument(fixtureUri);
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    await editor.edit(editBuilder => editBuilder.replace(fullRange, fixtureDocument.getText()));
  }

  /**
   * Poll document text until it matches expectedText or timeoutMs elapses, then assert.
   * Guards against the runCommands/paste timing issue noted in prePostCommands.js:
   * https://github.com/microsoft/vscode/issues/190831
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

  test('alt+i: builds a table of contents from ##/### headers and pastes it under the title', async function () {
    this.timeout(10000);

    await loadFixture('markdownToc/input.md');

    const expectedUri = vscode.Uri.file(path.resolve(__dirname, 'markdownToc/expected.md'));
    const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

    const args = {
      find: "(?<=^###? )(.*)$",
      run: [
        "$${",
        "const headers = vscode.window.activeTextEditor.selections;",
        "let str = '';",
        "headers.forEach(header => {",
        "const selectedHeader = document.getText(header);",
        "str += `* [${selectedHeader}](#${selectedHeader.toLocaleLowerCase().split(' ').join('-')})\\n`;",
        "});",
        "str = str.slice(0, -1);",
        "vscode.env.clipboard.writeText(str);",
        "}$$"
      ],
      isRegex: true,
      postCommands: [
        "cursorTop",
        "editor.action.insertLineAfter",
        "editor.action.insertLineAfter",
        "editor.action.clipboardPasteAction"
      ]
    };

    await vscode.commands.executeCommand('findInCurrentFile', args);
    await assertEventualText(expectedDocument.getText());
  });
});
