const vscode = require('vscode');
const utilities = require('./utilities');
const variables = require('./variables');


/**
 * Input argsArray is an object from runInSearchPanel keybindings or settings
 * @param {Array} argsArray
 * @returns {Promise<object>} - an array of objects {key: value}
 */
exports.getObjectFromArgs = async function (argsArray) {

  const args = {};

	// could be bad keys/values here
	for (const [key, value] of Object.entries(argsArray)) {
    args[`${ key }`] = value;
	}
	return args;
}

/**
 * Get just the runInSearchPanel args keys, like "title", "find", etc.
 * @returns {Array}
 */
exports.getKeys = function () {  // removed "isCaseSensitive" in favor of "matchCase"
  return ["title", "preCommands", "find", "replace", "postCommands", "triggerSearch", "triggerReplaceAll", "isRegex", "filesToInclude",  
		"preserveCase", "useExcludeSettingsAndIgnoreFiles", "matchWholeWord", "matchCase", "filesToExclude", "onlyOpenEditors"];
}

/**
 * Get just the runSearchInPanel args values, like true/false, "selections", etc.
 * @returns {object}
 */
exports.getValues = function () {    // removed "isCaseSensitive" in favor of "matchCase"
	return {
    title: "string", find: "string", replace: "string", isRegex: [true, false], matchCase: [true, false],
    preCommands: "string", postCommands: "string",
		matchWholeWord: [true, false], triggerSearch: [true, false], triggerReplaceAll: [true, false],
    useExcludeSettingsAndIgnoreFiles: [true, false], preserveCase: [true, false],
		filesToInclude: "string", filesToExclude: "string", onlyOpenEditors: [true, false]
	};
}

/**
 * Get the default values for all runInSearchPanel keys
 * @returns {object} - {"title": "", "find": ""}
 */
exports.getDefaults = function () {
	return {
    "title": "",
    "preCommands": "",
		"find": "",
    "replace": "",
    "postCommands": "",
		"restrictFind": "document",   	      
		"triggerSearch": true,
		"triggerReplaceAll": 'false',
		// "isRegex": true,
		"filesToInclude": "",          // default is current workspace
		// "preserveCase": false,
		// "useExcludeSettingsAndIgnoreFiles": true,
		// "isCaseSensitive": false,
		// "matchWholeWord": false,
		// "matchCase": false
		// "filesToExclude": ""
		// "onlyOpenEditors": false
	};
}

/**
 * Register a command that uses the Search Panel
 * @param {object} args - the keybinding/settings args
 */
exports.useSearchPanel = async function (args) {

	let clipText = "";
  await vscode.env.clipboard.readText().then(string => {
    args.clipText = string;
	});
  
  await vscode.commands.executeCommand('search.action.copyAll');
  await vscode.env.clipboard.readText()
    .then(async results => {
      if (results) {
        results = results.replaceAll(/^\s*\d.*$\s?|^$\s/gm, "");
        let resultsArray = results.split(/[\r\n]{1,2}/);  // does this cover all OS's?

        let pathArray = resultsArray.filter(result => result !== "");
        pathArray = pathArray.map(path => utilities.getRelativeFilePath(path));

        args.resultsFiles = pathArray.join(", ");
      }
      else {
        // notifyMessage?
        args.resultsFiles = "";
      }
      // put the previous clipBoard text back on the clipboard
      await vscode.env.clipboard.writeText(clipText);
    });

  if (args.filesToInclude) args.filesToInclude = await variables.resolveSearchPathVariables(args.filesToInclude, args, "filesToInclude", vscode.window.activeTextEditor.selections[0]);
  if (args.filesToExclude) args.filesToExclude = await variables.resolveSearchPathVariables(args.filesToExclude, args, "filesToExclude", vscode.window.activeTextEditor.selections[0]);
  if (args.replace) args.replace = await variables.resolveSearchPathVariables(args.replace, args, "replace", vscode.window.activeTextEditor.selections[0]);
  
  if (args.find) {
    // "find": "(\\$1 \\$2)" replace capture groups with selections[n]
    const findValue = await variables.replaceFindCaptureGroups(args.find);
    // regex was passed as true, so changed caller to 'findSearch' from 'find'
    args.query = await variables.resolveSearchPathVariables(findValue, args, "findSearch", vscode.window.activeTextEditor.selections[0]);
  
    // TODO resolve more variable types?
    
    delete args.find;
  }
  else {
    const findObject = await variables.makeFind(vscode.window.activeTextEditor.selections, args);
    args.query = findObject.find;
    if (!args.isRegex && findObject.mustBeRegex) args.isRegex = true;
  }
  
  if (args.triggerReplaceAll) args.triggerSearch = true;
  if (args.matchCase) {
    args.isCaseSensitive = args.matchCase;  // because workbench.action.findInFiles does not use "matchCase"!!
    delete args.matchCase;
  }

	if (!args.query) {    // use the first selection "word" if no "query"
		const document = vscode.window.activeTextEditor?.document;
		if (!document) args.query = "";
		else {
			const selections = vscode.window.activeTextEditor?.selections;
			if (selections[0].isEmpty) {
				const wordRange = document.getWordRangeAtPosition(selections[0].start);
				if (wordRange) args.query = document.getText(wordRange);
				else args.query = "";  // no word at cursor
			}
			else args.query = document.getText(selections[0]);
		}
	}

  // do args.clipText and args.resultsFiles need to be removed?  Doesn't seem to affect anything.
	vscode.commands.executeCommand('workbench.action.findInFiles',
		args).then(() => {
			if (args.triggerReplaceAll)
				setTimeout(() => {
					vscode.commands.executeCommand('search.action.replaceAll');
				}, 1000);
		});
}