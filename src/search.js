const vscode = require('vscode');
// const path = require('path');
// const utilities = require('./utilities');
const variables = require('./variables');



/**
 * Input args is an object from runInSearchPanel keybindings or settings
 * @param {Array} args
 * @returns {Array<Object>} - an array of objects {key: value}
 */
exports.getObjectFromArgs = function (args) {

	const argsArray = [];

	// could be bad keys/values here
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
		"useExcludeSettingsAndIgnoreFiles", "isCaseSensitive", "matchWholeWord", "matchCase", "filesToExclude", "onlyOpenEditors"];
}

/**
 * Get just the runSearchInPanel args values, like true/false, "selections", etc.
 * @returns {Object}
 */
exports.getValues = function () {
	return {
		title: "string", find: "string", replace: "string", isRegex: [true, false], matchCase: [true, false],
		matchWholeWord: [true, false], triggerSearch: [true, false], triggerReplaceAll: [true, false],
		preserveCase: [true, false], useExcludeSettingsAndIgnoreFiles: [true, false], isCaseSensitive: [true, false],
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
		"filesToInclude": "",               	// default is current workspace
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
 * @param {Object} findArray
 */
exports.useSearchPanel = async function (findArray) {

	const obj = new Object();

	const isfilesToInclude = findArray.find(arg => Object.keys(arg)[0] === 'filesToInclude');
	if (isfilesToInclude) {
		obj["filesToInclude"] = variables.parseVariables(isfilesToInclude.filesToInclude, "filesToInclude", false, vscode.window.activeTextEditor.selections[0]);
	}

	const isfilesToExclude = findArray.find(arg => Object.keys(arg)[0] === 'filesToExclude');
	if (isfilesToExclude) {
		obj["filesToExclude"] = variables.parseVariables(isfilesToExclude.filesToExclude, "filesToExclude", false, vscode.window.activeTextEditor.selections[0]);
	}

	const replace = findArray.find(arg => Object.keys(arg)[0] === 'replace');
	if (replace?.replace) obj["replace"] = variables.parseVariables(replace.replace, "replace", false, vscode.window.activeTextEditor.selections[0]);

	const triggerReplaceAll = findArray.find(arg => Object.keys(arg)[0] === 'triggerReplaceAll');
	if (triggerReplaceAll) {
		obj["triggerSearch"] = true;
	}
	else {
		let triggerSearch = findArray.find(arg => Object.keys(arg)[0] === 'triggerSearch');		if (triggerSearch) obj["triggerSearch"] = triggerSearch.triggerSearch;
	}

	const find = findArray.find(arg => Object.keys(arg)[0] === 'find');
	// if (find?.find) obj["query"] = find.find;
	if (find?.find) obj["query"] = variables.parseVariables(find.find, "find", true, vscode.window.activeTextEditor.selections[0]);  // TODO add parseClipboard to all parseV's

	findArray.forEach(arg => {
		const key = Object.keys(arg)[0];
		if (key.search(/^(filesToInclude|filesToExclude|find|replace|triggerSearch)$/) === -1) {
			obj[`${ key }`] = Object.values(arg)[0];
		}
	});

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



