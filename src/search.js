const vscode = require('vscode');
// const path = require('path');
const utilities = require('./utilities');
const variables = require('./variables');



/**
 * Input args is an object from runInSearchPanel keybindings or settings
 * @param {Array} argsArray
 * @returns {Object} - an array of objects {key: value}
 */
exports.getObjectFromArgs = function (argsArray) {

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
  return ["title", "find", "replace", "triggerSearch", "triggerReplaceAll", "isRegex", "filesToInclude", "preserveCase", 
		"useExcludeSettingsAndIgnoreFiles", "matchWholeWord", "matchCase", "filesToExclude", "onlyOpenEditors"];
}

/**
 * Get just the runSearchInPanel args values, like true/false, "selections", etc.
 * @returns {Object}
 */
exports.getValues = function () {    // removed "isCaseSensitive" in favor of "matchCase"
	return {
		title: "string", find: "string", replace: "string", isRegex: [true, false], matchCase: [true, false],
		matchWholeWord: [true, false], triggerSearch: [true, false], triggerReplaceAll: [true, false],
    useExcludeSettingsAndIgnoreFiles: [true, false], preserveCase: [true, false],
		filesToInclude: "string", filesToExclude: "string", onlyOpenEditors: [true, false]
	};
}

/**
 * Get the default values for all runInSearchPanel keys
 * @returns {Object} - {"title": "", "find": ""}
 */
exports.getDefaults = function () {
	return {
		"title": "",
		"find": "",
		"replace": "",
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
 * @param {Object} args
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
        // notifyMessage
        args.resultsFiles = "";
      }
      // put the previous clipBoard text back on the clipboard
      await vscode.env.clipboard.writeText(clipText);
    });

  if (args.filesToInclude) args.filesToInclude = await variables.resolveSearchPathVariables(args.filesToInclude, args, "filesToInclude", vscode.window.activeTextEditor.selections[0]);
  if (args.filesToExclude) args.filesToExclude = await variables.resolveSearchPathVariables(args.filesToExclude, args, "filesToExclude", vscode.window.activeTextEditor.selections[0]);
  if (args.replace) args.replace = await variables.resolveSearchPathVariables(args.replace, args, "replace", vscode.window.activeTextEditor.selections[0]);
  
  if (args.find) {
    // regex was passed as true, so changed caller to 'findSearch' from 'find'
    args.query = await variables.resolveSearchPathVariables(args.find, args, "findSearch", vscode.window.activeTextEditor.selections[0]);
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

// /**
//  * Register a command that uses the Search Panel
//  * @param {Object} findArray
//  */
// exports.useSearchPanel = async function (findArray) {

//   const obj = new Object();

//   let clipText = "";
//   await vscode.env.clipboard.readText().then(string => {
//     clipText = string;
//   });
  
//   //  combine these like in transform.js

// 	const isfilesToInclude = findArray.find(arg => Object.keys(arg)[0] === 'filesToInclude');
// 	if (isfilesToInclude) {
// 		obj["filesToInclude"] = 
//     variables.resolvePathVariables(isfilesToInclude.filesToInclude, "filesToInclude", false, vscode.window.activeTextEditor.selections[0], clipText);
// 	}

// 	const isfilesToExclude = findArray.find(arg => Object.keys(arg)[0] === 'filesToExclude');
// 	if (isfilesToExclude) {
// 		obj["filesToExclude"] = 
//       variables.resolvePathVariables(isfilesToExclude.filesToExclude, "filesToExclude", false, vscode.window.activeTextEditor.selections[0], clipText);
// 	}

// 	const replace = findArray.find(arg => Object.keys(arg)[0] === 'replace');
//   if (replace?.replace) obj["replace"] =
//     variables.resolvePathVariables(replace.replace, "replace", false, vscode.window.activeTextEditor.selections[0], clipText);

// 	const triggerReplaceAll = findArray.find(arg => Object.keys(arg)[0] === 'triggerReplaceAll');
// 	if (triggerReplaceAll) {
// 		obj["triggerSearch"] = true;
// 	}
// 	else {
//     let triggerSearch = findArray.find(arg => Object.keys(arg)[0] === 'triggerSearch');
//     if (triggerSearch) obj["triggerSearch"] = triggerSearch.triggerSearch;
// 	}

// 	const find = findArray.find(arg => Object.keys(arg)[0] === 'find');
//   // if (find?.find) obj["query"] = variables.resolvePathVariables(find.find, "find", true, vscode.window.activeTextEditor.selections[0], clipText);
//   if (find) obj["query"] = variables.resolvePathVariables(find.find, "find", true, vscode.window.activeTextEditor.selections[0], clipText);

// 	findArray.forEach(arg => {
// 		const key = Object.keys(arg)[0];
// 		if (key.search(/^(filesToInclude|filesToExclude|find|replace|triggerSearch)$/) === -1) {
// 			obj[`${ key }`] = Object.values(arg)[0];
// 		}
// 	});

// 	if (!obj['query']) {
// 		const document = vscode.window.activeTextEditor?.document;
// 		if (!document) obj['query'] = "";
// 		else {
// 			const selections = vscode.window.activeTextEditor?.selections;
// 			if (selections[0].isEmpty) {
// 				const wordRange = document.getWordRangeAtPosition(selections[0].start);
// 				if (wordRange) obj['query'] = document.getText(wordRange);
// 				else obj['query'] = "";  // no word at cursor
// 			}
// 			else obj['query'] = document.getText(selections[0]);
// 		}
//   }
  
//   if (obj["matchCase"]) obj["isCaseSensitive"] = obj["matchCase"];  // because search doesn't use "matchCase"!!

// 	vscode.commands.executeCommand('workbench.action.findInFiles',
// 		obj	).then(() => {
// 			if (obj['triggerReplaceAll'])
// 				setTimeout(() => {
// 					vscode.commands.executeCommand('search.action.replaceAll');
// 				}, 1000);
// 		});
// }


/**
 * If the "find" value uses a variable(s) return the resolved value
 * @param {*} find - the "find" value
 * @returns {Promise<String>}
 */
// async function _parseQuery(find) {

// 	if (typeof find !== 'string') return "";
// 	const re = /(\${CLIPBOARD})/g;
// 	const matches = [...find.matchAll(re)];
// 	if (!matches.length) return find;

// 	for (const item of matches) {

// 		let resolved = "";

// 		switch (item[1]) {
// 			case "${CLIPBOARD}":
// 				await vscode.env.clipboard.readText().then(string => {
// 					resolved = string;
// 				});
// 				break;

// 			default:
// 				break;
// 		}
// 		find = find.replace(item[1], resolved);
// 	}
// 	return find;
// }



