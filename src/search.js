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
					"restrictFind": "document",   							// else "selections"
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
exports.useSearchPanel = function (findArray) {

	const obj = new Object();
	const isfilesToInclude = findArray.find(arg => Object.keys(arg)[0] === 'filesToInclude');
	if (isfilesToInclude) {
		obj["filesToInclude"] = _parseVariables(isfilesToInclude);
	}

	findArray.forEach(arg => {
		const key = Object.keys(arg)[0];
		if (key !== "filesToInclude") {
			if (key === "find") obj[`query`] = Object.values(arg)[0];
			else obj[`${ key }`] = Object.values(arg)[0];
		}
	});

	// if no find key use selection[0]?
	if (!obj['query']) obj['query'] = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selections[0]);

	vscode.commands.executeCommand('workbench.action.findInFiles',
		obj	).then(() => {
			if (obj['triggerSearch'])
				setTimeout(() => {
					vscode.commands.executeCommand('search.action.replaceAll');
				}, 1000);
		});
}

// * ${workspaceFolder} - the path of the folder opened in VS Code
// * ${workspaceFolderBasename} - the name of the folder opened in VS Code without any slashes (/)
// * ${file} - the current opened file
// * ${fileWorkspaceFolder} - the current opened file's workspace folder
// * ${relativeFile} - the current opened file relative to workspaceFolder
// * ${relativeFileDirname} - the current opened file's dirname relative to workspaceFolder
// * ${fileDirname} - the current opened file's dirname
// ${cwd} - the task runner's current working directory on startup
// * ${selectedText} - text selected in your code editor, used for the query if none
// * ${pathSeparator} - / on macOS or linux, \\ on Windows


/**
 * If the filesToInclude value uses a variable(s) return the resolved value
 * @param {String} include - the filesToInclude value
 * @returns {String}
 */
function _parseVariables(include) {

	if (typeof include !== 'string') return "";

	const re = /(\${file}|\${relativeFile}|\${fileDirname}|\${fileWorkspaceFolder}|\${workspaceFolder}|\${relativeFileDirname}|\${workspaceFolderBasename}|\${selectedText}|\${pathSeparator})/g;

	const matches = [...include.matchAll(re)];
	if (!matches.length) return include;

	let filePath = vscode.window.activeTextEditor.document.uri.path;
	let relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri);

	// let ws = vscode.window.activeTextEditor.
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