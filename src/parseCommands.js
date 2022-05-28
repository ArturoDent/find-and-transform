const vscode = require('vscode');
const findCommands = require('./transform');
const variables = require('./variables');
// const languageConfigs = require('./getLanguageConfig');
const utilities = require('./utilities');


/**
 * Reduce any jsOp's in args.replace to single entries.
 * @param {string[]} arg - args.replace
 * @returns {Promise<string[] | string>}
 */
exports.buildJSOperationsFromArgs = async function (arg) {
  
  if (!Array.isArray(arg)) return arg;
  
  // find the starting $${ and the }ending }$$, 
  // make their content into one operation and splice that into arg
  
  for (let index = 0; index < arg.length; index++) {
    const start = arg.findIndex(el => el === "$${");
    const end = arg.findIndex(element => element === '}$$');
    if (start !== -1 && end !== -1) {
      // below makes the semicolons optional, 2 in a row is okay
      const operation = arg.slice(start, end + 1).join(';');
      // const operation = arg.slice(start, end + 1).join('');
      
      arg.splice(start, end+1 - start, operation);
      index = start;
    }
    else return arg;    
  }

  return arg;
}


/**
 * From 'findInCurrentFile' settings or keybindings. If necessary, split and run each command in 
 * its separate steps (if find/replace are arrays of multiple values).
 * 
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {object} args
 */
exports.splitFindCommands = async function (editor, edit, args) {

	let numFindArgs = 0;
  let numReplaceArgs = 0;

  if (Array.isArray(args.find)) numFindArgs = args.find.length;
  else if (typeof args.find == "string") numFindArgs = 1;
   // even if no 'find' one will be created from "wordAtCursor"

  // and not startsWith $${ and endsWith } after args.replace.join('')
  if (Array.isArray(args.replace)) numReplaceArgs = args.replace.length;
  else if (typeof args.replace == "string") numReplaceArgs = 1;

  // TODO needs explanation
  let most = (numFindArgs >= numReplaceArgs) ? numFindArgs : numReplaceArgs;
  if (most === 0) most = 1;

  for (let index = 0; index < most; index++) {   

    const splitArgs = await _buildFindArgs(args, index);

    if (!splitArgs.find && !splitArgs.replace && !splitArgs.restrictFind?.startsWith("next"))
      findCommands.findAndSelect(editor, splitArgs); // find and select all even if restrictFind === selections

    // add all "empty selections" to editor.selections_replaceInSelections
    else if (args.restrictFind === "selections" && splitArgs.replace !== undefined) {
      findCommands.addEmptySelectionMatches(editor);
      findCommands.replaceInSelections(editor, edit, splitArgs);
    }

    else if ((splitArgs.restrictFind === "line" || splitArgs.restrictFind === "once") && splitArgs.replace !== undefined) {
      findCommands.replaceInLine(editor, edit, splitArgs);
    }

    // find/noFind and replace/noReplace, restrictFind = nextSelect/nextMoveCursor/nextDontMoveCursor
    else if (splitArgs.restrictFind?.startsWith("next")) {
      findCommands.replaceNextInWholeDocument(editor, edit, splitArgs);
    }

    // find and replace, restrictFind = document/default
    else if (splitArgs.replace !== undefined) {
      findCommands.replaceInWholeDocument(editor, edit, splitArgs);
    }

    else findCommands.findAndSelect(editor, splitArgs);   // find but no replace
  }
}


/**
 * Get the args for each step in a possible find/replace array of commands.
 * 
 * @param {object} args - all args from a 'findInCurrentFile' keybinding or setting
 * @param {number} index - for which step to retrieve its args
 * @returns {Promise<object>} - all args for this command
 */
async function _buildFindArgs(args, index)  {

	const editor = vscode.window.activeTextEditor;
	let madeFind = false;

	let clipText = "";
	await vscode.env.clipboard.readText().then(string => {
		clipText = string;
  });
  
	let  indexedArgs = { restrictFind: "document", isRegex: false, cursorMoveSelect: "", matchWholeWord: false, matchCase: false };
	Object.assign(indexedArgs, args);

	if (!Array.isArray(args.find) && args.find && index === 0) indexedArgs.find = args.find;
  else if (Array.isArray(args.find) && args.find.length > index) indexedArgs.find = args.find[index];

	// if no 'find' key generate a findValue using the selected words/wordsAtCursors as the 'find' value
	// or if find === "" empty string ==> use wordsAtCursors
  // or if find is an array but length < replace array
  else {
    // if multiple selections, isRegex must be true  TODO
    const findObject = variables.makeFind(editor.selections, args);
    indexedArgs.find = findObject.find;
    indexedArgs.isRegex = indexedArgs.isRegex || findObject.mustBeRegex;
    madeFind = true;
    indexedArgs.pointReplaces = findObject.emptyPointSelections;
  }
  
  //  "find": "(\\$1 \\$2)" if find has (double-escaped) capture groups 
  if (indexedArgs.find && /\\\$(\d+)/.test(indexedArgs.find)) {
    indexedArgs.find = await variables.replaceFindCaptureGroups(indexedArgs.find);
  }
  
  // handle "replace": ""  <== empty string should remove find values
	if (!Array.isArray(args.replace) && (args.replace || args.replace === "")) indexedArgs.replace = args.replace;
  else if (Array.isArray(args.replace) && args.replace.length > index) indexedArgs.replace = args.replace[index];
    
  // if more finds than replaces, re-use the last replace
  else if (Array.isArray(args.replace)) indexedArgs.replace = args.replace[args.replace.length - 1];
    
  // necessary?
	// else if (!args.find) {  // no find and no replace
		// replaceValue = "$1";
		// indexedArgs.isRegex = true;
		// findValue = `(${findValue})`;
	// }

  const currentLanguageConfig = await utilities.getlanguageConfigComments(indexedArgs);

	let regexOptions = "gmi";
	if (indexedArgs.matchCase) regexOptions = "gm";

	let resolvedArgs = { regexOptions, madeFind, clipText, currentLanguageConfig };
	resolvedArgs = Object.assign(indexedArgs, resolvedArgs);

	return resolvedArgs;
}

/**
 * Called from extension.js 'searchInFolder' or 'searchInFile' registerCommand()
 * to parse the args to get the 'filesToInclude' search arg.
 * 
 * @param {Array} commandArgs 
 * @param {string} resourceType - file or folder
 * @returns {Promise<String>} - folders/files for the 'filesToInclude' arg
 */
exports.parseArgs = async function (commandArgs, resourceType) {

  let editorPath = vscode.window.activeTextEditor.document.uri.path;
  let resources = "";
  let getRelativePath;

  if (resourceType === "folder") getRelativePath = utilities.getRelativeFolderPath;
  else getRelativePath = utilities.getRelativeFilePath;              // resourceType === "file"
  
  if (!commandArgs.length) return getRelativePath(editorPath);       // from Command Palette or keybinding with no args

  else if (commandArgs?.length === 1) {                              // keybindings and editor/context
    return getRelativePath(editorPath);
  }

  else if (commandArgs?.length === 2) {
    if (Object.keys(commandArgs[1]).includes("editorIndex")) {       // editor/title/context
      return getRelativePath(commandArgs[0].fsPath);
    }
    else if (commandArgs[1][0] instanceof vscode.Uri) {              // explorer/context
      for (const resource of commandArgs[1]) {
        const thisResource = vscode.workspace.asRelativePath(resource.fsPath);
        resources += `${ thisResource }, `;
      }
      resources = resources.substring(0, resources.length - 2);  // strip ', ' off end
      return resources;
    }
  }
}