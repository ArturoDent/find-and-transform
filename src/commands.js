const vscode = require('vscode');
const findCommands = require('./transform');
const searchCommands = require('./search');
const fs = require('fs');
const path = require('path');


/**
 * Get all the findInCurrentFile or runInSearchPanel settings
 * @param {String} setting - name of setting to retrieve
 * @returns {Promise<object>} array of settings
 */
exports.getSettings = async function (setting) {
	const settings = vscode.workspace.getConfiguration().get(setting);
	let findArray = [];

	if (settings) {
		findArray = Object.entries(settings);
		findArray = findArray.filter(current => (typeof current[0] === 'string'));
	}
	return findArray;
};


/**
 * Write the settings commands to package.json,
 * only way to get commands to show in the Command Palette
 *
 * @param {object} findSettings
 * @param {object} searchSettings
 * @param {vscode.ExtensionContext} context
 */
exports.loadCommands = function (findSettings, searchSettings, context) {

  let thisExtension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
	let packageCommands = thisExtension.packageJSON.contributes.commands;

	let findSettingsCommands   =  _makePackageCommandsFromFindSettings(findSettings);
	let searchSettingsCommands =  _makePackageCommandsFromSearchSettings(searchSettings);
	let settingsCommands       =  findSettingsCommands.concat(searchSettingsCommands);

  let packageEvents  =  thisExtension.packageJSON.activationEvents;
	let settingsEvents =  _makeSettingsEventsFromSettingsCommands(settingsCommands);

	if (!_commandArraysAreEquivalent(settingsCommands, packageCommands) ||
		!_activationEventArraysAreEquivalent(settingsEvents, packageEvents)) {

		thisExtension.packageJSON.contributes.commands = settingsCommands;
		thisExtension.packageJSON.activationEvents = settingsEvents;

		fs.writeFileSync(path.join(context.extensionPath, 'package.json'), JSON.stringify(thisExtension.packageJSON, null, 1));
	}
}


/**
 * Transform the settings into package.json-style commands {command: "", title: ""}
 * @param {object} settings - this extension's settings from getCurrentSettings()
 * @returns {Array<vscode.Command> | Array} - package.json form of 'contributes.commands'
 */
function _makePackageCommandsFromFindSettings (settings) {

	// "findInCurrentFile": {
  //   "upcaseSwap2": {
	// 		"title": "swap iif <==> hello",
	// 		"find": "(iif) (hello)",
	// 		"replace": "_\\u$2_ _\\U$1_"  // double-escaped case modifiers
  //   }
	// }

  let settingsJSON = [];
	let category = "Find-Transform";

	let newCommand = {};
	newCommand.command = "findInCurrentFile.upcaseAllKeywords";
	newCommand.title = "Uppercase all Keywords";
	newCommand.category = category;
	settingsJSON.push(newCommand);

  for (const setting of settings) {
		let newCommand = {};
		newCommand.command = `findInCurrentFile.${ setting[0] }`;

		// warn here if there is no title?  vscode does it automatically
		if (setting[1].title) newCommand.title = setting[1].title;
		else newCommand.title = setting[0];

		newCommand.category = category;
		settingsJSON.push(newCommand);
  };
  return settingsJSON;
};

/**
 * Transform the settings into package.json-style commands {command: "", title: ""}
 * @param {object} settings - this extension's settings from getCurrentSettings()
 * @returns {Array<vscode.Command> | Array} - package.json form of 'contributes.commands'
 */
function _makePackageCommandsFromSearchSettings(settings) {

	// "runInSearchPanel": {
	// 	"removeDigits": {
	// 		"title": "Remove digits from Art....",
	// 		"find": "(?<=Art[^\\d]*)\\d+",   // non-fixed width lookbehind works, double-escaped
	// 		"replace": ""
	// 	}
	// }

  let settingsJSON = [];
	let category = "Find-Transform";

  for (const setting of settings) {
		let newCommand = {};
		newCommand.command = `runInSearchPanel.${ setting[0] }`;

		// warn here if there is no title?  vscode does it automatically
		if (setting[1].title) newCommand.title = setting[1].title;
		else newCommand.title = setting[0];

		newCommand.category = category;
		settingsJSON.push(newCommand);
  };
  return settingsJSON;
};


