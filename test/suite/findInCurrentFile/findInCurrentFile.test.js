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

  // Both cases share the same input.txt, where "someWord-A" and "someWord-B" are
  // separated by a newline plus indentation rather than a single literal space.
  // ignoreWhiteSpace: true turns that whitespace run into `\s*` (which matches
  // across the newline), so the pair is found and replaced; ignoreWhiteSpace:
  // false/omitted leaves the literal single space in the find pattern, which
  // cannot match a newline, so the document comes out unchanged.
  const ignoreWhiteSpaceCases = [
    {
      name: 'true - matches across the newline/indentation between the words',
      args: { find: "someWord-A someWord-B", replace: "MATCHED", isRegex: true, ignoreWhiteSpace: true },
      expectedFixture: 'ignoreWhiteSpace/expected.txt',
    },
    {
      name: 'false - literal space in the find does not match a newline, nothing changes',
      args: { find: "someWord-A someWord-B", replace: "MATCHED", isRegex: true, ignoreWhiteSpace: false },
      expectedFixture: 'ignoreWhiteSpace/input.txt',
    },
  ];

  ignoreWhiteSpaceCases.forEach(({ name, args, expectedFixture }) => {
    test(`ignoreWhiteSpace: ${name}`, async function () {
      this.timeout(10000);

      await loadFixture('ignoreWhiteSpace/input.txt');

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, expectedFixture));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());
    });
  });

  // README's "insert the fileBaseName and change to SCREAMING_SNAKE_CASE" trick: with
  // no `find` at all, the two `replace` steps run in sequence. Step 1: the cursor sits
  // alone on its own blank line, so makeFind() (resolveVariables.js) treats that as the
  // "match every empty line" case and builds an implicit `(^$)` find - which, on this
  // fixture (with no trailing newline, so `(^$)` matches only the one real blank line,
  // not a phantom empty match at end-of-file too), inserts ${fileBasenameNoExtension}
  // there. Step 2: the cursor is now left immediately after that inserted text (not
  // wrapping/selecting it), so makeFind() falls into its "nearest word at cursor"
  // branch, picks up the just-inserted word as an implicit find, and \U${1:/snakecase}
  // transforms it. Needs a real on-disk file rather than the suite's shared untitled
  // document, since ${fileBasenameNoExtension} reads the document's actual filename -
  // myTestFile.txt's basename is what becomes MY_TEST_FILE.
  test('multipleFindReplace: insert ${fileBasenameNoExtension} at a non-word cursor and SCREAMING_SNAKE_CASE it', async function () {
    this.timeout(10000);

    const fixtureUri = vscode.Uri.file(path.resolve(__dirname, 'multipleFindReplace/myTestFile.txt'));
    const fixtureDocument = await vscode.workspace.openTextDocument(fixtureUri);
    const fixtureEditor = await vscode.window.showTextDocument(fixtureDocument, { preview: false });

    // line 1 (0-based) is blank - definitely not on a word
    fixtureEditor.selection = new vscode.Selection(1, 0, 1, 0);

    const expectedUri = vscode.Uri.file(path.resolve(__dirname, 'multipleFindReplace/expected.txt'));
    const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

    try {
      const args = {
        replace: ["${fileBasenameNoExtension}", "\\U${1:/snakecase}"],
        isRegex: true,
      };

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText(), 3000, fixtureDocument);
    } finally {
      // revert the real on-disk fixture file's unsaved edits and close it, so the
      // fixture stays pristine on disk and closing doesn't prompt "Save changes?"
      await vscode.commands.executeCommand('workbench.action.files.revert');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
  });

  // README's "restrictFind: matchAroundCursor" example: the cursor just needs to be
  // somewhere inside the find match (here, inside the "stuff" line, nowhere near the
  // <Element>/</Element> tags themselves) for the whole surrounding <Element>...</Element>
  // block to be found and both tag-name capture groups uppercased.
  test('matchAroundCursor: cursor inside the block capitalizes both <Element> tag names', async function () {
    this.timeout(10000);

    await loadFixture('matchAroundCursor/input.txt');

    const expectedUri = vscode.Uri.file(path.resolve(__dirname, 'matchAroundCursor/expected.txt'));
    const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

    // line 1 ("  stuff") - well inside the matched block, nowhere near either tag
    editor.selection = new vscode.Selection(1, 4, 1, 4);

    const args = {
      find: "<(Element)(>[\\s\\n\\S]*?<\\/)(Element)>",
      isRegex: true,
      replace: "<\\U$1$2\\U$3>",
      restrictFind: "matchAroundCursor",
    };

    await vscode.commands.executeCommand('findInCurrentFile', args);
    await assertEventualText(expectedDocument.getText());
  });

  // README's "Running multiple finds and replaces with a single keybinding or setting"
  // section. All four cases share the same "load fixture, run args, assert text" shape;
  // only the find/replace array shapes (and thus which rule they demonstrate) differ.
  const multipleFindReplaceCases = [
    {
      // README l.560-568: equal-length find/replace arrays - each find is paired with
      // its own replace. Note "more trouble" itself contains the substring "trouble",
      // so step 1's document-wide "(trouble)" already uppercases the "trouble" inside
      // "more trouble" too (to "more TROUBLE") before step 2 ever runs; step 2 then
      // case-insensitively matches "(more trouble)" against that already-partly-upper
      // text and \u only capitalizes the first letter of whatever it captured - so the
      // final result is "More TROUBLE", not the "More trouble" the README's comment
      // suggests (which would only hold if the two find patterns' matches never
      // overlapped).
      name: 'array find + array replace (l.560): each find paired with its own replace',
      dir: 'arrayFindArrayReplace',
      args: { find: ["(trouble)", "(more trouble)"], replace: ["\\U$1", "\\u$1"], isRegex: true },
    },
    {
      // README l.574-586: more finds than replaces - the last replace ("\\U$1") is
      // reused for the second find. Here the overlap between "(trouble)" and
      // "(more trouble)" doesn't change the outcome, since \\U fully uppercases the
      // whole captured group either way, so re-uppercasing an already-uppercased
      // "more TROUBLE" still yields "MORE TROUBLE" - matching the README's comment.
      name: 'more finds than replaces (l.574-586): the last replace is reused',
      dir: 'moreFindsThanReplaces',
      args: { find: ["(trouble)", "(more trouble)"], replace: "\\U$1", isRegex: true },
    },
    {
      // README l.590-603: more replaces than finds - after the first "(trouble)"/\\U$1
      // pass uppercases and selects every "trouble", the second replace has no find of
      // its own, so one gets built from the current (now all-"TROUBLE") selections and
      // reused. \\u only forces the first captured character to uppercase and leaves
      // the rest as captured, so applying it to an already-fully-uppercase "TROUBLE" is
      // a visual no-op - the text stays "TROUBLE" (this still proves the "find carried
      // over from the prior replace's selection" mechanism actually ran).
      name: 'more replaces than finds (l.590-603): the extra replace reuses a find built from the prior selection',
      dir: 'moreReplacesThanFinds',
      args: { find: "(trouble)", replace: ["\\U$1", "\\u$1"], isRegex: true },
    },
    {
      // README l.616-623: "someWord" -> "SOMEWORD" on pass 1, then (matchCase: true, so
      // case-sensitive) pass 2 finds the literal "WORD" substring inside "SOMEWORD" and
      // replaces just that portion with "-word", giving "SOME-word" overall.
      name: 'case-sensitive second find matches only the WORD substring (l.616-623)',
      dir: 'someWordWord',
      args: { find: ["(someWord)", "(WORD)"], replace: ["\\U$1", "-\\L$1"], isRegex: true, matchCase: true },
    },
  ];

  multipleFindReplaceCases.forEach(({ name, dir, args }) => {
    test(`multipleFindReplace: ${name}`, async function () {
      this.timeout(10000);

      await loadFixture(`multipleFindReplace/${dir}/input.txt`);

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, `multipleFindReplace/${dir}/expected.txt`));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());
    });
  });

  // README l.608-614: "find": ["(${relativeFile})", "(${fileExtname})"], "replace":
  // ["\\U$1", ""] - pass 1 uppercases the whole filename, pass 2 removes the extension.
  // The test harness now opens the repo itself as the workspace folder (test/runTest.js)
  // specifically so ${relativeFile} resolves to a short forward-slash path relative to
  // it, rather than the raw absolute Windows fsPath - a raw fsPath contains backslashes
  // that, embedded unescaped into an isRegex find, can misparse as regex escapes (e.g.
  // \f as a form-feed) and silently fail to match. The fixture's starting content and
  // the expected result are both built from that real, on-disk relative path at test
  // time (via the same workspace.asRelativePath() the extension itself uses) rather
  // than a committed fixture file, since the exact relative path depends on where this
  // fixture lives in the repo.
  test('multipleFindReplace: ${relativeFile}/${fileExtname} as a self-referential find (l.608-614)', async function () {
    this.timeout(10000);

    const subjectUri = vscode.Uri.file(path.resolve(__dirname, 'multipleFindReplace/relativeFileFileExtname/subject.txt'));
    const subjectDocument = await vscode.workspace.openTextDocument(subjectUri);
    const subjectEditor = await vscode.window.showTextDocument(subjectDocument, { preview: false });

    const relativePath = vscode.workspace.asRelativePath(subjectDocument.uri, false);
    const uppercasedPath = relativePath.toLocaleUpperCase();
    const expectedText = uppercasedPath.slice(0, -'.TXT'.length);

    const fullRange = new vscode.Range(subjectDocument.positionAt(0), subjectDocument.positionAt(subjectDocument.getText().length));
    await subjectEditor.edit(editBuilder => editBuilder.replace(fullRange, relativePath));

    try {
      const args = {
        find: ["(${relativeFile})", "(${fileExtname})"],
        replace: ["\\U$1", ""],
        isRegex: true,
      };

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedText, 3000, subjectDocument);
    } finally {
      await vscode.commands.executeCommand('workbench.action.files.revert');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
  });

  // README l.639-648: the ${getDocumentText}/${getTextLines:...} variables. Each case
  // finds a unique "HERE" placeholder and replaces it with the variable's resolved
  // value, so the inserted text itself proves what the variable actually returned.
  // resolveVariables() runs before the edit is applied, so these always read the
  // fixture's ORIGINAL (pre-replace) text, never text ${getDocumentText}/getTextLines
  // themselves just inserted.
  const getDocumentTextCases = [
    {
      // ${getDocumentText}: the entire document's text, verbatim - including "HERE"
      // itself, since the whole document is captured before the edit runs.
      name: '${getDocumentText} (l.639): entire document text',
      dir: 'wholeDocument',
      args: { find: "HERE", replace: "${getDocumentText}" },
    },
    {
      // ${getTextLines:n}: a single 0-based line's text - line 1 is "one".
      name: '${getTextLines:n} (l.641): a single 0-based line',
      dir: 'singleLine',
      args: { find: "HERE", replace: "${getTextLines:1}" },
    },
    {
      // ${getTextLines:n-p}: lines n through p inclusive - lines 1-3 are "one"/"two"/"three".
      name: '${getTextLines:n-p} (l.643): a line range, inclusive',
      dir: 'lineRange',
      args: { find: "HERE", replace: "${getTextLines:1-3}" },
    },
    {
      // ${getTextLines:(n-p)}: the parenthesized form evaluates n-p as math first (here
      // 5-2=3) and returns that ONE line's text ("three") - not a range like the
      // unparenthesized n-p form above.
      name: '${getTextLines:(n-p)} (l.645): parentheses do math first, then return that one line',
      dir: 'lineMath',
      args: { find: "HERE", replace: "${getTextLines:(5-2)}" },
    },
    {
      // ${getTextLines:n,p,q,r}: from line n column p through line q column r, inclusive -
      // line 1 col 4 ("two three") through line 3 col 5 ("seven").
      name: '${getTextLines:n,p,q,r} (l.648): a line+column range, inclusive',
      dir: 'lineColumnRange',
      args: { find: "HERE", replace: "${getTextLines:1,4,3,5}" },
    },
  ];

  getDocumentTextCases.forEach(({ name, dir, args }) => {
    test(`getDocumentText: ${name}`, async function () {
      this.timeout(10000);

      await loadFixture(`getDocumentText/${dir}/input.txt`);

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, `getDocumentText/${dir}/expected.txt`));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());
    });
  });

  // README l.696-759: ${getInput} pops a real input box (window.showInputBox) - rather
  // than actually driving that (which would hang the test run with no way to dismiss
  // it, same concern already called out in resolveVariables.test.js for named
  // scripts), each case below stubs vscode.window.showInputBox for the duration of one
  // test so ${getInput} resolves immediately to controlled, known text. Confirmed via a
  // throwaway probe that this genuinely intercepts the real utilities.getInput() code
  // path (not a shortcut around it), and that multiple ${getInput}s in one string each
  // consume their own queued value in call order.
  /**
   * Temporarily stub vscode.window.showInputBox so ${getInput} resolves to each of
   * `values` in turn (one per call) instead of popping a real, blocking input box.
   * @param {string[]} values
   * @returns {() => void} call to restore the original showInputBox
   */
  function stubGetInput(values) {
    const original = vscode.window.showInputBox;
    let index = 0;
    vscode.window.showInputBox = async () => values[index++];
    return () => { vscode.window.showInputBox = original; };
  }

  test('getInput: ${getInput} as the entire find value (l.702)', async function () {
    this.timeout(10000);

    await loadFixture('getInput/plainFind/input.txt');
    const expectedDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'getInput/plainFind/expected.txt')));

    const restore = stubGetInput(['trouble']);
    try {
      await vscode.commands.executeCommand('findInCurrentFile', { find: "${getInput}", replace: "FOUND" });
      await assertEventualText(expectedDocument.getText());
    } finally {
      restore();
    }
  });

  test('getInput: multiple ${getInput}s in one find, each gets its own input, \\U applies to the second (l.704)', async function () {
    this.timeout(10000);

    await loadFixture('getInput/multipleInOneFind/input.txt');
    const expectedDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'getInput/multipleInOneFind/expected.txt')));

    const restore = stubGetInput(['abc', 'trouble']);
    try {
      await vscode.commands.executeCommand('findInCurrentFile', { find: "${getInput} stuff \\U${getInput}", replace: "FOUND" });
      await assertEventualText(expectedDocument.getText());
    } finally {
      restore();
    }
  });

  test('getInput: plain text mixed with ${getInput} in the find (l.707)', async function () {
    this.timeout(10000);

    await loadFixture('getInput/mixedTextFind/input.txt');
    const expectedDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'getInput/mixedTextFind/expected.txt')));

    const restore = stubGetInput(['APPLE']);
    try {
      await vscode.commands.executeCommand('findInCurrentFile', { find: "before ${getInput} after", replace: "FOUND" });
      await assertEventualText(expectedDocument.getText());
    } finally {
      restore();
    }
  });

  test('getInput: ${getInput} inside a jsOp find, treated as a string (l.710)', async function () {
    this.timeout(10000);

    await loadFixture('getInput/jsOpFind/input.txt');
    const expectedDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'getInput/jsOpFind/expected.txt')));

    const restore = stubGetInput(['start']);
    try {
      await vscode.commands.executeCommand('findInCurrentFile', {
        find: "$${return '${getInput}' + 'end';}$$",
        replace: "FOUND",
      });
      await assertEventualText(expectedDocument.getText());
    } finally {
      restore();
    }
  });

  test('getInput: wrapped in a capture group and reused via $1 in replace (l.712-715)', async function () {
    this.timeout(10000);

    await loadFixture('getInput/captureGroupReplace/input.txt');
    const expectedDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'getInput/captureGroupReplace/expected.txt')));

    const restore = stubGetInput(['trouble']);
    try {
      await vscode.commands.executeCommand('findInCurrentFile', {
        find: "(${getInput})",
        isRegex: true,
        replace: "\\U$1",
      });
      await assertEventualText(expectedDocument.getText());
    } finally {
      restore();
    }
  });

  test('getInput: input text mixed into other replace text (l.721)', async function () {
    this.timeout(10000);

    await loadFixture('getInput/mixedTextReplace/input.txt');
    const expectedDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'getInput/mixedTextReplace/expected.txt')));

    const restore = stubGetInput(['wonderful']);
    try {
      await vscode.commands.executeCommand('findInCurrentFile', { find: "HERE", replace: "${getInput} is my replacement" });
      await assertEventualText(expectedDocument.getText());
    } finally {
      restore();
    }
  });

  test('getInput: unquoted (numeric) ${getInput} used in arithmetic with ${lineNumber} inside a jsOp replace (l.727)', async function () {
    this.timeout(10000);

    await loadFixture('getInput/jsOpReplaceWithLineNumber/input.txt');
    const expectedDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'getInput/jsOpReplaceWithLineNumber/expected.txt')));

    // "HERE" is on line index 1 (0-based) -> ${lineNumber} (1-based) is 2 -> 3 * 2 = 6
    const restore = stubGetInput(['3']);
    try {
      await vscode.commands.executeCommand('findInCurrentFile', {
        find: "HERE",
        replace: "$${return ${getInput} * ${lineNumber};}$$",
      });
      await assertEventualText(expectedDocument.getText());
    } finally {
      restore();
    }
  });

  test('getInput: cursorMoveSelect: "${getInput}" selects the just-inserted input text (l.755)', async function () {
    this.timeout(10000);

    await loadFixture('getInput/cursorMoveSelectInput/input.txt');
    const expectedDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'getInput/cursorMoveSelectInput/expected.txt')));

    // one call for `replace`, one call for `cursorMoveSelect` - same value both times
    // so cursorMoveSelect's own ${getInput} resolves to text that actually matches
    // what replace just inserted
    const restore = stubGetInput(['SELECTME', 'SELECTME']);
    try {
      await vscode.commands.executeCommand('findInCurrentFile', {
        find: "HERE",
        replace: "${getInput}",
        cursorMoveSelect: "${getInput}",
      });
      await assertEventualText(expectedDocument.getText());

      const expectedSelection = new vscode.Selection(0, 'prefix '.length, 0, 'prefix '.length + 'SELECTME'.length);
      assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), sortSelectionsByPosition([expectedSelection]));
    } finally {
      restore();
    }
  });

  // README l.934-976: conditional replacements. Most cases share the same
  // find: "(First)|(Second)|(Third)" (only one alternative's capture group is ever
  // defined per match) and input.txt "[First] [Second] [Third]" - wrapping each token
  // in brackets keeps an empty/false-branch result ("[]") visible and unambiguous in
  // the fixture, rather than relying on fragile trailing/embedded whitespace that an
  // editor's "trim trailing whitespace on save" could silently corrupt.
  const conditionalReplacementsCases = [
    {
      // ${1:+text} (l.934, l.949-style): text is added only when group 1 matched -
      // "First" gets it, "Second"/"Third" (group 1 undefined for those matches) get "".
      name: '${1:+text} (l.934): text added only if the group matched',
      dir: 'ifOnly',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "${1:+YES1}" },
    },
    {
      // ${3:-text} (l.935, l.949): text added only when group 3 did NOT match -
      // "First"/"Second" (group 3 undefined) get it, "Third" (group 3 matched) gets "".
      name: '${3:-text} (l.935): else form with the dash',
      dir: 'elseOnly',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "${3:-yada3}" },
    },
    {
      // ${3:text} (l.936): same else behavior with the dash omitted - identical result
      // to the previous case, proving the two syntaxes are equivalent.
      name: '${3:text} (l.936): else form with the dash omitted, same result as ${3:-text}',
      dir: 'elseOnly',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "${3:yada3}" },
    },
    {
      // ${2:?yes:no} (l.937, l.964): if/else - "Second" (group 2 matched) gets "yes",
      // "First"/"Third" (group 2 undefined) get "no".
      name: '${2:?yes:no} (l.937): if/else conditional',
      dir: 'ifElse',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "${2:?yada2:yada3}" },
    },
    {
      // Backtick-wrapped group refs inside conditional text (l.951-952). $2 resolves
      // (and \U uppercases it) via the same general case-modifier pipeline used
      // everywhere else - but the backtick-stripping regex in
      // _checkForCaptureGroupsInConditionalReplacement (resolveVariables.js) only
      // matches a BARE `$N` between backticks (no modifier in front), so with a `\U`
      // inside them the backticks themselves are left in the output as literal
      // characters: "First" (group 2 undefined) still resolves cleanly to "" without
      // erroring even though the true-branch text references $2.
      name: 'backtick-wrapped `\\U$2` inside conditional text: $2 resolves, but the backticks survive as literal text (l.951-952)',
      dir: 'backtickGroupRef',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "${2:+abcd `\\U$2` efgh}" },
    },
    {
      // Double-escaped \\} for a literal closing brace inside conditional text
      // (l.954): the conditional's own closing "}" is still found correctly after it.
      name: 'double-escaped \\\\} is a literal } inside conditional text (l.954)',
      dir: 'escapedBrace',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "${1:+aaa\\}bbb}" },
    },
    {
      // \\U applied to the WHOLE conditional (l.956): wraps and uppercases the
      // conditional's entire resolved output, not just a capture group inside it.
      name: '\\\\U applied to the whole conditional, not just a capture group (l.956)',
      dir: 'caseModifierWholeConditional',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "\\U${1:+aaa-bbb}" },
    },
    {
      // Multiple conditionals concatenated in one replace (l.958): each is
      // independently true/false per match, and each may reference its own group.
      name: 'multiple conditionals concatenated in one replace (l.958)',
      dir: 'multipleConditionalsCombo',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "${1:+*`$1``$1`*}${2:+*`$2``$2`*}" },
    },
    {
      // Regression test: a bare (non-backtick) case-modified capture group
      // like \U$1 sits immediately before the conditional's own closing
      // "}", with nothing between the digit and the brace.
      // capGroupCaseModifierRE's braces must be paired (both present or
      // both absent), not independently optional - otherwise the closing
      // brace gets swallowed as if it belonged to the $1 reference.
      name: '${1:+\\U$1}: bare \\U$1 immediately before the conditional\'s closing } must not swallow that }',
      dir: 'caseModifierBareGroupBeforeClose',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "${1:+\\U$1}" },
    },
    {
      // Regression test: a bare (non-braced) case-modified capture group
      // like \U$3 immediately followed by the enclosing if/else
      // conditional's own ":" divider (as in ${2:?\U$3:\U$1}) must still
      // resolve the case modifier, not get skipped by
      // capGroupCaseModifierRE's (?!:) lookahead.
      name: '${2:?\\U$3:\\U$1}: bare \\U$N immediately before the if/else "?:" divider must still resolve',
      dir: 'caseModifierBareGroupBeforeColon',
      args: { find: "(matched) (then) (not)", isRegex: true, replace: "${2:?\\U$3:\\U$1}" },
    },
    {
      // $0 as the whole match (l.960): not conditional itself, but part of the same
      // examples block - reinserts the entire matched text unchanged.
      name: '$0 as a replacement (l.960): the whole match, unchanged',
      dir: 'wholeMatch',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "[$0]" },
    },
    {
      // "" as a replacement (l.962, l.976): deletes every match immediately, as part
      // of the same edit as the find (findInCurrentFile-specific; runInSearchPanel's
      // "" behaves differently, see searchInPanel.md).
      name: '"" as a replacement (l.962, l.976): deletes matches immediately',
      dir: 'emptyReplaceDeletes',
      args: { find: "(First)|(Second)|(Third)", isRegex: true, replace: "" },
    },
  ];

  conditionalReplacementsCases.forEach(({ name, dir, args }) => {
    test(`conditionalReplacements: ${name}`, async function () {
      this.timeout(10000);

      await loadFixture(`conditionalReplacements/${dir}/input.txt`);

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, `conditionalReplacements/${dir}/expected.txt`));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());
    });
  });

  // ${2:?`$3`:`$1`} (l.967): the if/else branches are themselves capture-group
  // references (not literal text). Needs a find where a middle group is genuinely
  // optional rather than a mutually-exclusive alternation, so both branches are
  // reachable from real matches: "hello" has no "-YES-" suffix (group 2 undefined,
  // so the else branch `$1` = "hello" is used); "hello-YES-world" does match the
  // suffix (group 2 defined, so the if branch `$3` = "world" is used instead).
  test('conditionalReplacements: ${2:?`$3`:`$1`} (l.967): if/else branches are capture-group references', async function () {
    this.timeout(10000);

    await loadFixture('conditionalReplacements/ifElseGroupRefs/input.txt');

    const expectedUri = vscode.Uri.file(path.resolve(__dirname, 'conditionalReplacements/ifElseGroupRefs/expected.txt'));
    const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

    const args = {
      find: "(\\w+)(-YES-(\\w+))?",
      isRegex: true,
      replace: "[${2:?`$3`:`$1`}]",
    };

    await vscode.commands.executeCommand('findInCurrentFile', args);
    await assertEventualText(expectedDocument.getText());
  });

  // README l.980-1038: snippet-like transforms (${n:/upcase} etc.) usable in `replace`.
  // Cases A-F share the "load fixture, run args, assert text" shape.
  const snippetTransformsCases = [
    {
      name: '${1:/upcase} (l.983): same as \\U$1',
      dir: 'upcase',
      args: { find: "(hello)", isRegex: true, replace: "${1:/upcase}" },
    },
    {
      name: '${2:/downcase} (l.984): same as \\L$1, and drops group 1 (not referenced)',
      dir: 'downcase',
      args: { find: "(x)(HELLO)", isRegex: true, replace: "${2:/downcase}" },
    },
    {
      name: '${3:/capitalize} (l.985): same as \\u$1',
      dir: 'capitalize',
      args: { find: "(x)(y)(hello)", isRegex: true, replace: "${3:/capitalize}" },
    },
    {
      // l.987-988: both underscore-separated and space-separated input produce the
      // same PascalCase result - this only holds after fixing utilities.toPascalCase()
      // to also split on whitespace (it previously only split on `[-_]`/before an
      // uppercase letter, so "first second third" only got its first letter
      // capitalized instead of becoming "FirstSecondThird").
      name: '${1:/pascalcase} (l.987-988): both underscore- and space-separated input convert the same way',
      dir: 'pascalcase',
      args: { find: "([\\w ]+)", isRegex: true, replace: "${1:/pascalcase}" },
    },
    {
      name: '${1:/camelcase} (l.990-991): both underscore- and space-separated input convert the same way',
      dir: 'camelcase',
      args: { find: "([\\w ]+)", isRegex: true, replace: "${1:/camelcase}" },
    },
    {
      name: '${1:/snakecase} (l.993-994): camelCase input only, per the README\'s own caveat',
      dir: 'snakecase',
      args: { find: "(\\w+)", isRegex: true, replace: "${1:/snakecase}" },
    },
    {
      name: '${1:/kebabcase}: underscore-, space-, and camelCase-style input all convert the same way',
      dir: 'kebabcase',
      args: { find: "([\\w ]+)", isRegex: true, replace: "${1:/kebabcase}" },
    },
  ];

  snippetTransformsCases.forEach(({ name, dir, args }) => {
    test(`snippetTransforms: ${name}`, async function () {
      this.timeout(10000);

      await loadFixture(`snippetTransforms/${dir}/input.txt`);

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, `snippetTransforms/${dir}/expected.txt`));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());
    });
  });

  // README l.999-1024: the "one match at a time" combined example - restrictFind:
  // "nextSelect" processes a single match per invocation (advancing from the current
  // cursor/selection), combining a conditional (${1:+...}) with per-group case
  // transforms (${2:/upcase}, ${3:/downcase}). Only fires correctly on undefined
  // groups since the _applyCaseTransform fix above (previously "${2:/upcase}" on an
  // unmatched group 2 inserted the literal text "undefined" into the document).
  // Running the same command three times in sequence walks through all three matches.
  // The starting cursor is placed at the END of the document rather than the start:
  // previousNext.js explicitly skips a match whose start coincides with the cursor
  // ("consider cursorIndex+1 to skip 0-index match"), so a cursor sitting at (0,0) -
  // exactly where "first" begins - would skip straight to "Second". Starting at the
  // end instead makes the first invocation wrap around to "first", which also matches
  // the wrap-around behavior the README documents elsewhere for nextSelect (l.1307-1308).
  test('snippetTransforms: combined conditional + per-group transforms with restrictFind: nextSelect (l.1001-1013)', async function () {
    this.timeout(10000);

    await loadFixture('snippetTransforms/combinedNextSelect/input.txt');
    const endOfDoc = document.positionAt(document.getText().length);
    editor.selection = new vscode.Selection(endOfDoc, endOfDoc);

    const args = {
      find: "(first)|(Second)|(Third)",
      isRegex: true,
      replace: "${1:+ Found first!!}${2:/upcase}${3:/downcase}",
      restrictFind: "nextSelect",
    };

    const expected1 = (await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'snippetTransforms/combinedNextSelect/expected1.txt')))).getText();
    const expected2 = (await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'snippetTransforms/combinedNextSelect/expected2.txt')))).getText();
    const expected3 = (await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(__dirname, 'snippetTransforms/combinedNextSelect/expected3.txt')))).getText();

    await vscode.commands.executeCommand('findInCurrentFile', args);
    await assertEventualText(expected1);

    await vscode.commands.executeCommand('findInCurrentFile', args);
    await assertEventualText(expected2);

    await vscode.commands.executeCommand('findInCurrentFile', args);
    await assertEventualText(expected3);
  });

  // README l.1026-1038: transform an EXISTING occurrence of the current filename in
  // place - "find": "(${fileBasenameNoExtension})" matches the filename text already
  // present in the document (unlike the earlier "insert at a non-word cursor" trick
  // tested in multipleFindReplace), then "\\U${1:/snakecase}" SCREAMING_SNAKE_CASEs it.
  // Needs a real on-disk file, same reasoning as the earlier ${fileBasenameNoExtension}
  // test.
  test('snippetTransforms: find "(${fileBasenameNoExtension})", replace "\\\\U${1:/snakecase}" transforms an existing occurrence in place (l.1026-1038)', async function () {
    this.timeout(10000);

    const fixtureUri = vscode.Uri.file(path.resolve(__dirname, 'snippetTransforms/existingFileBasenameSnakecase/myTestFile.txt'));
    const fixtureDocument = await vscode.workspace.openTextDocument(fixtureUri);
    await vscode.window.showTextDocument(fixtureDocument, { preview: false });

    const expectedUri = vscode.Uri.file(path.resolve(__dirname, 'snippetTransforms/existingFileBasenameSnakecase/expected.txt'));
    const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

    try {
      const args = {
        find: "(${fileBasenameNoExtension})",
        isRegex: true,
        replace: "\\U${1:/snakecase}",
      };

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText(), 3000, fixtureDocument);
    } finally {
      await vscode.commands.executeCommand('workbench.action.files.revert');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
  });

  // README l.1465-1488: "${lineNumber}"/"${lineIndex}" used INSIDE `find` - a special
  // per-line mechanism (transform.js buildLineNumberMatches()) that substitutes each
  // line's own 1-based lineNumber (or 0-based lineIndex) into the find pattern before
  // matching JUST that line - so "(${lineNumber})" only matches a number that equals
  // its OWN line's number. Both fixtures include lines with an unrelated number ("99")
  // to prove those are correctly left untouched, not just that a match-on-your-own-line
  // -number can happen.
  const lineNumberIndexCases = [
    {
      // l.1476-1478: a 1 on line 1 => "found 10"; a 3 on line 3 => "found 30"; line 2's
      // "99" doesn't equal 2, so it's left alone.
      name: 'find "(${lineNumber})", replace multiplies the matched number by 10 (l.1476-1478)',
      dir: 'multiplyByTen',
      args: { find: "(${lineNumber})", isRegex: true, replace: "$${ return `found ` + ($1*10) }$$" },
    },
    {
      // l.1481-1484: a 1 on line 1 (<=5) => 1/2 = "0.5"; a 6 on line 6 (>5) => 6*2 = "12";
      // lines 2-5's "99" never equals their own line number, so they stay unchanged.
      name: 'find "(${lineNumber})", replace halves matches <=5 and doubles matches >5 (l.1481-1484)',
      dir: 'halfOrDouble',
      args: { find: "(${lineNumber})", isRegex: true, replace: "$${ if ($1 <= 5) return $1/2; else return $1*2; }$$" },
    },
  ];

  lineNumberIndexCases.forEach(({ name, dir, args }) => {
    test(`lineNumberIndex: ${name}`, async function () {
      this.timeout(10000);

      await loadFixture(`lineNumberIndex/${dir}/input.txt`);

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, `lineNumberIndex/${dir}/expected.txt`));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());
    });
  });

  // README l.1541-1585: "nearest words at cursors" - with no `find` key, the extension
  // builds one from actual selections and/or the word(s) at each cursor.
  test('noFind: a single cursor on a word selects every occurrence of that word (l.1541-1542, l.1562)', async function () {
    this.timeout(10000);

    await loadFixture('noFind/singleWordAtCursor/input.txt');
    // within "banana" - the only occurrence, so this also proves the OTHER word
    // ("apple", occurring twice) is correctly left out of the generated find
    editor.selection = new vscode.Selection(0, 8, 0, 8);

    await vscode.commands.executeCommand('findInCurrentFile', {});

    await assertEventualText('apple banana apple');  // no replace - text never changes
    const expectedSelections = [new vscode.Selection(0, 6, 0, 12)];
    assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), sortSelectionsByPosition(expectedSelections));
  });

  test('noFind: a cursor on a blank line has no nearest word - silent no-op (l.1545)', async function () {
    this.timeout(10000);

    await loadFixture('noFind/blankLineNoWord/input.txt');
    const originalSelections = [new vscode.Selection(1, 0, 1, 0)];
    editor.selections = originalSelections;

    await vscode.commands.executeCommand('findInCurrentFile', {});

    await assertEventualText('before\n\nafter');
    assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), sortSelectionsByPosition(originalSelections));
  });

  test('noFind: multiple cursors on different words select every occurrence of either word (l.1562-1564)', async function () {
    this.timeout(10000);

    await loadFixture('noFind/multipleWordsAtCursors/input.txt');
    // one cursor in the first "apple", one in "cherry" - "banana" (also present twice)
    // is never mentioned by a cursor, so it must be left out of the generated find
    editor.selections = [
      new vscode.Selection(0, 2, 0, 2),
      new vscode.Selection(0, 28, 0, 28),
    ];

    await vscode.commands.executeCommand('findInCurrentFile', {});

    await assertEventualText('apple banana apple banana cherry');
    const expectedSelections = [
      new vscode.Selection(0, 0, 0, 5),    // "apple" #1
      new vscode.Selection(0, 13, 0, 18),  // "apple" #2
      new vscode.Selection(0, 26, 0, 32),  // "cherry"
    ];
    assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), sortSelectionsByPosition(expectedSelections));
  });

  // l.1572: duplicate selected text is deduped (via Set) when building the generated
  // find - calls resolveVariables.makeFind() directly, since the resulting matches
  // would look identical either way (dedup only changes the generated find STRING
  // itself, e.g. "apple" vs the redundant "apple|apple"), so asserting on document
  // text/selections alone couldn't actually prove deduplication happened.
  test('noFind: duplicate words at multiple cursors are deduped in the generated find (l.1572)', async function () {
    this.timeout(10000);

    await loadFixture('noFind/duplicateWordsDedupe/input.txt');
    // both cursors sit in DIFFERENT occurrences of the SAME word "apple"
    editor.selections = [
      new vscode.Selection(0, 2, 0, 2),
      new vscode.Selection(0, 15, 0, 15),
    ];

    const resolveVariables = require('../../../src/resolveVariables');
    const result = await resolveVariables.makeFind(editor.selections, {});

    assert.strictEqual(result.find, 'apple');
    assert.strictEqual(result.mustBeRegex, false);
  });

  // l.1568: when `replace`/`run` uses $1 with no explicit `find`, the extension
  // auto-detects it, escapes regex-special characters in the generated find, and
  // turns isRegex on for you - so a selection full of regex-special characters still
  // matches (and replaces) itself correctly, everywhere it occurs in the document.
  test('noFind: $1 in replace auto-escapes regex-special characters in the generated find (l.1568)', async function () {
    this.timeout(10000);

    await loadFixture('noFind/dollarOneAutoEscapesRegexChars/input.txt');
    editor.selection = new vscode.Selection(0, 0, 0, 5);  // selects "a.b*c" (first occurrence)

    const expectedUri = vscode.Uri.file(path.resolve(__dirname, 'noFind/dollarOneAutoEscapesRegexChars/expected.txt'));
    const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

    await vscode.commands.executeCommand('findInCurrentFile', { replace: "[$1]" });
    await assertEventualText(expectedDocument.getText());
  });

  // l.1568 (contrast): setting isRegex: true yourself SKIPS that automatic escaping -
  // the exact same selection ("a.b*c") gets used as a literal, unescaped regex
  // pattern, which (". " = any char, "b*" = zero-or-more "b") no longer matches its
  // own source text at all, so nothing gets replaced - proving the README's warning
  // is real, not just a theoretical caveat.
  test('noFind: explicitly setting isRegex skips the auto-escaping and breaks self-matching (l.1568)', async function () {
    this.timeout(10000);

    await loadFixture('noFind/explicitIsRegexBreaksEscaping/input.txt');
    editor.selection = new vscode.Selection(0, 0, 0, 5);  // selects "a.b*c" (first occurrence)

    await vscode.commands.executeCommand('findInCurrentFile', { replace: "[$1]", isRegex: true });
    await assertEventualText('a.b*c stuff a.b*c');  // unchanged - the unescaped pattern matches nothing
  });

  // l.1574-1585: restrictFind: "nextSelect" with no `find` - the word at the cursor
  // becomes the search term, and each invocation advances to (and selects) the next
  // occurrence, wrapping back to the start once the end is reached. Run 4 times to
  // walk forward through both remaining occurrences, observe the wrap-around back to
  // the first, and confirm the cycle repeats correctly a second time.
  test('noFind: restrictFind: "nextSelect" with no find repeatedly selects the next occurrence of the word at cursor (l.1574-1585)', async function () {
    this.timeout(10000);

    await loadFixture('noFind/nextSelectRepeated/input.txt');
    // within the first "apple" (of three), not at its exact start
    editor.selection = new vscode.Selection(0, 2, 0, 2);

    const args = { matchCase: true, restrictFind: "nextSelect" };

    await vscode.commands.executeCommand('findInCurrentFile', args);
    assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), [new vscode.Selection(0, 13, 0, 18)]);  // "apple" #2

    await vscode.commands.executeCommand('findInCurrentFile', args);
    assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), [new vscode.Selection(0, 26, 0, 31)]);  // "apple" #3

    await vscode.commands.executeCommand('findInCurrentFile', args);
    assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), [new vscode.Selection(0, 0, 0, 5)]);    // wraps to "apple" #1

    await vscode.commands.executeCommand('findInCurrentFile', args);
    assert.deepStrictEqual(sortSelectionsByPosition(editor.selections), [new vscode.Selection(0, 13, 0, 18)]);  // back to "apple" #2

    await assertEventualText('apple banana apple cherry apple date');  // no replace - text never changes
  });
});
