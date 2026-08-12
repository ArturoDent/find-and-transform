const vscode = require('vscode');

/**
 * Parse `|` (collapsed cursor), `[...]` (forward selection: anchor at `[`,
 * active at `]`), and `{...}` (reversed selection: active at `{`, anchor at
 * `}` - for selections made by selecting backward) markers out of fixture
 * text, so tests can eyeball selections directly in a .txt fixture instead
 * of hand-computing line/character coordinates. Multiple markers are
 * returned in document order. `\r\n` is handled like VS Code's own
 * Position.character does - `\r` doesn't advance the character count, only
 * `\n` starts a new line.
 * @param {string} markedText
 * @returns {{ text: string, selections: import("vscode").Selection[] }}
 */
exports.parseSelectionMarkers = function (markedText) {
  const selections = [];
  let text = '';
  let line = 0;
  let character = 0;
  let pendingStart = null;
  let pendingReversedActive = null;

  for (const ch of markedText) {
    if (ch === '|') {
      selections.push(new vscode.Selection(line, character, line, character));
      continue;
    }
    if (ch === '[') {
      pendingStart = new vscode.Position(line, character);
      continue;
    }
    if (ch === ']') {
      if (!pendingStart) throw new Error('parseSelectionMarkers: unmatched "]" marker');
      selections.push(new vscode.Selection(pendingStart, new vscode.Position(line, character)));
      pendingStart = null;
      continue;
    }
    if (ch === '{') {
      pendingReversedActive = new vscode.Position(line, character);
      continue;
    }
    if (ch === '}') {
      if (!pendingReversedActive) throw new Error('parseSelectionMarkers: unmatched "}" marker');
      // reversed: anchor is the later position (}), active is the earlier one ({)
      selections.push(new vscode.Selection(new vscode.Position(line, character), pendingReversedActive));
      pendingReversedActive = null;
      continue;
    }
    text += ch;
    if (ch === '\n') { line++; character = 0; }
    else if (ch !== '\r') character++;
  }

  if (pendingStart) throw new Error('parseSelectionMarkers: unmatched "[" marker');
  if (pendingReversedActive) throw new Error('parseSelectionMarkers: unmatched "{" marker');
  return { text, selections };
};

/**
 * Sort Selections by document position (start line, then start character).
 * A Selection array's order isn't part of its semantic identity - VS Code
 * doesn't guarantee that editor.selections round-trips the exact array order
 * you assigned once a command has run in between - so comparing "the same
 * set of ranges, possibly in a different order" needs a canonical order
 * first. Use before assert.deepStrictEqual on two Selection arrays.
 * @param {readonly import("vscode").Selection[]} selections
 * @returns {import("vscode").Selection[]}
 */
exports.sortSelectionsByPosition = function (selections) {
  return [...selections].sort((a, b) => {
    if (a.start.line !== b.start.line) return a.start.line - b.start.line;
    return a.start.character - b.start.character;
  });
};

/**
 * Replace a document's entire content with the given fixture file's text.
 * Re-acquires a fresh TextEditor rather than trusting a cached one - a
 * TextEditor instance goes stale once its pane stops being visible (e.g.
 * after another test switches focus to a different tab), even though the
 * underlying document and tab are still open.
 * @param {import("vscode").TextDocument} document
 * @param {string} fixturePath - absolute path to the fixture file
 * @returns {Promise<import("vscode").TextEditor>} the editor used to make the edit
 */
exports.loadFixture = async function (document, fixturePath) {
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const fixtureDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(fixturePath));
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  await editor.edit(editBuilder => editBuilder.replace(fullRange, fixtureDocument.getText()));
  return editor;
};

/**
 * Like loadFixture(), but the fixture file's text contains |/[...]/{...}
 * selection markers (see parseSelectionMarkers) - the marker-free text is
 * loaded and the returned editor's selections are set to what the markers
 * described.
 * @param {import("vscode").TextDocument} document
 * @param {string} fixturePath - absolute path to the fixture file
 * @returns {Promise<import("vscode").TextEditor>} the editor used to make the edit
 */
exports.loadFixtureWithSelections = async function (document, fixturePath) {
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const fixtureDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(fixturePath));
  const { text, selections } = exports.parseSelectionMarkers(fixtureDocument.getText());
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  await editor.edit(editBuilder => editBuilder.replace(fullRange, text));
  editor.selections = selections;
  return editor;
};
