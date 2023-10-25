const { workspace} = require('vscode');


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