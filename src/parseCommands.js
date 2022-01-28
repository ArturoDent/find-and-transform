const vscode = require('vscode');
const findCommands = require('./transform');
const variables = require('./variables');
const utilities = require('./utilities');


/**
 * From 'findInCurrentFile' settings or keybindings. If necessary, split and run each command into 
 * its separate steps (if find/replace are arrays of multiple values).
 * 
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param { Object } args
 */
exports.splitFindCommands = async function (editor, edit, args) {

	let numFindArgs = 0;
  let numReplaceArgs = 0;

  if (Array.isArray(args.find)) numFindArgs = args.find.length;
  else if (typeof args.find == "string") numFindArgs = 1;
   // even if no 'find' one will be created from "wordAtCursor"

  if (Array.isArray(args.replace)) numReplaceArgs = args.replace.length;
  else if (typeof args.replace == "string") numReplaceArgs = 1;

  let most = (numFindArgs >= numReplaceArgs) ? numFindArgs : numReplaceArgs;
  if (most === 0) most = 1;

  for (let index = 0; index < most; index++) {   
  // for (let index = 0; index <= most; index++) {
    // for await (let arg of args) {

    const splitArgs = await _buildArgs(args, index);

  // if (!findItem.length && !replaceItem.length && !args.restrictFind.startsWith("next"))
    if (!splitArgs.find && !splitArgs.replace && !args.restrictFind.startsWith("next"))
      await findCommands.findAndSelect(editor, splitArgs); // find and select all even if restrictFind === selections

    // add all "empty selections" to editor.selections_replaceInSelections
    else if (args.restrictFind === "selections" && args.replace !== undefined) {
      await findCommands.addEmptySelectionMatches(editor, splitArgs.regexOptions);
      await findCommands.replaceInSelections(editor, edit, splitArgs);
    }

    else if ((splitArgs.restrictFind === "line" || splitArgs.restrictFind === "once") && splitArgs.replace !== undefined) {
      await findCommands.replaceInLine(editor, edit, splitArgs);
    }

    // find/noFind and replace/noReplace, restrictFind = nextSelect/nextMoveCursor/nextDontMoveCursor
    else if (splitArgs.restrictFind === "nextMoveCursor" || splitArgs.restrictFind === "nextSelect" || splitArgs.restrictFind === "nextDontMoveCursor") {
      await findCommands.replaceNextInWholeDocument(editor, edit, splitArgs);
    }

    // find and replace, restrictFind = document/default
    else if (splitArgs.replace !== undefined) {
      await findCommands.replaceInWholeDocument(editor, edit, splitArgs);
    }

    else await findCommands.findAndSelect(editor, splitArgs);   // find but no replace
  }
}


/**
 * Get the args for each step in a possible find/replace array of commands.
 * 
 * @param {Object} args - all args from a 'findInCurrentFile' keybinding or setting
 * @param {Number} index - for which step to retrieve its args
 * @returns {Promise<Object>} - all args for this command
 */
async function _buildArgs(args, index)  {

	const editor = vscode.window.activeTextEditor;
	let madeFind = false;

	let clipText = "";
	await vscode.env.clipboard.readText().then(string => {
		clipText = string;
  });
  
  let resultsFiles = "";
  
  await vscode.commands.executeCommand('search.action.copyAll');
  await vscode.env.clipboard.readText()
    .then(async results => {
      if (results) {
        results = results.replaceAll(/^\s*\d.*$\s?|^$\s/gm, "");
        let resultsArray = results.split(/[\r\n]{1,2}/);  // does this cover all OS's?

        let pathArray = resultsArray.filter(result => result !== "");
        pathArray = pathArray.map(path => utilities.getRelativeFilePath(path));

        resultsFiles = pathArray.join(", ");
      }
      else {
        // notifyMessage
        resultsFiles = "";
      }
      // put the previous clipBoard text back on the clipboard
      await vscode.env.clipboard.writeText(clipText);
    });
  

	let  defaultArgs = { restrictFind: "document", isRegex: false, cursorMoveSelect: "", matchWholeWord: false, matchCase: false };
	Object.assign(defaultArgs, args);

	let findValue = "";
	if (!Array.isArray(args.find) && args.find) findValue = args.find;
  else if (Array.isArray(args.find) && args.find.length > index) findValue = args.find[index];
    
	// no 'find' key generate a findValue using the selected words/wordsAtCursors as the 'find' value
	// or if find === "" empty string ==> use wordsAtCursors
  else {
    // if multiple selections, isRegex must be true  TODO
    const findObject = variables.makeFind(editor.selections, args);
    findValue = findObject.find;
    defaultArgs.isRegex = defaultArgs.isRegex || findObject.mustBeRegex;
		madeFind = true;
	}

	let replaceValue = undefined;

  // handle "replace": ""  <== empty string should remove find values
	if (!Array.isArray(args.replace) && (args.replace || args.replace === "")) replaceValue = args.replace;
  else if (Array.isArray(args.replace) && args.replace.length > index) replaceValue = args.replace[index];
    
  // if more finds than replaces, re-use the last replace
  else if (Array.isArray(args.replace)) replaceValue = args.replace[args.replace.length - 1];
    
  // TODO necessary?
	else if (!args.find) {  // no find and no replace
		replaceValue = "$1";
		defaultArgs.isRegex = true;
		findValue = `(${findValue})`;
	}

	let regexOptions = "gmi";
	if (defaultArgs.matchCase) regexOptions = "gm";

	let resolvedArgs = { find:findValue, replace:replaceValue, regexOptions, madeFind, clipText, resultsFiles };
	resolvedArgs = Object.assign(defaultArgs, resolvedArgs);

	return resolvedArgs;
}


/**
 * Called from extension.js 'searchInFolder' or 'searchInFile' registerCommand()
 * to parse the args to get the 'filesToInclude' search arg.
 * 
 * @param {Array} commandArgs 
 * @param {String} resourceType - file or folder
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