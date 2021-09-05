const vscode = require('vscode');
const findCommands = require('./transform');
const variables = require('./variables');


/**
 * 
 * 
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param { Object } args
 */
exports.splitFindCommands = async function (editor, edit, args) {

	let numFindArgs = 1;
	let numReplaceArgs = 1;

	if (Array.isArray(args.find)) numFindArgs = args.find.length;
  if (Array.isArray(args.replace)) numReplaceArgs = args.replace.length;
  const most = (numFindArgs >= numReplaceArgs) ? numFindArgs : numReplaceArgs;

  for (let index = 0; index < most; index++) {    
    const splitArgs = await _buildArgs(args, index);
    console.log(splitArgs);

    // chose transform function here

  // if (!findItem.length && !replaceItem.length && !args.restrictFind.startsWith("next"))
    if (!splitArgs.find && !splitArgs.replace && !args.restrictFind.startsWith("next"))
      findCommands.findAndSelect(editor, splitArgs); // find and select all even if restrictFind === selections

    // add all "empty selections" to editor.selections_replaceInSelections
    else if (args.restrictFind === "selections" && args.replaceValue !== null) {
      findCommands.addEmptySelectionMatches(editor, splitArgs.regexOptions);
      findCommands.replaceInSelections(editor, edit, splitArgs);
    }

    else if ((splitArgs.restrictFind === "line" || splitArgs.restrictFind === "once") && splitArgs.replace !== null) {
      findCommands.replaceInLine(editor, edit, splitArgs);
    }

    // find/noFind and replace/noReplace, restrictFind = nextSelect/nextMoveCursor/nextDontMoveCursor
    else if (splitArgs.restrictFind === "nextMoveCursor" || splitArgs.restrictFind === "nextSelect" || splitArgs.restrictFind === "nextDontMoveCursor") {
      findCommands.replaceNextInWholeDocument(editor, edit, splitArgs);
    }

    // find and replace, restrictFind = document/default
    else if (splitArgs.replace !== null) {
      findCommands.replaceInWholeDocument(editor, edit, splitArgs);
    }

    else findCommands.findAndSelect(editor, splitArgs);   // find but no replace

    // await findCommands.replaceInLine(editor, edit, splitArgs);
  }
}


/**
 * 
 * @param {Object} args
 * @param {Number} index -
 * @returns {Promise<Object>}
 */
async function _buildArgs(args, index)  {

	const editor = vscode.window.activeTextEditor;
	let madeFind = false;

	let clipText = "";
	await vscode.env.clipboard.readText().then(string => {
		clipText = string;
	});

	// defaults
	let  defaultArgs = { restrictFind: "document", isRegex: false, cursorMoveSelect: "", matchWholeWord: false, matchCase: false };
	Object.assign(defaultArgs, args);

	let findValue = "";
	// returns an empty [] if no 'find'
	if (!Array.isArray(args.find) && args.find) findValue = args.find;
	else if (Array.isArray(args.find)) findValue = args.find[index];
	// no 'find' key generate a findValue using the selected words/wordsAtCursors as the 'find' value
	// TODO  what if find === "" empty string?
	else {
		findValue = variables.makeFind(editor.selections, args);
		madeFind = true;
	}

	let replaceValue = null;

	if (!Array.isArray(args.replace) && args.replace) replaceValue = args.replace;
	else if (Array.isArray(args.replace)) replaceValue = args.replace[index];
	else if (!args.find) {  // no find and no replace
		replaceValue = "$1";
		defaultArgs.isRegex = true;
		findValue = `(${findValue})`;
	}

	let regexOptions = "gmi";
	if (defaultArgs.matchCase) regexOptions = "gm";

	let resolvedArgs = { find:findValue, replace:replaceValue, regexOptions, madeFind, clipText };
	resolvedArgs = Object.assign(defaultArgs, resolvedArgs);

	return resolvedArgs;
}