const vscode = require('vscode');
const jsonc = require("jsonc-parser");
const fs = require('fs');
const path = require('path');

/**
 * @description - from the language configuration for the current file
 * @description - get the value of config argument
 *
 * @param {String} langID - the languageID of the desired language configuration
 * @param {String} config - the language configuration to get, e.g., 'comments.lineComment' or 'autoClosingPairs'
 *
 * @returns {Promise<any>} - string or array or null if can't be found
 */
exports.get = async function (langID, config) {

	// const currentLanguageConfig = languageConfigs.get('javascript', 'comments');
	let configArg;

	if (config && config.includes('.')) configArg = config.split('.');
	else configArg = config;

	let desiredConfig = null;  // return null default if can't be found

	// for language of current editor
	// const editor = vscode.window.activeTextEditor;
	// const documentLanguageId = editor.document.languageId;
	var langConfigFilePath = null;

	for (const _ext of vscode.extensions.all) {
		// All vscode default extensions ids starts with "vscode."
		if (
			_ext.packageJSON.contributes &&
			_ext.packageJSON.contributes.languages
		) {
			// Find language data from "packageJSON.contributes.languages" for the langID argument
			// don't filter if you want them all
			const packageLangData = _ext.packageJSON.contributes.languages.find(
				_packageLangData => (_packageLangData.id === langID)
			);
			// If found, get the absolute config file path
			if (!!packageLangData) {
				langConfigFilePath = path.join(
					_ext.extensionPath,
					packageLangData.configuration
				);
				break;
			}
		}
	}

	if (!!langConfigFilePath && fs.existsSync(langConfigFilePath)) {

		// the whole language config will be returned if config arg was the empty string ''
    // desiredConfig = JSON.parse(fs.readFileSync(langConfigFilePath).toString());
    desiredConfig = jsonc.parse(fs.readFileSync(langConfigFilePath).toString());

		if (Array.isArray(configArg)) {

			for (let index = 0; index < configArg.length; index++) {
				desiredConfig = desiredConfig[configArg[index] ];
			}
			return desiredConfig;
		}
		else if (config) return jsonc.parse(fs.readFileSync(langConfigFilePath).toString())[config];
		else return desiredConfig;
	}
	else return null;
};