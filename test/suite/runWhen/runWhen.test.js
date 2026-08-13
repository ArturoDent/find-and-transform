const assert = require('assert');
const path = require('path');
const vscode = require('vscode');
const testHelpers = require('../testHelpers');

// Exercises the "run"/"runWhen" arguments of findInCurrentFile end-to-end, across all
// 4 runWhen values (onceIgnoreMatches/onceIfAMatch/onEveryMatch/onceOnNoMatches) - see
// src/transform.js's exports.runWhen(). One editor tab is opened for the whole suite;
// each test loads its own starting fixture into that shared document via loadFixture(),
// instead of reopening/closing an editor per test.
//
// Every args object below deliberately OMITS `replace` entirely (never `replace: ""`):
// with `find` set and no `replace`, parseCommands.js routes to
// findAndSelect.findAndSelect(), which has no zero-match early return anywhere -
// whereas document.js (used whenever `replace` is present) returns early at
// `if (!foundMatches.length) return;` BEFORE ever reaching the runWhen dispatch, so
// onceIgnoreMatches/onceOnNoMatches would silently never fire from that path.
suite('runWhen', () => {

  let document;
  let editor;

  suiteSetup(async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
    if (extension && !extension.isActive) await extension.activate();

    // A genuinely separate untitled scratch document, not a real fixture file -
    // VS Code caches TextDocument instances per URI, so opening an actual
    // fixture path here would make it the SAME object loadFixture() later
    // re-opens to read "fresh" text whenever that same path gets loaded a
    // second time, silently reading back its own edits instead of the
    // original file on disk.
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
   * Replace the shared document's entire content with the given fixture file's text.
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

  // onceIgnoreMatches: fires exactly once regardless of match presence. When a match
  // DOES exist its capture-group data (here $1, uppercased) is available to `run`;
  // when it doesn't, $1 falls back to "" - but ${getDocumentText} (unrelated to match
  // state) resolves correctly either way, proving other variables aren't broken by the
  // lack of match context.
  const onceIgnoreMatchesArgs = (find) => ({
    find,
    isRegex: true,
    runWhen: "onceIgnoreMatches",
    run: [
      "$${",
      "await vscode.env.clipboard.writeText('[' + '${getDocumentText}' + ']' + '\\U$1');",
      "await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');",
      "await vscode.commands.executeCommand('editor.action.clipboardPasteAction');",
      "}$$",
    ],
  });

  test('onceIgnoreMatches: has a match - $1 resolves to the matched text, uppercased', async function () {
    this.timeout(10000);

    await loadFixture('onceIgnoreMatches/input.txt');
    const originalUri = document.uri.toString();

    await vscode.commands.executeCommand('findInCurrentFile', onceIgnoreMatchesArgs("(match)"));

    assert.ok(vscode.window.activeTextEditor);
    const newDocument = vscode.window.activeTextEditor.document;
    assert.notStrictEqual(newDocument.uri.toString(), originalUri);
    assert.strictEqual(newDocument.isUntitled, true);
    await assertEventualText('[please match me now]MATCH', 3000, newDocument);
  });

  test('onceIgnoreMatches: no match - still fires once; $1 is empty but ${getDocumentText} still resolves', async function () {
    this.timeout(10000);

    await loadFixture('onceIgnoreMatches/input.txt');
    const originalUri = document.uri.toString();

    await vscode.commands.executeCommand('findInCurrentFile', onceIgnoreMatchesArgs("(zzz_never_matches_zzz)"));

    assert.ok(vscode.window.activeTextEditor);
    const newDocument = vscode.window.activeTextEditor.document;
    assert.notStrictEqual(newDocument.uri.toString(), originalUri);
    assert.strictEqual(newDocument.isUntitled, true);
    await assertEventualText('[please match me now]', 3000, newDocument);
  });

  // No `find` key at all: per user direction, $1 should come from "the first
  // selection, if any" rather than always being empty. This is already achieved
  // without any special-casing in runWhen() itself - _buildFindArgs()
  // (parseCommands.js) calls resolve.makeFind() whenever `find` is omitted, which
  // builds a real find from the current selection *before* the command ever
  // reaches findAndSelect/runWhen. With isRegex: true that generated find is
  // wrapped in a capture group, so the selection's own text ends up as a genuine
  // match with $1 set - the same "match exists" path as the first test above, just
  // reached via an auto-built find instead of an explicit one.
  test('onceIgnoreMatches: no find key - $1 comes from the current selection via the normal makeFind() path', async function () {
    this.timeout(10000);

    await loadFixture('onceIgnoreMatches/input.txt');
    const originalUri = document.uri.toString();
    editor.selection = new vscode.Selection(0, 7, 0, 12);  // selects "match"

    await vscode.commands.executeCommand('findInCurrentFile', {
      isRegex: true,
      runWhen: "onceIgnoreMatches",
      run: [
        "$${",
        "await vscode.env.clipboard.writeText('[' + '${getDocumentText}' + ']' + '\\U$1');",
        "await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');",
        "await vscode.commands.executeCommand('editor.action.clipboardPasteAction');",
        "}$$",
      ],
    });

    assert.ok(vscode.window.activeTextEditor);
    const newDocument = vscode.window.activeTextEditor.document;
    assert.notStrictEqual(newDocument.uri.toString(), originalUri);
    assert.strictEqual(newDocument.isUntitled, true);
    await assertEventualText('[please match me now]MATCH', 3000, newDocument);
  });

  // onceIfAMatch (default), onEveryMatch, onceOnNoMatches: the `run` jsOp appends a
  // '\nRAN:$1' marker to the end of the shared document, so firing count and each
  // firing's own capture-group data are both directly visible in the final text.
  const appendRunArgs = (find, runWhen) => ({
    find,
    isRegex: true,
    ...(runWhen ? { runWhen } : {}),
    run: [
      "$${",
      "const editor = vscode.window.activeTextEditor;",
      "const endPos = editor.document.lineAt(editor.document.lineCount - 1).range.end;",
      "await editor.edit(eb => eb.insert(endPos, '\\nRAN:$1'));",
      "}$$",
    ],
  });

  const runWhenAppendCases = [
    {
      name: 'onceIfAMatch: no match - run does not fire',
      dir: 'onceIfAMatch/noMatch',
      args: appendRunArgs("(ZZZNOMATCH)"),
    },
    {
      name: 'onceIfAMatch: one match - fires once with that match',
      dir: 'onceIfAMatch/oneMatch',
      args: appendRunArgs("(FOO)"),
    },
    {
      name: 'onceIfAMatch: 2+ matches - still fires only once, using the first match',
      dir: 'onceIfAMatch/twoPlusMatches',
      args: appendRunArgs("(FOO)"),
    },
    {
      name: 'onEveryMatch: no match - run does not fire',
      dir: 'onEveryMatch/noMatch',
      args: appendRunArgs("(FOO|BAR|BAZ)", "onEveryMatch"),
    },
    {
      name: 'onEveryMatch: one match - fires once with that match',
      dir: 'onEveryMatch/oneMatch',
      args: appendRunArgs("(FOO|BAR|BAZ)", "onEveryMatch"),
    },
    {
      name: 'onEveryMatch: 2+ matches - fires once per match, each with its own captured text, in document order',
      dir: 'onEveryMatch/twoPlusMatches',
      args: appendRunArgs("(FOO|BAR|BAZ)", "onEveryMatch"),
    },
    {
      name: 'onceOnNoMatches: no match - fires once; $1 is empty since there is no match context',
      dir: 'onceOnNoMatches/noMatch',
      args: appendRunArgs("(ZZZNOMATCH)", "onceOnNoMatches"),
    },
    {
      name: 'onceOnNoMatches: has a match - run does not fire',
      dir: 'onceOnNoMatches/hasMatch',
      args: appendRunArgs("(FOO)", "onceOnNoMatches"),
    },
  ];

  runWhenAppendCases.forEach(({ name, dir, args }) => {
    test(name, async function () {
      this.timeout(10000);

      await loadFixture(`${dir}/input.txt`);

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, `${dir}/expected.txt`));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());
    });
  });
});
