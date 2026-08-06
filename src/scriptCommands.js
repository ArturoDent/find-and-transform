const { window, workspace } = require('vscode');
const jsonc = require('jsonc-parser');

const scriptStorage = require('./scriptStorage');


// unlike an inline $${ ... }$$ jsOp, a named script gets no auto-injected vscode/path/document -
// resolveVariables.js only passes 'require' in for script:name references (see resolveVariables.js),
// specifically so real require()/const lines like these work without redeclaring anything
const REQUIRE_HEADER =
  "const vscode = require('vscode');\n" +
  "const path = require('path');\n" +
  "const document = vscode.window.activeTextEditor?.document;\n" +
  "// const glob = require('glob');  // uncomment if you use glob\n" +
  '// remove or comment out any of the above you don\'t use\n\n';

/**
 * Look up a sibling "description" string in the same object as the given
 * document offset (e.g. the "args" object a "replace"/"run"/"find" selection
 * came from), if one exists.
 * @param {string} documentText
 * @param {number} offset
 * @returns {string | undefined}
 */
function _findSiblingDescription(documentText, offset) {

  try {
    const root = jsonc.parseTree(documentText);
    if (!root) return undefined;

    let node = jsonc.findNodeAtOffset(root, offset);
    while (node && node.type !== 'object') node = node.parent;
    if (!node) return undefined;

    for (const propertyNode of node.children ?? []) {
      const [keyNode, valueNode] = propertyNode.children ?? [];
      if (keyNode?.value === 'description' && typeof valueNode?.value === 'string') return valueNode.value;
    }
    return undefined;
  }
  catch {
    return undefined;
  }
}

/**
 * @param {string} value
 * @returns {string | null}
 */
function _validateNewName(value) {
  if (!value?.trim()) return 'A script name is required.';
  if (scriptStorage.get(value)) return `A script named "${ value }" already exists.`;
  return null;
}

/**
 * @param {string} name
 */
async function _openScript(name) {
  const doc = await workspace.openTextDocument(scriptStorage.getFileUri(name));
  await window.showTextDocument(doc, { preview: false });
}

/**
 * Prompt for a name, create an empty script, and open it for editing.
 */
exports.newScript = async function () {

  const name = await window.showInputBox({
    prompt: 'Name for the new script',
    validateInput: _validateNewName
  });
  if (!name) return;

  await scriptStorage.save(name, REQUIRE_HEADER);
  await _openScript(name);
};

/**
 * Quickpick an existing script and open it for editing.
 */
exports.editScript = async function () {

  const scripts = scriptStorage.list();
  if (!scripts.length) {
    window.showInformationMessage('No saved scripts yet. Run "Find-Transform: New Script" to create one.');
    return;
  }

  const picked = await window.showQuickPick(scripts.map(script => script.name), { placeHolder: 'Select a script to edit' });
  if (!picked) return;

  await _openScript(picked);
};

/**
 * Quickpick an existing script and delete it, after confirmation.
 */
exports.deleteScript = async function () {

  const scripts = scriptStorage.list();
  if (!scripts.length) {
    window.showInformationMessage('No saved scripts to delete.');
    return;
  }

  const picked = await window.showQuickPick(scripts.map(script => script.name), { placeHolder: 'Select a script to delete' });
  if (!picked) return;

  const confirmed = await window.showWarningMessage(`Delete script "${ picked }"? This cannot be undone.`, { modal: true }, 'Delete');
  if (confirmed !== 'Delete') return;

  await scriptStorage.delete(picked);
};

// a JSON array element on its own line: "some \"escaped\" text",  // optional trailing comment
const QUOTED_LINE_RE = /^"((?:[^"\\]|\\.)*)"\s*,?\s*(?:\/\/.*)?$/;
// the whole (remaining) selection as one complete JSON-quoted string, with an
// optional trailing (property-separator) comma
const WHOLE_QUOTED_VALUE_RE = /^"((?:[^"\\]|\\.)*)"\s*(,?)\s*$/;
// a leading "find"/"replace"/"run" key, e.g.  "replace":
const KEY_PREFIX_RE = /^"(?:replace|run|find)"\s*:\s*/;
// an entire [ ... ] array, with an optional trailing (property-separator) comma
const BRACKETS_RE = /^\[([\s\S]*)\]\s*(,?)\s*$/;
// an entire $${ ... }$$ block
const DELIMITED_RE = /^\$\$\{([\s\S]*)\}\$\$$/;

