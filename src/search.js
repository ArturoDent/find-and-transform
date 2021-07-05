const vscode = require('vscode');
// const path = require('path');
const utilities = require('./utilities');


/**
 * Input args is an object from runInSearchPanel keybindings or settings
 * @param {Array} args
 * @returns {Array<Object>} - an array of objects {key: value}
 */
exports.getObjectFromArgs = function (args) {

	const argsArray = [];

	for (const [key, value] of Object.entries(args)) {
		const obj = new Object();
		obj[`${ key }`] = value;
		argsArray.push(obj);
	}

	return argsArray;
}

/**
 * Get just the runInSearchPanel args keys, like "title", "find", etc.
 * @returns {Array}
 */
exports.getKeys = function () {
	return ["title", "find", "replace", "triggerSearch", "triggerReplaceAll", "isRegex", "filesToInclude", "preserveCase",
					"useExcludeSettingsAndIgnoreFiles", "isCaseSensitive", "matchWholeWord", "filesToExclude"];
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
		"cursorMoveSelect": "",
		"triggerSearch": true,
		"triggerReplaceAll": false,
		// "isRegex": true,
		"filesToInclude": "",               	// default is current workspace
		// "preserveCase": true,
		// "useExcludeSettingsAndIgnoreFiles": true,
		// "isCaseSensitive": true,
		// "matchWholeWord": true,                    // default is false
		// "filesToExclude": ""
	};
}

/**
 * Register a command that uses the Search Panel
 * @param {Object} findArray
 */
exports.useSearchPanel = async function (findArray) {

	const obj = new Object();

	const isfilesToInclude = findArray.find(arg => Object.keys(arg)[0] === 'filesToInclude');
	if (isfilesToInclude) {
		obj["filesToInclude"] = await utilities.parseVariables(isfilesToInclude.filesToInclude, "filesToInclude");
	}

	const replace = findArray.find(arg => Object.keys(arg)[0] === 'replace');
	if (replace?.replace) obj["replace"] = await utilities.parseVariables(replace.replace, "replace");

	const replaceAll = findArray.find(arg => Object.keys(arg)[0] === 'triggerReplaceAll');
	if (replaceAll) {
		obj["triggerSearch"] = true;
	}
	else {
		let triggerSearch = findArray.find(arg => Object.keys(arg)[0] === 'triggerSearch');
		if (triggerSearch) obj["triggerSearch"] = triggerSearch.triggerSearch;
	}

	const find = findArray.find(arg => Object.keys(arg)[0] === 'find');
	// if (find?.find) obj["query"] = find.find;
	if (find?.find) obj["query"] = await utilities.parseVariables(find.find, "find");

	findArray.forEach(arg => {
		const key = Object.keys(arg)[0];
		if (key.search(/^(filesToInclude|find|replace|triggerSearch)$/) === -1) {
			obj[`${ key }`] = Object.values(arg)[0];
		}
	});

	// respect search.seedWithNearestWord' setting
	// need this - without it the context menu command is not working !! 

	// if (!obj['query']) {
	// 	const seed = await vscode.workspace.getConfiguration().get("search.seedWithNearestWord");
	// 	const document = vscode.window.activeTextEditor.document;
	// 	const selections = vscode.window.activeTextEditor.selections;
	// 	if (seed) {			 // enabled
	// 			if (selections[0].isEmpty) {
	// 				const wordRange = document.getWordRangeAtPosition(selections[0].start);
	// 				if (wordRange) obj['query'] = document.getText(wordRange);
	// 			}
	// 			else obj['query'] = document.getText(selections[0]);
	// 		}
	// 	else if (!seed)  {  //  just get the first selection, if empty do nothing
	// 		if (!selections[0].isEmpty) {
	// 			obj['query'] = document.getText(selections[0]);
	// 		}
	// 		else obj['query'] = "";
	// 	}
	// }

	if (!obj['query']) {
		const document = vscode.window.activeTextEditor?.document;
		if (!document) obj['query'] = "";
		else {
			const selections = vscode.window.activeTextEditor?.selections;
			if (selections[0].isEmpty) {
				const wordRange = document.getWordRangeAtPosition(selections[0].start);
				if (wordRange) obj['query'] = document.getText(wordRange);
				else obj['query'] = "";  // no word at cursor
			}
			else obj['query'] = document.getText(selections[0]);
		}
	}


	vscode.commands.executeCommand('workbench.action.findInFiles',
		obj	).then(() => {
			if (obj['triggerReplaceAll'])
				setTimeout(() => {
					vscode.commands.executeCommand('search.action.replaceAll');
				}, 1000);
		});
}


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



