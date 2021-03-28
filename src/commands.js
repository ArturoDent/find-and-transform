const vscode = require('vscode');
const transform = require('./transform');
const fs = require('fs');
const path = require('path');


/**
 * Get all the find-and-transform settings
 * @returns {object} array of settings
 */
exports.getSettings = function() {
	const settings = vscode.workspace.getConfiguration().get("find-and-transform");
	let findArray = Object.entries(settings);
	findArray = findArray.filter(current => (typeof current[1] === 'string') || (Array.isArray(current[1])));
	return findArray;
};


/**
 * Write the settings commands to package.json,
 * only way to get commands to show in the Command Palette
 *
 * @param {object} settings
 * @param {vscode.ExtensionContext} context
 */
exports.loadCommands = function (settings, context) {

  let thisExtension = vscode.extensions.getExtension('ArturoDent.find-and-transform');

	let packageCommands = thisExtension.packageJSON.contributes.commands;
  let settingsPackageCommands = _makePackageCommandsFromSettings(settings);
  let packageEvents = thisExtension.packageJSON.activationEvents;
	let settingsEvents = _makeSettingsEventsFromSettingsPackageCommands(settingsPackageCommands);

	if (!_commandArraysAreEquivalent(settingsPackageCommands, packageCommands) ||
		!_activationEventArraysAreEquivalent(settingsEvents, packageEvents)) {

		thisExtension.packageJSON.contributes.commands = settingsPackageCommands;
		thisExtension.packageJSON.activationEvents = settingsEvents;

		fs.writeFileSync(path.join(context.extensionPath, 'package.json'), JSON.stringify(thisExtension.packageJSON, null, 1));
	}
}


/**
 * Transform the settings into package.json-style commands {command: "", title: ""}
 * @param {object} settings - this extension's settings from getCurrentSettings()
 * @returns {Array<vscode.Command> | Array} - package.json form of 'contributes.commands'
 */
function _makePackageCommandsFromSettings (settings) {

  let settingsJSON = [];
	let category = "Find-Transform";

	let newCommand = {};
	newCommand.command = "find-and-transform.upcaseAllKeywords";
	newCommand.title = "Uppercase all Keywords";
	newCommand.category = category;
	settingsJSON.push(newCommand);

  for (const setting of settings) {
		let newCommand = {};
		newCommand.command = `find-and-transform.${ setting[0] }`;
		newCommand.title = setting[1][0].title;
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
function _makeSettingsEventsFromSettingsPackageCommands (settingsCommands) {

				// "activationEvents": [
				//   "onStartupFinished",
				//   "onCommand:find-and-transform.upcaseKeywords",
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
exports.registerCommands = function(findArray, context, disposables) {

	let disposable;

	for (const elem in findArray) {
		// can these be made to take keybinding commands, probably just another generic "run" command in extension.js
			disposable = vscode.commands.registerTextEditorCommand(`find-and-transform.${findArray[elem][0]}`, async (editor, edit) => {
				transform.findTransform(editor, edit, findArray[elem][1]);
			});
		context.subscriptions.push(disposable);
		disposables.push(disposable);
	}
}