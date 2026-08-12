const {commands, window, workspace} = require('vscode');
const jsonc = require('jsonc-parser');

const scriptStorage = require('./scriptStorage');


// unlike an inline $${ ... }$$ jsOp, a named script gets no auto-injected vscode/path/document -
// resolveVariables.js only passes 'require' in for script:name references (see resolveVariables.js),
// specifically so real require()/const lines like these work without redeclaring anything
const REQUIRE_HEADER =
  "const vscode = require('vscode');\n" +
  "const path = require('path');\n" +
  "const document = vscode.window.activeTextEditor?.document;\n" +
  '\n' +
  "// const os = require('os');\n" +
  "// const fs = require('node:fs');\n" +
  "// const glob = require('glob');\n" +
  '// remove or comment any of the above you don\'t use\n' +
  '\n' +
  "// a script file isn't JSON, so don't double-escape here:  '\\U$1' is the normal\n" +
  "// form ('\\\\U$1' is accepted too, but only for case modifiers, not '\\\\n', '\\\\d', etc.)\n\n" +

  "// don't use case transforms like '\\U$1' if intended for a 'runInSearchPanel' call\n" +
  "//  '\\U$1' will be replaced by simply '$1'\n" +
  "// don't use conditional transforms like '${1:add text}' in a 'runInSearchPanel' call, they will not work\n\n";

/**
 * Look up the sibling "title"/"description" strings in the same object as the
 * given document offset - the "args" object a "replace"/"run"/"find" selection
 * came from in a keybinding, or the named setting's own body in settings.json
 * (only a setting has a "title", which is what shows in the Command Palette).
 * @param {string} documentText
 * @param {number} offset
 * @returns {{title: string | undefined, description: string | undefined}}
 */
exports.findSiblingLabels = function (documentText, offset) {

  /** @type {{title: string | undefined, description: string | undefined}} */
  const labels = {title: undefined, description: undefined};

  try {
    const root = jsonc.parseTree(documentText);
    if (!root) return labels;

    let node = jsonc.findNodeAtOffset(root, offset);
    while (node && node.type !== 'object') node = node.parent;
    if (!node) return labels;

    for (const propertyNode of node.children ?? []) {
      const [keyNode, valueNode] = propertyNode.children ?? [];
      if (typeof valueNode?.value !== 'string') continue;
      if (keyNode?.value === 'title') labels.title = valueNode.value;
      else if (keyNode?.value === 'description') labels.description = valueNode.value;
    }
    return labels;
  }
  catch {
    return labels;
  }
};

// a settings.json/keybindings.json (user or workspace), or a multi-root workspace file
const CONFIG_FILE_RE = /(?:^|[\\/])(?:settings|keybindings)\.json$|\.code-workspace$/;

/**
 * Strip the smallest leading indentation shared by every non-blank line, so a
 * config lifted out of a deeply nested document reads flush-left in the script
 * file. Also normalizes CRLF to LF, matching the rest of the generated content.
 * @param {string} text
 * @returns {string}
 */
function _dedent(text) {

  const lines = text.split(/\r?\n/);
  let minIndent;

  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    if (minIndent === undefined || indent < minIndent) minIndent = indent;
  }

  if (!minIndent) return lines.join('\n');
  return lines.map(line => line.slice(minIndent)).join('\n');
}

/**
 * Find the whole config the selection came from: in keybindings.json the entire
 * keybinding object, in settings.json (or a .code-workspace) the entire named
 * setting entry, e.g. `"upcaseSwap": { ... }`. Taken verbatim out of the
 * document rather than re-stringified, so the user's own formatting and any
 * jsonc comments inside the config survive.
 * @param {string} documentText
 * @param {number} offset
 * @param {boolean} [isWorkspaceFile] - a .code-workspace, where everything sits under "settings"
 * @returns {{text: string, command: string | undefined} | undefined}
 */
exports.findSourceConfigText = function (documentText, offset, isWorkspaceFile) {

  try {
    const root = jsonc.parseTree(documentText);
    if (!root) return undefined;

    const locationPath = jsonc.getLocation(documentText, offset).path;
    if (!locationPath?.length) return undefined;

    // keybindings.json is an array of keybindings, settings.json an object of settings
    const isKeybinding = root.type === 'array';
    const base = (isWorkspaceFile && locationPath[0] === 'settings') ? 1 : 0;
    // one segment reaches the keybinding itself; a setting needs two - the
    // command ("findInCurrentFile") and the setting's own name ("upcaseSwap")
    const keepDepth = isKeybinding ? 1 : base + 2;
    if (locationPath.length < keepDepth) return undefined;

    const valueNode = jsonc.findNodeAtLocation(root, locationPath.slice(0, keepDepth));
    if (!valueNode) return undefined;

    // for a setting take the property node, so the `"upcaseSwap":` key comes along too
    const node = isKeybinding ? valueNode : (valueNode.parent ?? valueNode);

    // back up over the node's own indentation, so _dedent sees the first line's too
    let start = node.offset;
    const lineStart = documentText.lastIndexOf('\n', start - 1) + 1;
    if (!documentText.slice(lineStart, start).trim()) start = lineStart;

    return {
      text: _dedent(documentText.slice(start, node.offset + node.length)),
      // a keybinding already carries its own "command" property
      command: isKeybinding ? undefined : String(locationPath[base])
    };
  }
  catch {
    return undefined;
  }
};

