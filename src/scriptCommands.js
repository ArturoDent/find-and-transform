const { window, workspace } = require('vscode');

const scriptStorage = require('./scriptStorage');


const STARTER_CONTENT = '// Available here: vscode, path, require, document\n// Return a value to use as the find/replace/run result.\n\n';

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

  await scriptStorage.save(name, STARTER_CONTENT);
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

/**
 * Save the current selection - expected to be the jsOp body copied out of a
 * `$${ ... }$$` block in settings.json - as a named script, and replace the
 * selection with a `$${script:name}$$` reference to it.
 */
exports.saveInlineScriptAsNamedScript = async function () {

  const editor = window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    window.showInformationMessage('Select the jsOp code (between $${ and }$$) to save as a named script first.');
    return;
  }

  const code = editor.document.getText(editor.selection);

  const name = await window.showInputBox({
    prompt: 'Name for the saved script',
    validateInput: _validateNewName
  });
  if (!name) return;

  await scriptStorage.save(name, code);

  await editor.edit(editBuilder => {
    editBuilder.replace(editor.selection, '$${script:' + name + '}$$');
  });
};
