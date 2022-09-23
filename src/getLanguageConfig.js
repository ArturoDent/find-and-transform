const { extensions } = require('vscode');
const jsonc = require("jsonc-parser");
const fs = require('fs');
const path = require('path');


/**
 * Get an array of "languages", like plaintext, that don't have comment syntax
 * @returns {string[]} 
 */
function _getLanguagesToSkip  () {
    return ['code-text-binary', 'bibtex', 'log', 'Log', 'search-result', 'plaintext', 'juliamarkdown', 'scminput', 'properties', 'csv', 'tsv', 'excel'];
}

/**
 * From the language configuration for the current file get the value of config argument
 * Usage: await languageConfigs.get(documentLanguageId, 'comments');
 *
 * @param {string} langID - the languageID of the desired language configuration
 * @param {string} config - the language configuration to get, e.g., 'comments.lineComment' or 'autoClosingPairs'
 *
 * @returns {Promise<any>} - string or array or null if can't be found
 */
exports.get = async function (langID, config) {
  
  if (_getLanguagesToSkip().includes(langID)) return null;
  else if (langID.startsWith('csv')) return null;
  
	let configArg;

	if (config && config.includes('.')) configArg = config.split('.');
	else configArg = config;

	let desiredConfig = null;  // return null default if can't be found

	var langConfigFilePath = null;

	for (const _ext of extensions.all) {
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
			if (!!packageLangData && packageLangData.configuration) {
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