/**
 * The script file's leading comment: the source config's own "title" (what a
 * setting shows in the Command Palette) and "description", one `//` line each,
 * so the very top of the file says what the script is for. Empty when the
 * config had neither.
 * @param {string | undefined} title
 * @param {string | undefined} description
 * @returns {string}
 */
exports.makeHeaderComment = function (title, description) {

  const lines = [title, description]
    .map(label => label && `// ${label.replace(/\r?\n/g, ' ')}`)
    .filter(Boolean)
    .join('\n');

  return lines ? `${lines}\n\n` : '';
};

/**
 * Wrap the source config in a block comment for the generated script file, so
 * the script keeps a record of the keybinding/setting it was lifted out of.
 * @param {string} configText
 * @param {string | undefined} command - the setting's command, or undefined for a keybinding
 * @returns {string}
 */
exports.makeSourceComment = function (configText, command) {

  // a literal */ inside the config (a `"replace": "*/"` value, say) would end the
  // comment early and leave the rest of the file as broken code
  const safeText = configText.replace(/\*\//g, '*\\/');
  const header = command ? `saved from this setting, under "${command}":` : 'saved from this keybinding:';

  return `/*\n${header}\n\n${safeText}\n*/\n\n`;
};

/**
 * @param {string} value
 * @returns {string | null}
 */
function _validateNewName(value) {
  if (!value?.trim()) return 'A script name is required.';
  if (scriptStorage.get(value)) return `A script named "${value}" already exists.`;
  return null;
}

/**
 * @param {string} name
 */
async function _openScript(name) {
  const doc = await workspace.openTextDocument(scriptStorage.getFileUri(name));
  await window.showTextDocument(doc, {preview: false});
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

  const picked = await window.showQuickPick(scripts.map(script => script.name), {placeHolder: 'Select a script to edit'});
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

  const picked = await window.showQuickPick(scripts.map(script => script.name), {placeHolder: 'Select a script to delete'});
  if (!picked) return;

  const confirmed = await window.showWarningMessage(`Delete script "${picked}"? This cannot be undone.`, {modal: true}, 'Delete');
  if (confirmed !== 'Delete') return;

  await scriptStorage.delete(picked);
};

/**
 * Open the on-disk scripts folder in the OS file explorer/finder, so the
 * user never has to locate or type its (long, OS-specific) global storage path.
 */
exports.revealScriptsFolder = async function () {
  await commands.executeCommand('revealFileInOS', scriptStorage.getScriptsDirUri());
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
      text = JSON.parse(`"${wholeValueMatch[1]}"`);
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
      return match ? JSON.parse(`"${match[1]}"`) : trimmed;
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
 * file leads with the source config's "title"/"description" as a comment, then
 * REQUIRE_HEADER, then the keybinding/setting the code came from recorded
 * verbatim in a block comment.
 */
exports.saveInlineScriptAsNamedScript = async function () {

  const editor = window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    window.showInformationMessage('Select the $${ ... }$$ jsOp to save as a named script first - the inner code, the whole $${ ... }$$ block, or the entire replace/run value all work.');
    return;
  }

  const {code, needsQuotes, needsDelimiters, keyPrefix, trailingComma} =
    exports.extractCodeFromSelection(editor.document.getText(editor.selection));

  const name = await window.showInputBox({
    prompt: 'Name for the saved script',
    validateInput: _validateNewName
  });
  if (!name) return;

  // read before the replacement edit below, so this is the config as it was
  const documentText = editor.document.getText();
  const startOffset = editor.document.offsetAt(editor.selection.start);

  const source = CONFIG_FILE_RE.test(editor.document.fileName)
    ? exports.findSourceConfigText(documentText, startOffset, editor.document.fileName.endsWith('.code-workspace'))
    : undefined;

  const {title, description} = exports.findSiblingLabels(documentText, startOffset);
  const headerComment = exports.makeHeaderComment(title, description);
  const sourceComment = source ? exports.makeSourceComment(source.text, source.command) : '';

  await scriptStorage.save(name, headerComment + REQUIRE_HEADER + sourceComment + code);

  let reference = 'script:' + name;
  if (needsDelimiters) reference = '$${' + reference + '}$$';
  if (needsQuotes) reference = '"' + reference + '"';
  reference = keyPrefix + reference + trailingComma;

  await editor.edit(editBuilder => {
    editBuilder.replace(editor.selection, reference);
  });
};