/**
 * Turn the raw text of a selected jsOp into real JS source, tolerating any of
 * the ways a user might reasonably select it:
 *  - just the code inside `$${ ... }$$` (the delimiters are left in the document)
 *  - the whole `$${ ... }$$` block, delimiters included (as a plain substring,
 *    or as one complete JSON-quoted value with its own quotes)
 *  - the whole `"replace"`/`"run"`/`"find"` array, brackets (and optionally
 *    the key) included - e.g. `"replace": ["$${", "const x = 1;", ..., "}$$"]`
 *  - a complete quoted value that has other text/variables around the jsOp too,
 *    e.g. `"${BLOCK_COMMENT_START} $${ ... }$$ ${BLOCK_COMMENT_START}"` - the
 *    whole thing (surrounding text included) is saved into the script file
 *    verbatim, since there's no reliable way to tell what "the jsOp" is inside
 *    arbitrary surrounding text; select just the jsOp (the first bullet above)
 *    if you want only the code saved
 * The code itself may be a plain substring or, for the documented multi-line
 * style, a run of individually JSON-quoted, comma-terminated lines. When the
 * selection consumed a trailing property-separator comma (because a sibling
 * key follows, e.g. `"runWhen"` after `"run"`), that comma is preserved so it
 * can be reattached to the replacement. Reports what was found so the caller
 * can reconstruct a matching replacement.
 * @param {string} selectedText
 * @returns {{code: string, needsQuotes: boolean, needsDelimiters: boolean, keyPrefix: string, trailingComma: string}}
 */
exports.extractCodeFromSelection = function (selectedText) {

  let text = selectedText.replace(/^\s+/, '');
  let keyPrefix = '';

  const keyMatch = KEY_PREFIX_RE.exec(text);
  if (keyMatch) {
    keyPrefix = keyMatch[0];
    text = text.slice(keyMatch[0].length);
  }

  text = text.trim();
  let hadBrackets = false;
  let hadWholeQuotedValue = false;
  let trailingComma = '';

  const bracketsMatch = BRACKETS_RE.exec(text);
  if (bracketsMatch) {
    text = bracketsMatch[1];
    trailingComma = bracketsMatch[2];
    hadBrackets = true;
  }
  else {
    // the whole remaining selection might be one complete quoted value, e.g. a
    // simple "replace": "$${ ... }$$" selected including its own quotes - possibly
    // with other text/variables around the jsOp too, like "${X} $${ ... }$$ ${X}";
    // either way, replacing a complete value needs a complete, self-contained
    // replacement, so this is treated as needing quotes+delimiters regardless of
    // whether the decoded content purely reduces to $${ ... }$$
    const wholeValueMatch = WHOLE_QUOTED_VALUE_RE.exec(text);
    if (wholeValueMatch) {
      text = JSON.parse(`"${ wholeValueMatch[1] }"`);
      trailingComma = wholeValueMatch[2];
      hadWholeQuotedValue = true;
    }
  }

  const lines = text.split(/\r\n|\n/);
  const isQuotedLines = lines.some(line => QUOTED_LINE_RE.test(line.trim()));

  let code = isQuotedLines
    ? lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const match = QUOTED_LINE_RE.exec(trimmed);
      return match ? JSON.parse(`"${ match[1] }"`) : trimmed;
    }).join('\n').trim()
    : text.trim();

  let hadDelimiters = false;
  const delimitedMatch = DELIMITED_RE.exec(code);
  if (delimitedMatch) {
    code = delimitedMatch[1].trim();
    hadDelimiters = true;
  }

  return {
    code,
    needsQuotes: isQuotedLines || hadBrackets || hadWholeQuotedValue,
    needsDelimiters: hadDelimiters || hadBrackets || hadWholeQuotedValue,
    keyPrefix,
    trailingComma
  };
};

/**
 * Save the current selection as a named script, and replace the selection
 * with a `script:name` reference, reconstructing whatever envelope (a
 * surrounding `$${ ... }$$`, JSON quoting, an array's brackets, a
 * `"replace":`/`"run":`/`"find":` key) the selection had consumed. The saved
 * file is prefixed with REQUIRE_HEADER and, if the enclosing args object has
 * a "description", a leading comment with that text.
 */
exports.saveInlineScriptAsNamedScript = async function () {

  const editor = window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    window.showInformationMessage('Select the $${ ... }$$ jsOp to save as a named script first - the inner code, the whole $${ ... }$$ block, or the entire replace/run value all work.');
    return;
  }

  const { code, needsQuotes, needsDelimiters, keyPrefix, trailingComma } =
    exports.extractCodeFromSelection(editor.document.getText(editor.selection));

  const name = await window.showInputBox({
    prompt: 'Name for the saved script',
    validateInput: _validateNewName
  });
  if (!name) return;

  const description = _findSiblingDescription(editor.document.getText(), editor.document.offsetAt(editor.selection.start));
  const descriptionComment = description ? `// ${ description.replace(/\r?\n/g, ' ') }\n\n` : '';

  await scriptStorage.save(name, descriptionComment + REQUIRE_HEADER + code);

  let reference = 'script:' + name;
  if (needsDelimiters) reference = '$${' + reference + '}$$';
  if (needsQuotes) reference = '"' + reference + '"';
  reference = keyPrefix + reference + trailingComma;

  await editor.edit(editBuilder => {
    editBuilder.replace(editor.selection, reference);
  });
};
