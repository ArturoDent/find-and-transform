const assert = require('assert');
const path = require('path');
const vscode = require('vscode');
const testHelpers = require('../testHelpers');
const { sortSelectionsByPosition } = testHelpers;

// Exercises the real "findInCurrentFile" command end-to-end (find -> run jsOp ->
// clipboard -> postCommands), using args copied from real keybindings.json entries.
// One editor tab is opened for the whole suite; each test loads its own starting
// fixture text into that shared document via loadFixture(), instead of
// reopening/closing an editor per test.
suite('findInCurrentFile - run/replace', () => {

  let document;
  let editor;

  suiteSetup(async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
    if (extension && !extension.isActive) await extension.activate();

    // A genuinely separate untitled scratch document, not a real fixture file -
    // VS Code caches TextDocument instances per URI, so opening an actual
    // fixture path here would make it the SAME object loadFixture()/
    // loadFixtureWithSelections() later re-open to read "fresh" text whenever
    // that same path gets loaded a second time, silently reading back its own
    // edits instead of the original file on disk.
    document = await vscode.workspace.openTextDocument({ content: '' });
    // preview: false - otherwise this tab opens in VS Code's reused "preview" mode
    // and a later test opening another file (e.g. workbench.action.files.newUntitledFile)
    // silently replaces/closes it, breaking every test that runs after that one.
    editor = await vscode.window.showTextDocument(document, { preview: false });
  });

  suiteTeardown(async () => {
    // Deliberately not reverting/closing here: `document` is an untitled scratch
    // doc with unsaved content by now - closing it would prompt "Save changes?"
    // (a real, unscriptable native dialog, same risk as the saveAs case below).
    // The whole VS Code test instance is torn down non-interactively once Mocha
    // finishes.
  });

  /**
   * Replace the shared document's entire content with the given fixture file's text.
   * Call this at the start of each test() rather than relying on state left by
   * a previous test - each test declares its own starting fixture explicitly.
   * @param {string} fixtureFileName - filename relative to this suite's directory
   */
  async function loadFixture(fixtureFileName) {
    editor = await testHelpers.loadFixture(document, path.resolve(__dirname, fixtureFileName));
  }

  /**
   * Poll a document's text until it matches expectedText or timeoutMs elapses, then assert.
   * Guards against the runCommands/paste timing issue noted in prePostCommands.js:
   * https://github.com/microsoft/vscode/issues/190831
   * @param {string} expectedText
   * @param {number} [timeoutMs]
   * @param {import("vscode").TextDocument} [targetDocument] - defaults to the suite's shared document
   */
  async function assertEventualText(expectedText, timeoutMs = 3000, targetDocument = document) {
    /** @param {string} text */
    const normalize = (text) => text.replace(/\r\n/g, '\n');
    expectedText = normalize(expectedText);

    let actualText = normalize(targetDocument.getText());
    const deadline = Date.now() + timeoutMs;

    while (actualText !== expectedText && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      actualText = normalize(targetDocument.getText());
    }

    assert.strictEqual(actualText, expectedText);
  }

  test('builds a table of contents from ##/### headers and pastes it under the title', async function () {
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

  // Each case starts from the same input.txt but with a different initial
  // selection, to prove preserveSelections restores whatever was selected
  // beforehand - not just "wherever a match happened to leave the cursor".
  const preserveSelectionsCases = [
    {
      name: 'away from any match',
      selections: [
        new vscode.Selection(0, 17, 0, 25),  // "selected" on line 1
        new vscode.Selection(8, 17, 8, 25),  // "selected" on line 9
      ],
    },
    {
      name: 'on a blank line',
      selections: [
        new vscode.Selection(1, 0, 1, 0),  // blank line 2
      ],
    },
    {
      name: 'directly on a find match',
      selections: [
        new vscode.Selection(2, 0, 2, 5),  // "const" on line 3
      ],
    },
  ];

  preserveSelectionsCases.forEach(({ name, selections }) => {
    test(`preserveSelections: ${name}`, async function () {
      this.timeout(10000);

      await loadFixture('preserveSelections/input.txt');

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, 'preserveSelections/expected.txt'));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      editor.selections = selections;

      const args = {
        find: "(const)",
        isRegex: true,
        replace: "\\U$1",
        preserveSelections: true,
      };

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());

      assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), sortSelectionsByPosition(selections));
    });
  });

  test('new file, css, and paste', async function () {
    this.timeout(10000);

    // No loadFixture() here - this scenario creates a brand-new untitled
    // document regardless of the shared document's content, so it doesn't
    // need a starting fixture.
    const originalUri = document.uri.toString();
    const clipboardText = 'body { color: red; }';
    await vscode.env.clipboard.writeText(clipboardText);

    // workbench.action.files.saveAs is intentionally NOT exercised here - it opens
    // a real native OS dialog with no scriptable way to close it, which would hang
    // the whole test run indefinitely rather than just fail this one test.
    const args = {
      // An explicit, never-matching find, rather than omitting `find` entirely:
      // with no `find`, _buildFindArgs() auto-builds one from the shared editor's
      // current selections (resolve.makeFind()), so leftover selections from an
      // earlier test could produce real matches and silently change which
      // runWhen branch fires - a literal find guarantees zero matches regardless
      // of what any other test in this suite left selected.
      find: "zzz_never_matches_zzz",
      runWhen: "onceOnNoMatches",
      run: [
        "$${",
        "await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');",
        "let newDocument = vscode.window.activeTextEditor.document;",
        "newDocument = await vscode.languages.setTextDocumentLanguage(newDocument, 'css');",
        "await vscode.commands.executeCommand('editor.action.clipboardPasteAction');",
        "}$$",
      ],
    };

    await vscode.commands.executeCommand('findInCurrentFile', args);

    assert.ok(vscode.window.activeTextEditor);
    const newDocument = vscode.window.activeTextEditor.document;
    assert.notStrictEqual(newDocument.uri.toString(), originalUri);
    assert.strictEqual(newDocument.isUntitled, true);
    assert.strictEqual(newDocument.languageId, 'css');
    await assertEventualText(clipboardText, 3000, newDocument);

    // The new untitled tab is deliberately left open rather than closed here:
    // closing a dirty untitled document normally prompts "Save changes?", which
    // risks the same kind of blocking-dialog hang as saveAs above. The whole VS
    // Code test instance is torn down non-interactively once Mocha finishes.
  });

  // All cases share the same input.txt and restrictFind: "document"; only the
  // find/isRegex vary. "^$" and "(^$)" are confirmed to produce identical
  // output (the capture group doesn't affect matching here, since ${matchNumber}
  // doesn't reference it); isRegex false/omitted never matches the literal
  // text "^$", so the document is expected to come out unchanged.
  const matchEmptyLineCases = [
    {
      name: 'find as plain pattern (isRegex: true)',
      args: { find: "^$", isRegex: true, replace: "${matchNumber}", restrictFind: "document" },
      expectedFixture: 'matchEmptyLine/expected.txt',
    },
    {
      name: 'find wrapped in a capture group - same result',
      args: { find: "(^$)", isRegex: true, replace: "${matchNumber}", restrictFind: "document" },
      expectedFixture: 'matchEmptyLine/expected.txt',
    },
    {
      name: 'isRegex: false - nothing changes',
      args: { find: "^$", isRegex: false, replace: "${matchNumber}", restrictFind: "document" },
      expectedFixture: 'matchEmptyLine/input.txt',
    },
    {
      name: 'isRegex omitted (defaults to false) - nothing changes',
      args: { find: "^$", replace: "${matchNumber}", restrictFind: "document" },
      expectedFixture: 'matchEmptyLine/input.txt',
    },
  ];

  matchEmptyLineCases.forEach(({ name, args, expectedFixture }) => {
    test(`matchEmptyLine: ${name}`, async function () {
      this.timeout(10000);

      await loadFixture('matchEmptyLine/input.txt');

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, expectedFixture));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());
    });
  });
});
