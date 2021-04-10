const vscode = require('vscode');
const path = require('path');


exports.getKeysAndDefaultsFromArgs = function (args)  {

return [
				{ "find":             args.find },
				{ "replace":          args.replace },
				{ "triggerSearch":    args.triggerSearch  ?? true},
				{ "isRegex":          args.isRegex        ?? true },
				{ "filesToInclude":   args.filesToInclude ?? "" },
				{ "preserveCase":     args.preserveCase   ?? true },
				{ "useExcludeSettingsAndIgnoreFiles": args.useExcludeSettingsAndIgnoreFiles ?? true },
				{ "isCaseSensitive": args.isCaseSensitive ?? true },
				{ "matchWholeWord":   args.matchWholeWord ?? false },
				{ "filesToExclude":   args.filesToExclude ?? "" }
			];
}

exports.getKeys = function () {
	return ["title", "find", "replace", "triggerSearch", "isRegex", "filesToInclude", "preserveCase",
					"useExcludeSettingsAndIgnoreFiles", "isCaseSensitive", "matchWholeWord", "filesToExclude"];
}

exports.getDefaults = function () {
	// return {
	// 					"title": "",
	// 					"find": "",
	// 					"replace": "",
	// 					"filesToInclude": "${file}",
	// 					"filesToExclude": ""
	// 			};
	return {
					"title": "",
					"find": "",
					"replace": "",
					"restrictFind": "document",   							// else "selections"
					"triggerSearch": true,
					"isRegex": true,
					"filesToInclude": "${file}",               	// default is ${file} = current file
					"preserveCase": true,
					"useExcludeSettingsAndIgnoreFiles": true,
					"isCaseSensitive": true,
					"matchWholeWord": false,                    // default is false
					"filesToExclude": ""
	};
}

/**
 * Register a command that uses the Search Panel
 * @param {Object} findArray
 */
exports.useSearchPanel = function (findArray) {

	// let filesToInclude = findArray.find(elem => {
	// 	findArray.includes(elem.find);
	// });

	let filesToInclude = _parseVariables(findArray[4].filesToInclude);

	vscode.commands.executeCommand('workbench.action.findInFiles',
		{
			query: findArray[0].find,
			replace: findArray[1].replace,
			triggerSearch: findArray[2].triggerSearch,
			isRegex: findArray[3].isRegex,
			filesToInclude: filesToInclude,
			preserveCase: findArray[5].true,
			useExcludeSettingsAndIgnoreFiles: findArray[6].useExcludeSettingsAndIgnoreFiles,
			isCaseSensitive: findArray[7].isCaseSensitive,
			matchWholeWord: findArray[8].matchWholeWord,
			filesToExclude: findArray[9].filesToExclude
		}).then(() => {
			if (findArray[2].triggerSearch)
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
// ${selectedText} - text selected in your code editor
// ${pathSeparator} - / on macOS or linux, \\ on Windows



function _parseVariables(include) {

	if (typeof include !== 'string') return "";

	const re = /(\${file}|\${relativeFile}|\${fileDirname}|\${fileWorkspaceFolder}|\${workspaceFolder}|\${relativeFileDirname}|\${workspaceFolderBasename}|\${selectedText}|\${pathSeparator})/g;

	const matches = [...include.matchAll(re)];
	if (!matches.length) return include;

	let filePath = vscode.window.activeTextEditor.document.uri.path;
	let relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri);

	// let ws = vscode.window.activeTextEditor.
	// if no filePath message to open an editor

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

// c:\Users\Mark\OneDrive\TestMultiRoot\test.txt
// C:\Users\Mark\AppData\Roaming\Code - Insiders\User\keybindings.json