/**
 * Transform the settings (already transformed to package.json-style commands)
 * nto package.json 'activationEvents' : 'onCommand:<some command>'
 *
 * @param {object} settingsCommands
 * @returns {Array<String>} - an array of strings for package.json activationEvents
 */
function _makeSettingsEventsFromSettingsCommands (settingsCommands) {

				// "activationEvents": [
				//   "onStartupFinished",
				//   "onCommand:find-and-transform.findInCurrentFile.upcaseKeywords",
				// ],

  let settingsJSON = [];
  settingsJSON.push("onStartupFinished");

  for (const command of settingsCommands) {
    settingsJSON.push(`onCommand:${ command.command }`);
  }
  return settingsJSON;
};


/**
 * Are the settings commands and package.json commands the same?
 *
 * @param {Array} settings - commands constructed from the settings.json 'command aliases'
 * @param {Array} packages - the pre-existing commands from package.json
 * @returns {boolean}
 */
function _commandArraysAreEquivalent(settings, packages) {

  if (settings.length !== packages.length) return false;

  return settings.every(setting => packages.some(pcommand => {
    return (pcommand.command === setting.command) && (pcommand.title === setting.title) &&
    (pcommand.category === setting.category);
  }));
}


/**
 * Are the settings and package.json activationEvents the same?
 *
 * @param {Array<String>} settings - activationEvents constructed from the settings.json 'command aliases'
 * @param {Array<String>} packages - the pre-existing activationEvents from package.json
 * @returns {boolean}
 */
function _activationEventArraysAreEquivalent(settings, packages) {

  //   "onCommand:find-and-transform.upcaseKeywords",

  if (settings.length !== packages.length) return false;

  return settings.every(setting => packages.some(pevent => {
    return (pevent === setting);
  }));
}


/**
 * Get the settings and register TextEditorCommands for them
 * @param {Array} findArray
 * @param {vscode.ExtensionContext} context
 * @param {Array<vscode.Disposable>} disposables
 */
exports.registerFindCommands = function (findArray, context, disposables) {

	let disposable;

	for (const elem in findArray) {

		disposable = vscode.commands.registerTextEditorCommand(`findInCurrentFile.${ findArray[elem][0] }`, async (editor, edit) => {
			await findCommands.findTransform(editor, edit, findArray[elem][1]);
		});
		context.subscriptions.push(disposable);
		disposables.push(disposable);
	}
}

	/**
 * Get the settings and register TextEditorCommands for them
 * @param {Array} searchArray
 * @param {vscode.ExtensionContext} context
 * @param {Array<vscode.Disposable>} disposables
 */
exports.registerSearchCommands = function (searchArray, context, disposables) {

	let disposable;

	for (const elem in searchArray) {

		disposable = vscode.commands.registerCommand(`runInSearchPanel.${ searchArray[elem][0] }`, async () => {

			let temp = searchArray[0][1];
			let argsArray = [];

		// args in setting may be in any order
			if (temp) {
				argsArray = searchCommands.getKeysAndDefaultsFromArgs(temp);

			// argsArray = [
			// 	{ "find":             temp.find ?? ""},
			// 	{ "replace":          temp.replace ?? ""},
			// 	{ "triggerSearch":    temp.triggerSearch  ?? true},
			// 	{ "isRegex":          temp.isRegex        ?? true },
			// 	{ "filesToInclude":   temp.filesToInclude ?? "${file}" },
			// 	{ "preserveCase":     temp.preserveCase   ?? true },
			// 	{ "useExcludeSettingsAndIgnoreFiles": temp.useExcludeSettingsAndIgnoreFiles ?? true },
			// 	{ "isCaseSensitive": temp.isCaseSensitive ?? true },
			// 	{ "matchWholeWord":   temp.matchWholeWord ?? false },
			// 	{ "filesToExclude":   temp.filesToExclude ?? "" }
			// ];
		}

			searchCommands.useSearchPanel(argsArray);
		});
		context.subscriptions.push(disposable);
		disposables.push(disposable);
	}
}


