const { Uri } = require('vscode');
const fs = require('fs');
const path = require('path');


const STORAGE_KEY = 'find-and-transform.scripts';
const SCRIPTS_SUBDIR = 'scripts';

/** @type {import("vscode").ExtensionContext} */
let _context;


/**
 * @returns {import("vscode").Uri}
 */
function _scriptsDirUri() {
  return Uri.joinPath(_context.globalStorageUri, SCRIPTS_SUBDIR);
}

/**
 * @returns {import("vscode").Uri}
 */
exports.getScriptsDirUri = function () {
  return _scriptsDirUri();
};

/**
 * Turn a script name into a filesystem-safe filename.
 * @param {string} name
 * @returns {string}
 */
function _sanitizeFileName(name) {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

/**
 * @param {string} name
 * @returns {import("vscode").Uri}
 */
exports.getFileUri = function (name) {
  const safeName = _sanitizeFileName(name);
  // the user may already type a '.js' suffix in the name - don't double it up into 'name.js.js'
  const fileName = /\.js$/i.test(safeName) ? safeName : `${ safeName }.js`;
  return Uri.joinPath(_scriptsDirUri(), fileName);
};

/**
 * @returns {Object<string, {code: string, updatedAt: number}>}
 */
function _getIndex() {
  if (!_context) return {};
  return _context.globalState.get(STORAGE_KEY, {});
}

/**
 * @param {Object<string, {code: string, updatedAt: number}>} index
 */
async function _setIndex(index) {
  await _context.globalState.update(STORAGE_KEY, index);
}

/**
 * Only write the file if its content actually differs, so activation doesn't
 * needlessly mark every saved script's file as changed.
 * @param {string} name
 * @param {string} code
 */
async function _writeFileIfChanged(name, code) {

  const fileUri = exports.getFileUri(name);
  let existing;

  try {
    existing = await fs.promises.readFile(fileUri.fsPath, 'utf8');
  } catch {
    existing = undefined;
  }

  if (existing !== code) await fs.promises.writeFile(fileUri.fsPath, code, 'utf8');
}

/**
 * Initialize script storage: ensure the on-disk scripts folder exists, opt the
 * script index into Settings Sync, and reconcile on-disk files against
 * globalState (the source of truth) in case scripts changed via Settings Sync
 * since the last time this machine ran.
 * @param {import("vscode").ExtensionContext} context
 */
exports.init = async function (context) {

  _context = context;
  context.globalState.setKeysForSync([STORAGE_KEY]);

  await fs.promises.mkdir(_scriptsDirUri().fsPath, { recursive: true });

  const index = _getIndex();
  for (const name of Object.keys(index)) {
    await _writeFileIfChanged(name, index[name].code);
  }
};

/**
 * @returns {Array<{name: string, updatedAt: number}>}
 */
exports.list = function () {

  const index = _getIndex();
  return Object.keys(index)
    .map(name => ({ name, updatedAt: index[name].updatedAt }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * @param {string} name
 * @returns {string | undefined}
 */
exports.get = function (name) {
  return _getIndex()[name]?.code;
};

/**
 * @param {string} name
 * @param {string} code
 */
exports.save = async function (name, code) {

  const index = _getIndex();
  index[name] = { code, updatedAt: Date.now() };
  await _setIndex(index);
  await _writeFileIfChanged(name, code);
};

/**
 * @param {string} name
 */
exports.delete = async function (name) {

  const index = _getIndex();
  delete index[name];
  await _setIndex(index);

  try {
    await fs.promises.unlink(exports.getFileUri(name).fsPath);
  } catch {
    // file already gone - nothing to do
  }
};

/**
 * If the saved document is one of our materialized script files, write its
 * current text back into globalState so the synced payload stays current.
 * @param {import("vscode").TextDocument} document
 */
exports.syncFileToStorage = async function (document) {

  const scriptsDir = _scriptsDirUri().fsPath;
  const filePath = document.uri.fsPath;

  if (path.dirname(filePath) !== scriptsDir) return;

  const index = _getIndex();
  const name = Object.keys(index).find(candidate => exports.getFileUri(candidate).fsPath === filePath);
  if (!name) return;

  index[name] = { code: document.getText(), updatedAt: Date.now() };
  await _setIndex(index);
};
