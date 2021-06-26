const vscode = require('vscode');
const path = require('path');
const os = require('os');


/**
 * Get the relative path to the workspace folder
 * @param {String} filePath 
 * @returns {String} relativePath
 */
exports.getRelativePath = function (filePath) {

	// const isWindows = process.platform === 'win32';
	// const env = process.env;
	// const homedir = os.homedir();

	const basename = path.posix.basename(filePath);
	let relativePath = vscode.workspace.asRelativePath(filePath);

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