// /**
//  * Register a command that uses the Search Panel
//  * @param {Object} findArray
//  */
// exports.useSearchPanel = function (findArray) {

// 	// let filesToInclude = findArray.find(elem => {
// 	// 	findArray.includes(elem.find);
// 	// });

// 	let filesToInclude = _parseVariables(findArray[4].filesToInclude);

// 	vscode.commands.executeCommand('workbench.action.findInFiles',
// 		{
// 			query: findArray[0].find,
// 			replace: findArray[1].replace,
// 			triggerSearch: findArray[2].triggerSearch,
// 			isRegex: findArray[3].isRegex,
// 			filesToInclude: filesToInclude,
// 			preserveCase: findArray[5].true,
// 			useExcludeSettingsAndIgnoreFiles: findArray[6].useExcludeSettingsAndIgnoreFiles,
// 			isCaseSensitive: findArray[7].isCaseSensitive,
// 			matchWholeWord: findArray[8].matchWholeWord,
// 			filesToExclude: findArray[9].filesToExclude
// 		}).then(() => {
// 			if (findArray[2].triggerSearch)
// 				setTimeout(() => {
// 					vscode.commands.executeCommand('search.action.replaceAll');
// 				}, 1000);
// 		});
// }

// // * ${workspaceFolder} - the path of the folder opened in VS Code
// // * ${workspaceFolderBasename} - the name of the folder opened in VS Code without any slashes (/)
// // * ${file} - the current opened file
// // * ${fileWorkspaceFolder} - the current opened file's workspace folder
// // * ${relativeFile} - the current opened file relative to workspaceFolder
// // * ${relativeFileDirname} - the current opened file's dirname relative to workspaceFolder
// // * ${fileDirname} - the current opened file's dirname
// // ${cwd} - the task runner's current working directory on startup
// // ${selectedText} - text selected in your code editor
// // ${pathSeparator} - / on macOS or linux, \\ on Windows



// function _parseVariables(include) {

// 	if (typeof include !== 'string') return "";

// 	const re = /(\${file}|\${relativeFile}|\${fileDirname}|\${fileWorkspaceFolder}|\${workspaceFolder}|\${relativeFileDirname}|\${workspaceFolderBasename}|\${selectedText}|\${pathSeparator})/g;

// 	const matches = [...include.matchAll(re)];
// 	if (!matches.length) return include;

// 	let filePath = vscode.window.activeTextEditor.document.uri.path;
// 	let relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri);

// 	// let ws = vscode.window.activeTextEditor.
// 	// if no filePath message to open an editor

// 	for (const item of matches) {

// 		let resolved = "";

// 		switch (item[1]) {

// 			case "${file}":
// 				resolved = filePath.substring(4);
// 				break;

// 			case "${relativeFile}":
// 				resolved = relativePath;
// 				break;

// 			case "${fileDirname}":
// 				resolved = path.dirname(filePath);
// 				break;

// 			case "${fileWorkspaceFolder}":
// 				resolved = relativePath.replace(/(^[^/\\]*).*/, "$1");
// 				break;

// 			case "${workspaceFolder}":
// 				resolved = vscode.workspace.workspaceFolders[0].uri.fsPath;
// 				break;

// 			case "${relativeFileDirname}":
// 				resolved = path.dirname(relativePath);
// 				break;

// 			case "${workspaceFolderBasename}":
// 				resolved = path.basename(vscode.workspace.workspaceFolders[0].uri.fsPath);
// 				break;

// 			case "${selectedText}":
// 				resolved = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selections[0]);
// 				break;

// 			case "${pathSeparator}":
// 				// resolved = .+path.sep
// 				resolved = path.sep;
// 				break;

// 			default:
// 				break;
// 		}
// 		include = include.replace(item[1], resolved);
// 	}

// 	return include;
// }

// // c:\Users\Mark\OneDrive\TestMultiRoot\test.txt
// // C:\Users\Mark\AppData\Roaming\Code - Insiders\User\keybindings.json