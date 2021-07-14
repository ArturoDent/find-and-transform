const vscode = require('vscode');
const path = require('path');
const os = require('os');


/**
 * Get the relative path to the workspace folder  
 * @param {String} filePath   
 * @returns {String} relativePath  
 */
exports.getRelativeFilePath = function (filePath) {

	// const isWindows = process.platform === 'win32';
	// const env = process.env;
	// const homedir = os.homedir();

	const basename = path.basename(filePath);
	let relativePath = vscode.workspace.asRelativePath(filePath, false);

	if (basename === "settings.json" || basename === "keybindings.json") {
		if (os.type() === "Windows_NT") relativePath = filePath.substring(4);  // for Windows
		// else relativePath = filePath.substring(1); // test for linux/mac
	}
	// else {
	// 	const wsFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(filePath)).uri.path;
	// 	relativePath = path.posix.relative(wsFolder, filePath);
	// }

	return relativePath;
}

/**
 * Get the relative path to the workspace folder  
 * @param {String} filePath   
 * @returns {String} relativePath  
 */
exports.getRelativeFolderPath = function (filePath) {

	// const isWindows = process.platform === 'win32';
	// const env = process.env;
	// const homedir = os.homedir();

	const dirname = path.dirname(filePath);
	return vscode.workspace.asRelativePath(dirname);
}


/**
 * Get the relative paths of the current search results 
 * for the next `runInSearchPanel` call  
 * 
 * @returns array of paths or undefined  
 */
exports.getSearchResultsFiles = async function () {

	await vscode.commands.executeCommand('search.action.copyAll');
	let results = await vscode.env.clipboard.readText();

	// handle no results
	if (results)  {
		results = results.replaceAll(/^\s*\d.*$\s?|^$\s/gm, "");
		let resultsArray = results.split(/[\r\n]{1,2}/);  // does this cover all OS's?

		let pathArray = resultsArray.filter(result => result !== "");
		pathArray = pathArray.map(path => this.getRelativeFilePath(path))

		return pathArray.join(", ");
	}
	else {
		// notifyMessage
		return undefined;
	}
} 


/**
 * Convert string to PascalCase.  
 * first_second_third => FirstSecondThird  
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/snippet/snippetParser.ts}  
 * 
 * @param {String} value   
 * @returns {String} transformed value  
 */
exports.toPascalCase = function(value) {

	const match = value.match(/[a-z0-9]+/gi);
	if (!match) {
		return value;
	}
	return match.map(word => {
		return word.charAt(0).toUpperCase()
			+ word.substr(1).toLowerCase();
	})
		.join('');
}


/**
 * Convert string to camelCase.  
 * first_second_third => firstSecondThird  
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/snippet/snippetParser.ts}  
 * 
 * @param {String} value  
 * @returns {String} transformed value  
 */
exports.toCamelCase = function (value) {

	const match = value.match(/[a-z0-9]+/gi);
	if (!match) {
		return value;
	}
	return match.map((word, index) => {
		if (index === 0) {
			return word.toLowerCase();
		} else {
			return word.charAt(0).toUpperCase()
				+ word.substr(1).toLowerCase();
		}
	})
		.join('');
};