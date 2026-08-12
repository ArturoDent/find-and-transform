const assert = require('assert');
const path = require('path');
const vscode = require('vscode');
const testHelpers = require('../testHelpers');
const { parseSelectionMarkers, sortSelectionsByPosition } = testHelpers;

// Exercises the "cursorMoveSelect" argument of findInCurrentFile end-to-end, across
// every restrictFind mode that supports it (document/line/once.../selections) - see
// README.md's "Using the cursorMoveSelect argument" section. One editor tab is opened
// for the whole suite; each test loads its own starting fixture (with |/[...]/{...}
// selection markers - see testHelpers.parseSelectionMarkers) into that shared document,
// instead of reopening/closing an editor per test.
suite('cursorMoveSelect', () => {

  let document;
  let editor;

  suiteSetup(async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
    if (extension && !extension.isActive) await extension.activate();

    // A genuinely separate untitled scratch document, not a real fixture file -
    // VS Code caches TextDocument instances per URI, so opening an actual fixture
    // path here would make it the SAME object loadFixtureWithSelections() later
    // re-opens to read "fresh" text, silently reading back its own edits instead
    // of the original file on disk.
    document = await vscode.workspace.openTextDocument({ content: '' });
    editor = await vscode.window.showTextDocument(document, { preview: false });
  });

  suiteTeardown(async () => {
    // Deliberately not reverting/closing here: `document` is an untitled scratch
    // doc with unsaved content by now - closing it would prompt "Save changes?"
    // (a real, unscriptable native dialog). The whole VS Code test instance is
    // torn down non-interactively once Mocha finishes.
  });

  /**
   * Poll the shared document's text until it matches expectedText or timeoutMs elapses,
   * then assert. Guards against the postCommands/run timing issue noted in
   * prePostCommands.js: https://github.com/microsoft/vscode/issues/190831
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

  const cases = [
    {
      name: '"line" mode, README example pattern - rule 4: only a line with a find match gets a CMS selection',
      dir: 'lineRuleFour',
      args: { find: "(trouble)", replace: "\\U$1", isRegex: true, cursorMoveSelect: "^\\s*pa[rn]am", restrictFind: "line" },
      expectedFile: 'expected.txt',
    },
    {
      name: '"line" mode, bare "^" - cursor goes to the true beginning of the line',
      dir: 'lineBareCaret',
      args: { find: "bar", replace: "REPLACED", isRegex: true, cursorMoveSelect: "^", restrictFind: "line" },
      expectedFile: 'expected.txt',
    },
    {
      name: '"line" mode, bare "$" where the replace embeds a newline - cursor goes to the true end, which may be a later physical line',
      dir: 'lineBareDollarNewline',
      args: { find: "(bar)", replace: "BAR\nEXTRA", isRegex: true, cursorMoveSelect: "$", restrictFind: "line" },
      expectedFile: 'expected.txt',
    },
    {
      name: '"onceIncludeCurrentWord", bare "^" - cursor to the start of the once-match\'s own replacement',
      dir: 'onceIncludeBareCaretDollar',
      args: { find: "trouble", replace: "difficulty", isRegex: true, cursorMoveSelect: "^", restrictFind: "onceIncludeCurrentWord" },
      expectedFile: 'expectedCaret.txt',
    },
    {
      name: '"onceIncludeCurrentWord", bare "$" - cursor to the end of the once-match\'s own replacement',
      dir: 'onceIncludeBareCaretDollar',
      args: { find: "trouble", replace: "difficulty", isRegex: true, cursorMoveSelect: "$", restrictFind: "onceIncludeCurrentWord" },
      expectedFile: 'expectedDollar.txt',
    },
    {
      name: '"onceExcludeCurrentWord", compound pattern matching multiple times - only the first match is kept',
      dir: 'onceExcludeFirstMatchOnly',
      args: { find: "dog", replace: "DOG", isRegex: true, cursorMoveSelect: "cat", restrictFind: "onceExcludeCurrentWord" },
      expectedFile: 'expected.txt',
    },
    {
      name: '"selections" mode, literal pattern - rule 1: only selections with a find match get a CMS selection',
      dir: 'selectionsLiteralRuleOne',
      args: { find: "^(this)", replace: "\\U$1", isRegex: true, matchCase: true, restrictFind: "selections", cursorMoveSelect: "THIS" },
      expectedFile: 'expected.txt',
    },
    {
      name: '"selections" mode, bare "^" - lands on the anchor (opposite the original cursor), directional per selection',
      dir: 'selectionsBareDirectional',
      args: { find: "(abc)", replace: "ABC", isRegex: true, restrictFind: "selections", cursorMoveSelect: "^" },
      expectedFile: 'expectedCaret.txt',
    },
    {
      name: '"selections" mode, bare "$" - lands on the active point (where the cursor was), directional per selection',
      dir: 'selectionsBareDirectional',
      args: { find: "(abc)", replace: "ABC", isRegex: true, restrictFind: "selections", cursorMoveSelect: "$" },
      expectedFile: 'expectedDollar.txt',
    },
    {
      name: '"document" mode (default restrictFind) - rule 3: CMS only matches within a find match\'s own replacement, not coincidental text elsewhere',
      dir: 'documentRuleThree',
      args: { find: "(trouble)", replace: "FIXEDparam", isRegex: true, cursorMoveSelect: "param", restrictFind: "document" },
      expectedFile: 'expected.txt',
    },
    {
      name: 'find but no replace - cursorMoveSelect is ignored entirely, selections are the plain find matches',
      dir: 'noReplaceIgnored',
      args: { find: "trouble", isRegex: true, cursorMoveSelect: "^" },
      expectedFile: 'expected.txt',
    },
  ];

  cases.forEach(({ name, dir, args, expectedFile }) => {
    test(`cursorMoveSelect: ${name}`, async function () {
      this.timeout(10000);

      editor = await testHelpers.loadFixtureWithSelections(document, path.resolve(__dirname, dir, 'input.txt'));

      const expectedRaw = (await vscode.workspace.openTextDocument(
        vscode.Uri.file(path.resolve(__dirname, dir, expectedFile))
      )).getText();
      const { text: expectedText, selections: expectedSelections } = parseSelectionMarkers(expectedRaw);

      await vscode.commands.executeCommand('findInCurrentFile', args);

      await assertEventualText(expectedText);
      assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), sortSelectionsByPosition(expectedSelections));
    });
  });
});
