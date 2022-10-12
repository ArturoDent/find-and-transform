const { workspace, commands, extensions} = require('vscode');
const fs = require('fs');
const path = require('path');

const drivers = require('./drivers');
// const parseCommands = require('./parseCommands');
// const searchCommands = require('./search');
const resolve = require('./resolveVariables');
const utilities = require('./utilities');


/**
 * Execute the pre/post commands, which are vscode commands and may have args
 * @param {string | string[] | object} userCommands
 * @param {string}  preOrPost - "preCommands" or "postCommands"
 * @param {object} groups
 */
exports.runPrePostCommands = async function (userCommands, preOrPost, groups) {
  
  // resolve variables here (but not capture groups - except in a choice), fill choices with array items, e.g.
  if (preOrPost === "postCommands") await new Promise(r => setTimeout(r, 300));
  
  if (typeof userCommands === 'string') await commands.executeCommand(userCommands);
  
  // does this handle multiple commands/args TODO
  else if (typeof userCommands === 'object' && !Array.isArray(userCommands)) {
    if (userCommands.args?.snippet?.search(/\$[\{\d]/) !== -1) {
      // first null is 'groups'
      userCommands.args.snippet = resolve.resolveVariables(userCommands.args, "snippet", groups, null, null, null);
    }
    await commands.executeCommand(userCommands.command, userCommands.args);
  }

  else if (Array.isArray(userCommands) && userCommands.length) {
    for (const command of userCommands) {
      if (typeof command === 'string') await commands.executeCommand(command);
      else if (typeof command === 'object')
        await commands.executeCommand(command.command, command.args);
    }
  }
}


/**
 * Get all the findInCurrentFile or runInSearchPanel settings
 * @param {String} setting - name of setting to retrieve
 * @returns {Promise<object>} array of settings
 */
exports.getSettings = async function (setting) {
  
  const settings = await workspace.getConfiguration().get(setting);
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
 * @param {import("vscode").ExtensionContext} context
 */
exports.loadCommands = async function (findSettings, searchSettings, context, enableWarningDialog) {

	const thisExtension = extensions.getExtension('ArturoDent.find-and-transform');
	const packageCommands = thisExtension.packageJSON.contributes.commands;

	const builtins = _makeCommandsFromPackageCommands();

	const findSettingsCommands   =  await _makePackageCommandsFromFindSettings(findSettings, enableWarningDialog);
	const searchSettingsCommands =  await _makePackageCommandsFromSearchSettings(searchSettings, enableWarningDialog);
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

// @returns { Array < vscode.Command > | Array; } - package.json form of 'contributes.commands'
/**
 * Transform the settings into package.json-style commands {command: "", title: ""}
 * @param {object} settings - this extension's settings from getCurrentSettings()
 * @param {boolean} enableWarningDialog
 * @returns { Promise<import("vscode").Command[] | any[]> } - package.json form of 'contributes.commands'
 */
async function _makePackageCommandsFromFindSettings(settings, enableWarningDialog) {

	// "findInCurrentFile": {z
  //   "upcaseSwap2": {
	// 		"title": "swap iif <==> hello",
	// 		"find": "(iif) (hello)",
	// 		"replace": "_\\u$2_ _\\U$1_"  // double-escaped case modifiers
  //   }
	// }

  let settingsJSON = [];
	let category = "Find-Transform";

	for (const setting of settings) {
		
		if (enableWarningDialog) {
			const argsBadObject = await utilities.checkArgs(setting[1], "findSetting");
			if (argsBadObject.length) await utilities.showBadKeyValueMessage(argsBadObject, false, setting[0]);
		}

		let newCommand = {};
		newCommand.command = `findInCurrentFile.${ setting[0] }`;

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
 * @param {boolean} enableWarningDialog
 * @returns { Promise<any[]|import("vscode").Command[]> } - package.json form of 'contributes.commands'
 */
async function _makePackageCommandsFromSearchSettings(settings, enableWarningDialog) {

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
		
		if (enableWarningDialog) {
			const argsBadObject = await utilities.checkArgs(setting[1], "searchSetting");
			// boolean modal or not
			if (argsBadObject.length) await utilities.showBadKeyValueMessage(argsBadObject, false, setting[0]);
		}

			let newCommand = {};
			newCommand.command = `runInSearchPanel.${ setting[0] }`;

			if (setting[1].title) newCommand.title = setting[1].title;
			else newCommand.title = setting[0];

			newCommand.category = category;
			settingsJSON.push(newCommand);
		};
		return settingsJSON;
};

/**
 * Transform the built-in commands into package.json-style commands {command: "", title: ""}
 * @returns {Array<import("vscode").Command>} - package.json form of builtin 'contributes.commands'
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
 * into package.json 'activationEvents' : 'onCommand:<some command>'
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

	// subtract 3 for searchInFile/searchInFolder/searchInResults commands
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
 * Get the settings and register TextEditorCommands for the findInCurrentFile commands
 * @param {Array} argArray
 * @param {import("vscode").ExtensionContext} context
 * @param {Array<import("vscode").Disposable>} disposables
 */
exports.registerFindCommands = async function (argArray, context, disposables, enableWarningDialog) {

	let disposable;
	let continueRun = true;

	for (const elem in argArray) {

    disposable = commands.registerTextEditorCommand(`findInCurrentFile.${ argArray[elem][0] }`, async (editor, edit) => {
      
      drivers.startFindInCurrentFile(argArray[elem][1], editor, edit, enableWarningDialog);
      
      // triggering from Command Palette doesn't seem to return focus to the current editor [seems like an extension testing bug]
      // not needed for keybinding trigger though
      await commands.executeCommand('workbench.action.focusActiveEditorGroup');
    });

    context.subscriptions.push(disposable);
    disposables.push(disposable);   // this is necessary to dispose all on onDidChangeConfiguration()
	}
}

	/**
 * Get the settings and register TextEditorCommands for the runInSearchPanel commands
 * 
 * @param {Array} argArray
 * @param {import("vscode").ExtensionContext} context
 * @param {Array<import("vscode").Disposable>} disposables
 */
exports.registerSearchCommands = async function (argArray, context, disposables, enableWarningDialog) {

	let disposable;
	let continueRun = true;

	for (const elem in argArray) {

    disposable = commands.registerCommand(`runInSearchPanel.${ argArray[elem][0] }`, async () => {
      
      drivers.startRunInSearchPanel(argArray[elem][1], enableWarningDialog);
    });
    
    context.subscriptions.push(disposable);
    disposables.push(disposable);  // this is necessary to dispose all on onDidChangeConfiguration()
	}
};