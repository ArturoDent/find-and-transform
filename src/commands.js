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

	const thisExtension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
	const packageCommands = thisExtension.packageJSON.contributes.commands;

	const builtins = _makeCommandsFromPackageCommands();

	const findSettingsCommands   =  _makePackageCommandsFromFindSettings(findSettings);
	const searchSettingsCommands =  _makePackageCommandsFromSearchSettings(searchSettings);
	const settingsCommands       =  findSettingsCommands.concat(searchSettingsCommands);

  const packageEvents  =  thisExtension.packageJSON.activationEvents;
	const settingsEvents =  _makeSettingsEventsFromSettingsCommands(settingsCommands);

	if (!_commandArraysAreEquivalent(settingsCommands, packageCommands) ||
		!_activationEventArraysAreEquivalent(settingsEvents, packageEvents)) {

		thisExtension.packageJSON.contributes.commands = builtins.concat(settingsCommands);
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
 * Transform the built-in commands into package.json-style commands {command: "", title: ""}
 * @returns {Array<vscode.Command> | Array} - package.json form of builtin 'contributes.commands'
 */
function _makeCommandsFromPackageCommands() {

	let builtins = [	{
			"command": "find-and-transform.searchInFile",
			"title": "Search in this File",
			"category": "Find-Transform"
		},
		{
			"command": "find-and-transform.searchInFolder",
			"title": "Search in this Folder",
			"category": "Find-Transform"
		},
		{
			"command": "find-and-transform.searchInResults",
			"title": "Search in the Results Files",
			"category": "Find-Transform"
		}
	];

	let builtinCommandsArray = [];
	let category = "Find-Transform";

	for (const builtin of builtins) {
		let newCommand = {};
		newCommand.command = builtin.command;
		newCommand.title = builtin.title;
		newCommand.category = category;
		builtinCommandsArray.push(newCommand);
	};
	return builtinCommandsArray;
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

	// subtract 3 for `find-and-transform.searchInFile` and `find-and-transform.searchInFolder` commands
  if (settings.length !== (packages.length-3)) return false;

  return settings.every(setting => packages.some(pcommand => {
		if ((pcommand.command !== "find-and-transform.searchInFile") && (pcommand.command !== "find-and-transform.searchInFolder")
			&& (pcommand.command !== "find-and-transform.searchInResults")) {
			return (pcommand.command === setting.command) && (pcommand.title === setting.title) &&
			(pcommand.category === setting.category);
		}
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
 * 
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
			if (temp) argsArray = searchCommands.getObjectFromArgs(temp);
			searchCommands.useSearchPanel(argsArray);
		});
		context.subscriptions.push(disposable);
		disposables.push(disposable);
	}
}