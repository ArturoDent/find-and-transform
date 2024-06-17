const { window, workspace, env, Uri } = require('vscode');

const document = require('./find/document');
const findAndSelect = require('./find/findAndSelect');
const line = require('./find/line');
const previousNext = require('./find/previousNext');
const selections = require('./find/selections');

const resolve = require('./resolveVariables');
const utilities = require('./utilities');
const transforms = require('./transform');


/**
 * Reduce any jsOp's in args.replace to single array elelments.
 * @param {string[]} arg - args.replace
 * @returns {Promise<string[] | string>}
 */
exports.buildJSOperationsFromArgs = async function (arg) {
  
  if (!Array.isArray(arg)) return arg;
  
  let start = -1;
  let end = -1;
  
  const isjsOpStart = (element) => element.toString().search(/^\s*\$\$\{[\s;]*/m) !== -1;
  const isjsOpEnd = (element) => element.toString().search(/^[\s;]*\}\$\$[\s;]*/m) !== -1;
  start = arg.findIndex(isjsOpStart);
  end = arg.findIndex(isjsOpEnd);
  
  if (start !== -1 && end !== -1)
    arg = arg.map(elem => {
      return elem.replace(/^\s*\$\$\{[\s;]*/m, '$$${').replace(/^[\s;]*\}\$\$[\s;]*/m, '}$$$');
    });
  
  if (Array.isArray(arg) && arg.length === 1)  return arg;  

  for (let index = 0; index < arg.length; index++) {
    
    let start = arg.indexOf('$${', index);
    let end = arg.indexOf('}$$', index);
    
    if (start !== -1 && end !== -1) {
      // remove consecutive semicolons at the end of each array element
      for (let j = start; j < end; j++) {
        arg[j] = arg[j].replace(/;{2,}$/m, ';');
      }
      // operation = one entire jsOperation; add a space between elements
      const operation = arg.slice(start, end+1).join(' ');
      // replace all the elements that made up a jsOperation with the single long operation as one element
      arg.splice(start, end+1 - start, operation);
    }
    arg[index] = arg[index].replace(/\$\$\{\s*;/g, '$$${');
  }
  return arg;
}



/**
 * From 'findInCurrentFile' settings or keybindings. If necessary, split and run each command in 
 * its separate steps (if find/replace are arrays of multiple values).
 * 
 * @param {import("vscode").TextEditor} editor
 * @param {object} args
 */
exports.splitFindCommands = async function (editor, args) {

	let numFindArgs = 0;
  let numReplaceArgs = 0;

  if (Array.isArray(args.find)) numFindArgs = args.find.length;
  else if (typeof args.find == "string") numFindArgs = 1;
   // even if no 'find' one will be created from "wordAtCursor"

  // and not startsWith $${ and endsWith } after args.replace.join('')
  if (Array.isArray(args.replace)) numReplaceArgs = args.replace.length;
  else if (typeof args.replace == "string") numReplaceArgs = 1;

  // needs explanation
  let most = (numFindArgs >= numReplaceArgs) ? numFindArgs : numReplaceArgs;
  if (most === 0) most = 1;

  for (let index = 0; index < most; index++) {   

    const splitArgs = await _buildFindArgs(args, index);

    // pointReplaces iff postCommands? could add 
    if (!splitArgs.find && !splitArgs.replace && !splitArgs.restrictFind?.startsWith("next"))
      await findAndSelect.findAndSelect(editor, splitArgs); // find and select all even if restrictFind === selections

    // add all "empty selections" to editor.selections_replaceInSelections
    else if (args.restrictFind === "selections" && splitArgs.replace !== undefined) {
      await transforms.addEmptySelectionMatches(editor);
      await selections.replaceInSelections(editor, splitArgs);
    }

    // else if ((splitArgs.restrictFind === "line" || splitArgs.restrictFind === "once") && splitArgs.replace !== undefined) {
    else if ((splitArgs.restrictFind === "line" || splitArgs.restrictFind?.startsWith("once")) && splitArgs.replace !== undefined) {
      await line.replaceInLine(editor, splitArgs);
    }

    // find/noFind and replace/noReplace, restrictFind = nextSelect/nextMoveCursor/nextDontMoveCursor
    else if (splitArgs.restrictFind?.startsWith("next") || splitArgs.restrictFind?.startsWith("previous")) {
      await previousNext.replacePreviousOrNextInWholeDocument(editor, splitArgs);
    }

    // find or makeFind and replace, restrictFind = document/default
    else if (splitArgs.replace !== undefined) {
      await document.replaceInWholeDocument(editor, splitArgs);
    }

    else await findAndSelect.findAndSelect(editor, splitArgs);   // find but no replace
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

  const editor = window.activeTextEditor;
	let madeFind = false;

  // delayed into resolveVariables
	// let clipText = "";
	// await env.clipboard.readText().then(string => {
	// 	clipText = string;
  // });
  
  // indexedArgs = defaults
	let  indexedArgs = { restrictFind: "document", isRegex: false, cursorMoveSelect: "", matchWholeWord: false, matchCase: false };
  Object.assign(indexedArgs, args);
  
	if (!Array.isArray(args.find) && args.find && index === 0) indexedArgs.find = args.find;
  else if (Array.isArray(args.find) && args.find.length > index) indexedArgs.find = args.find[index];

	// if no 'find' key generate a findValue using the selected words/wordsAtCursors as the 'find' value
	// or if find === "" empty string ==> use wordsAtCursors
  // or if find is an array but length < replace array
  else {
    // if multiple selections, isRegex must be true
    // if line/once don't call this here - do for each line
    // if selections, do later for each selection
    if (args.restrictFind !== "line" && args.restrictFind !== "selections" && !args.restrictFind?.startsWith("once")) {
      const findObject = await resolve.makeFind(editor.selections, args);
      indexedArgs.find = findObject.find;
      indexedArgs.isRegex = indexedArgs.isRegex || findObject.mustBeRegex;
      madeFind = true;
      indexedArgs.pointReplaces = findObject.emptyPointSelections;
    }
  }
  
  //  "find": "(\\$1 \\$2)" if find has (double-escaped) capture groups 
  if (indexedArgs.find && /\\\$(\d+)/.test(indexedArgs.find)) {
    indexedArgs.find = await resolve.replaceFindCaptureGroups(indexedArgs.find);
  }
  
  // handle "replace": ""  <== empty string should remove find values
	if (!Array.isArray(args.replace) && (args.replace || args.replace === "")) indexedArgs.replace = args.replace;
  else if (Array.isArray(args.replace) && args.replace.length > index) indexedArgs.replace = args.replace[index];
    
  // if more finds than replaces, re-use the last replace
  else if (Array.isArray(args.replace)) indexedArgs.replace = args.replace[args.replace.length - 1];
  
  if (!Array.isArray(args.run) && (args.run || args.run === "")) indexedArgs.run = args.run;
  else if (Array.isArray(args.run) && args.run.length > index) indexedArgs.run = args.run[index];
    
	let regexOptions = "gmi";
	if (indexedArgs.matchCase) regexOptions = "gm";
  
  if (indexedArgs.ignoreWhiteSpace && indexedArgs.find) {
    indexedArgs.find = indexedArgs.find.trim();
    indexedArgs.find = `\\n{0}` + indexedArgs.find.replace(/\s+/g, '\\s*');
  }

	let resolvedArgs = { regexOptions, madeFind };
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

  const { document } = window.activeTextEditor;
  
  let editorPath = document.uri.path;
  let getRelativePath;

  if (resourceType === "folder") getRelativePath = utilities.getRelativeFolderPath;
  else getRelativePath = utilities.getRelativeFilePath;              // resourceType === "file"
  
  if (!commandArgs.length) return getRelativePath(editorPath);      // from Command Palette or keybinding with no args

  else if (commandArgs?.length === 1) {                              // keybindings and editor/context
    return getRelativePath(editorPath);
  }

  else if (commandArgs?.length === 2) {
    if (Object.keys(commandArgs[1]).includes("editorIndex")) {       // editor/title/context - the editor tab
      return getRelativePath(commandArgs[0].fsPath);
    }
    else if (commandArgs[1][0] instanceof Uri) {              // explorer/context
      let resources = commandArgs[1].map(resource => workspace.asRelativePath(resource.fsPath));
      return resources.join(', ');
    }
  }
};



