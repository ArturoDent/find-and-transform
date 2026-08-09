const path = require('path');
const vscode = require('vscode');
const assert = require('assert');
const testHelpers = require('../testHelpers');

// A replace's $1 can only resolve against a real capturing group in the compiled
// find regex. When the find ends up with none, adjustValueForRegex() wraps the
// whole find in one - but that auto-wrap used to be gated on isRegex being
// falsy, so setting "isRegex": true explicitly made every case below replace
// with the empty string instead.
//
// Note that a double-escaped \$n in a find is substituted with the text of the
// nth selection and does NOT itself become a capture group - that is what
// leaves these finds groupless. Each subfolder holds the input.txt (carrying
// |/[...] selection markers, see testHelpers.parseSelectionMarkers) and
// expected.txt for one scenario.
suite('find capture groups - a replace $n with no explicit group', () => {

  let document;

  const cases = [
    {
      folder: 'repeatedSelectionFind',
      name: 'repeated \\$n leaves the find groupless, isRegex set',
      args: { find: "\\$1 \\$1 \\$1", replace: "\\U$1", isRegex: true, restrictFind: "line" },
    },
    {
      folder: 'repeatedSelectionFindNoIsRegex',
      name: 'same find with isRegex omitted still goes through the escaping path',
      args: { find: "\\$1 \\$1 \\$1", replace: "\\U$1", restrictFind: "line" },
    },
    {
      folder: 'grouplessFind',
      name: 'a plain find with no parentheses at all, isRegex set',
      args: { find: "const", replace: "\\U$1", isRegex: true },
    },
    {
      folder: 'nonCapturingGroupOnly',
      name: 'a find whose only parentheses are non-capturing',
      args: { find: "(?:const) (?:const)", replace: "\\U$1", isRegex: true },
    },
    {
      folder: 'explicitGroupsWithSelection',
      name: 'a find that already has groups keeps its own numbering',
      args: { find: "(\\$1)(\\d+)", replace: "\\U$1-$2", isRegex: true },
    },
  ];

  suiteSetup(async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
    if (extension && !extension.isActive) await extension.activate();

    // A genuinely separate untitled scratch document, not a real fixture file -
    // VS Code caches TextDocument instances per URI, so opening an actual
    // fixture path here would make it the SAME object loadFixtureWithSelections()
    // later re-opens to read "fresh" text, silently reading back its own edits
    // instead of the original file on disk.
    document = await vscode.workspace.openTextDocument({ content: '' });
    await vscode.window.showTextDocument(document, { preview: false });
  });

  suiteTeardown(async () => {
    // Deliberately not reverting/closing here: `document` is an untitled scratch
    // doc with unsaved content by now - closing it would prompt "Save changes?",
    // a real, unscriptable native dialog. The whole VS Code test instance is
    // torn down non-interactively once Mocha finishes.
  });

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

  cases.forEach(({ folder, name, args }) => {
    test(name, async function () {
      this.timeout(10000);

      await testHelpers.loadFixtureWithSelections(document, path.resolve(__dirname, folder, 'input.txt'));

      const expectedDocument = await vscode.workspace.openTextDocument(
        vscode.Uri.file(path.resolve(__dirname, folder, 'expected.txt'))
      );

      await vscode.commands.executeCommand('findInCurrentFile', args);

      await assertEventualText(expectedDocument.getText());
    });
  });
});
