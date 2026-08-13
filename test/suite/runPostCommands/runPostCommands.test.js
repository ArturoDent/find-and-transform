const assert = require('assert');
const path = require('path');
const vscode = require('vscode');
const testHelpers = require('../testHelpers');

// Exercises the "postCommands"/"runPostCommands" arguments of findInCurrentFile
// end-to-end, across all 4 runPostCommands values
// (onceIgnoreMatches/onceIfAMatch/onEveryMatch/onceOnNoMatches) - see
// src/prePostCommands.js's exports.runPost(). Mirrors test/suite/runWhen/'s shape and
// fixture text, but observes results via the real "type" vscode command (which
// replaces the currently active selection, or inserts at a collapsed cursor) instead
// of a `run` jsOp editing the document directly.
//
// Every args object below deliberately OMITS `replace` entirely (never `replace: ""`):
// with `find` set and no `replace`, parseCommands.js routes to
// findAndSelect.findAndSelect(), which has no zero-match early return anywhere -
// whereas document.js (used whenever `replace` is present) returns early at
// `if (!foundMatches.length) return;` BEFORE ever reaching the runPost dispatch, so
// onceIgnoreMatches/onceOnNoMatches would silently never fire from that path.
//
// findAndSelect.js's "document" branch sets editor.selections to the real find
// matches unconditionally (regardless of runPostCommands) whenever there IS at least
// one match, so by the time runPost() runs, "type" naturally replaces the matched
// text. When there's no match, editor.selections is never touched, so "type" inserts
// at whatever cursor position the test set beforehand.
suite('runPostCommands', () => {

  let document;
  let editor;

  suiteSetup(async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
    if (extension && !extension.isActive) await extension.activate();

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
   * Poll the shared document's text until it matches expectedText or timeoutMs
   * elapses, then assert. Guards against the postCommands timing issue noted in
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

  // onceIgnoreMatches: fires exactly once regardless of match presence - same
  // contract as runWhen's onceIgnoreMatches. When a match DOES exist, its
  // capture-group data ($1, uppercased) is available to postCommands; when it
  // doesn't, $1 falls back to "".
  const onceIgnoreMatchesArgs = (find) => ({
    find,
    isRegex: true,
    runPostCommands: "onceIgnoreMatches",
    postCommands: [
      { command: "type", args: { text: "RAN:\\U$1" } },
    ],
  });

  test('onceIgnoreMatches: has a match - $1 resolves to the matched text, uppercased', async function () {
    this.timeout(10000);

    await loadFixture('onceIgnoreMatches/input.txt');
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    await vscode.commands.executeCommand('findInCurrentFile', onceIgnoreMatchesArgs("(match)"));

    // "match" (chars 7-12) is replaced by the typed "RAN:MATCH"
    await assertEventualText('please RAN:MATCH me now');
  });

  test('onceIgnoreMatches: no match - still fires once; $1 is empty', async function () {
    this.timeout(10000);

    await loadFixture('onceIgnoreMatches/input.txt');
    editor.selection = new vscode.Selection(0, 0, 0, 0);  // no match found - stays here

    await vscode.commands.executeCommand('findInCurrentFile', onceIgnoreMatchesArgs("(zzz_never_matches_zzz)"));

    await assertEventualText('RAN:please match me now');
  });

  // No `find` key at all: like runWhen, $1 comes from the current selection via the
  // normal makeFind() path (_buildFindArgs in parseCommands.js builds a real find
  // from the selection before the command ever reaches findAndSelect/runPost) -
  // no special-casing needed in runPost() itself.
  test('onceIgnoreMatches: no find key - $1 comes from the current selection via the normal makeFind() path', async function () {
    this.timeout(10000);

    await loadFixture('onceIgnoreMatches/input.txt');
    editor.selection = new vscode.Selection(0, 7, 0, 12);  // selects "match"

    await vscode.commands.executeCommand('findInCurrentFile', {
      isRegex: true,
      runPostCommands: "onceIgnoreMatches",
      postCommands: [
        { command: "type", args: { text: "RAN:\\U$1" } },
      ],
    });

    await assertEventualText('please RAN:MATCH me now');
  });

  // onceIfAMatch (default), onEveryMatch, onceOnNoMatches: postCommands types
  // 'RAN:$1' - replacing the matched text when a match exists (editor.selections is
  // already at the match, from findAndSelect.js's own unconditional selection
  // building), or inserting at the pre-set cursor when there's no match at all.
  const typeRunArgs = (find, runPostCommands) => ({
    find,
    isRegex: true,
    ...(runPostCommands ? { runPostCommands } : {}),
    postCommands: [
      { command: "type", args: { text: "RAN:\\U$1" } },
    ],
  });

  const runPostCommandsCases = [
    {
      name: 'onceIfAMatch: no match - postCommands do not fire',
      dir: 'onceIfAMatch/noMatch',
      args: typeRunArgs("(ZZZNOMATCH)"),
    },
    {
      name: 'onceIfAMatch: one match - fires once with that match',
      dir: 'onceIfAMatch/oneMatch',
      args: typeRunArgs("(FOO)"),
    },
    {
      name: 'onceIfAMatch: 2+ matches - still fires only once, using the first match',
      dir: 'onceIfAMatch/twoPlusMatches',
      args: typeRunArgs("(FOO)"),
    },
    {
      name: 'onEveryMatch: no match - postCommands do not fire',
      dir: 'onEveryMatch/noMatch',
      args: typeRunArgs("(FOO|BAR|BAZ)", "onEveryMatch"),
    },
    {
      name: 'onEveryMatch: one match - fires once with that match',
      dir: 'onEveryMatch/oneMatch',
      args: typeRunArgs("(FOO|BAR|BAZ)", "onEveryMatch"),
    },
    {
      name: 'onEveryMatch: 2+ matches - fires once per match, each with its own captured text',
      dir: 'onEveryMatch/twoPlusMatches',
      args: typeRunArgs("(FOO|BAR|BAZ)", "onEveryMatch"),
    },
    {
      name: 'onceOnNoMatches: no match - fires once; $1 is empty since there is no match context',
      dir: 'onceOnNoMatches/noMatch',
      args: typeRunArgs("(ZZZNOMATCH)", "onceOnNoMatches"),
    },
    {
      name: 'onceOnNoMatches: has a match - postCommands do not fire',
      dir: 'onceOnNoMatches/hasMatch',
      args: typeRunArgs("(FOO)", "onceOnNoMatches"),
    },
  ];

  runPostCommandsCases.forEach(({ name, dir, args }) => {
    test(name, async function () {
      this.timeout(10000);

      await loadFixture(`${dir}/input.txt`);
      editor.selection = new vscode.Selection(0, 0, 0, 0);  // only matters for the no-match cases

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, `${dir}/expected.txt`));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());
    });
  });

  // With a `replace` present (document.js's replace path, not findAndSelect.js), the
  // replace edit has ALREADY applied by the time postCommands run - so foundSelections
  // (built from PRE-edit match positions) goes stale the instant a replacement's length
  // differs from what it replaced. document.js now tracks each match's own
  // lastMatchLengthDiff/replaceLength unconditionally (previously only for
  // cursorMoveSelect) and builds a postEditFoundSelections array from it for run/
  // postCommands - reusing the exact same formula cursorMoveSelect already relied on.
  const withReplaceCases = [
    {
      // Single fire (onceIfAMatch) - proves the fix even without any loop: "FOO"(3
      // chars) becomes "REPLACED"(8 chars) BEFORE postCommands run, so without the
      // fix, typing at the stale 3-char span would land on "REP" (the first 3
      // characters of "REPLACED") instead of the whole replacement.
      name: 'onceIfAMatch: replace changes match length - postCommands land on the actual replacement, not a stale pre-replace span',
      dir: 'withReplace/onceIfAMatch',
      args: { find: "(FOO)", isRegex: true, replace: "REPLACED", postCommands: [{ command: "type", args: { text: "X" } }] },
    },
    {
      // onEveryMatch - compounds BOTH fixes: document.js's replace-staleness fix
      // (this test) AND prePostCommands.js's own onEveryMatch-loop drift fix (the
      // earlier fix) must both work correctly together across 2 matches.
      name: 'onEveryMatch: replace changes match length - each iteration lands on its own actual replacement',
      dir: 'withReplace/onEveryMatch',
      args: { find: "(FOO)", isRegex: true, replace: "REPLACED", runPostCommands: "onEveryMatch", postCommands: [{ command: "type", args: { text: "X" } }] },
    },
  ];

  withReplaceCases.forEach(({ name, dir, args }) => {
    test(name, async function () {
      this.timeout(10000);

      await loadFixture(`${dir}/input.txt`);
      editor.selection = new vscode.Selection(0, 0, 0, 0);

      const expectedUri = vscode.Uri.file(path.resolve(__dirname, `${dir}/expected.txt`));
      const expectedDocument = await vscode.workspace.openTextDocument(expectedUri);

      await vscode.commands.executeCommand('findInCurrentFile', args);
      await assertEventualText(expectedDocument.getText());
    });
  });
});
