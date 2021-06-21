const vscode = require('vscode');
const path = require('path');


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
	return ["title", "find", "replace", "triggerSearch", "isRegex", "filesToInclude", "preserveCase",
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
		"restrictFind": "document",   	// else "selections", "line" or "once"
		"cursorMoveSelect": "",
		"triggerSearch": true,
		"isRegex": true,
		"filesToInclude": "",               	// default is current workspace
		"preserveCase": true,
		"useExcludeSettingsAndIgnoreFiles": true,
		"isCaseSensitive": true,
		"matchWholeWord": true,                    // default is false
		"filesToExclude": ""
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
		obj["filesToInclude"] = await _parseVariables(isfilesToInclude.filesToInclude);
	}

	const find = findArray.find(arg => Object.keys(arg)[0] === 'find');
	if (find?.find === "${CLIPBOARD}") {
		obj["query"] = await _parseQuery(find.find);
	}
	else if (find.find) obj["query"] = find.find;

	findArray.forEach(arg => {
		const key = Object.keys(arg)[0];
		if (key !== "filesToInclude") {
			if (!obj[`query`]) obj[`query`] = Object.values(arg)[0];
			else obj[`${ key }`] = Object.values(arg)[0];
		}
	});

	// if no find key use selections[0] or getWordRangeAtPosition()
	if (!obj['query']) {
		const document = vscode.window.activeTextEditor.document;
		const selections = vscode.window.activeTextEditor.selections;
		if (selections.length === 1 && selections[0].isEmpty) {
			const wordRange = document.getWordRangeAtPosition(selections[0].start);
			obj['query'] = document.getText(wordRange);
		}
		else obj['query'] = document.getText(selections[0]);
	}

	vscode.commands.executeCommand('workbench.action.findInFiles',
		obj	).then(() => {
			if (obj['triggerSearch'])
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
async function _parseQuery(find) {

	if (typeof find !== 'string') return "";
	const re = /(\${CLIPBOARD})/g;
	const matches = [...find.matchAll(re)];
	if (!matches.length) return find;

	for (const item of matches) {

		let resolved = "";

		switch (item[1]) {
			case "${CLIPBOARD}":
				await vscode.env.clipboard.readText().then(string => {
					resolved = string;
				});
				break;

			default:
				break;
		}
		find = find.replace(item[1], resolved);
	}
	return find;
}


/**
 * If the "filesToInclude" value uses a variable(s) return the resolved value
 * @param {String} include - the "filesToInclude" value
 * @returns {Promise<String>}
 */
async function _parseVariables(include) {

	if (typeof include !== 'string') return "";
	const re = /(\${file}|\${relativeFile}|\${fileDirname}|\${fileWorkspaceFolder}|\${workspaceFolder}|\${relativeFileDirname}|\${workspaceFolderBasename}|\${selectedText}|\${pathSeparator}|\${CLIPBOARD})/g;

	const matches = [...include.matchAll(re)];
	if (!matches.length) return include;

	const filePath = vscode.window.activeTextEditor.document.uri.path;
	const relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri);

	// if no filePath message to open an editor TODO

	for (const item of matches) {

		let resolved = "";

		switch (item[1]) {

			case "${file}":
				resolved = filePath.substring(4);
				break;

			case "${relativeFile}":
				resolved = relativePath;
				break;

			case "${fileDirname}":
				resolved = path.dirname(filePath);
				break;

			case "${fileWorkspaceFolder}":
				resolved = relativePath.replace(/(^[^/\\]*).*/, "$1");
				break;

			case "${workspaceFolder}":
				resolved = vscode.workspace.workspaceFolders[0].uri.fsPath;
				break;

			case "${relativeFileDirname}":
				resolved = path.dirname(relativePath);
				break;

			case "${workspaceFolderBasename}":
				resolved = path.basename(vscode.workspace.workspaceFolders[0].uri.fsPath);
				break;

			case "${selectedText}":
				resolved = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selections[0]);
				break;

			case "${CLIPBOARD}":
				await vscode.env.clipboard.readText().then(string => {
					resolved = string;
				});
				break;

			case "${pathSeparator}":
				resolved = path.sep;
				break;

			default:
				break;
		}
		include = include.replace(item[1], resolved);
	}

	return include;
}
