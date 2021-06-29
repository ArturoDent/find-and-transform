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

/**
 * Get the relative path to the workspace folder
 * @param {String} filePath 
 * @returns {String} relativePath
 */
exports.getRelativeFolderPath = function (filePath) {

	// const isWindows = process.platform === 'win32';
	// const env = process.env;
	// const homedir = os.homedir();

	const dirname = path.posix.dirname(filePath);
	return vscode.workspace.asRelativePath(dirname);
}


/**
 * If the "filesToInclude/find/replace" value uses a variable(s) return the resolved value
 * 
 * @param {String} resolvedVariable - the "filesToInclude/find/replace" value
 * @param {Boolean} find - if called from a find.parseVariables
 */
exports.parseVariables = async function (resolvedVariable, find) {

	if (typeof resolvedVariable !== 'string') return "";
	const re = /(\${\s*file\s*}|\${\s*relativeFile\s*}|\${\s*fileBasename\s*}|\${\s*fileBasenameNoExtension\s*}|\${\s*fileExtname\s*}|\${\s*fileDirname\s*}|\${\s*fileWorkspaceFolder\s*}|\${\s*workspaceFolder\s*}|\${\s*relativeFileDirname\s*}|\${\s*workspaceFolderBasename\s*}|\${\s*selectedText\s*}|\${\s*pathSeparator\s*}|\${\s*lineNumber\s*}|\${\s*CLIPBOARD\s*})/g;

	const matches = [...resolvedVariable.matchAll(re)];
	if (!matches.length) return resolvedVariable;

	const filePath = vscode.window.activeTextEditor.document.uri.path;  // TODO or pass in a editor path ??
	const relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri);

	// if no filePath message to open an editor TODO

	for (const item of matches) {

		let resolved = "";

		switch (item[1]) {

			case "${file}":
			case "${ file }":
				// resolved = filePath.substring(4);
				// resolved = relativePath;  // doesn't work for settings/keybindings
				resolved = this.getRelativeFilePath(filePath);
				break;

			case "${relativeFile}":
			case "${ relativeFile }":
				resolved = relativePath;
				break;

			case "${fileBasename}":
			case "${ fileBasename }":
				resolved = path.posix.basename(relativePath);
				break;

			case "${fileBasenameNoExtension}":
			case "${ fileBasenameNoExtension }":
				resolved = path.posix.basename(relativePath, path.extname(relativePath));
				break;

			case "${fileExtname}":
			case "${ fileExtname }":
				resolved = path.posix.extname(relativePath);
				break;

			case "${fileDirname}":
			case "${ fileDirname }":

				// resolved = path.dirname(filePath);
				resolved = path.posix.dirname(relativePath);
				break;

			case "${fileWorkspaceFolder}":
			case "${ fileWorkspaceFolder }":
				resolved = relativePath.replace(/(^[^/\\]*).*/, "$1");
				break;

			case "${workspaceFolder}":
			case "${ workspaceFolder }":
				resolved = vscode.workspace.workspaceFolders[0].uri.fsPath;
				break;

			case "${relativeFileDirname}":
			case "${ relativeFileDirname }":

				resolved = path.posix.dirname(relativePath);
				break;

			case "${workspaceFolderBasename}":
			case "${ workspaceFolderBasename }":
				resolved = path.posix.basename(vscode.workspace.workspaceFolders[0].uri.fsPath);
				break;

			case "${selectedText}":
			case "${ selectedText }":
				resolved = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selections[0]);
				break;

			case "${pathSeparator}":
			case "${ pathSeparator }":
				resolved = path.posix.sep;
				break;

			case "${lineNumber}":
			case "${ lineNumber }":
				// +1 because it is 0-based ? which seems weird to me
				resolved = String(vscode.window.activeTextEditor.selection.active.line + 1);
				break;

			case "${CLIPBOARD}":
			case "${ CLIPBOARD }":
				await vscode.env.clipboard.readText().then(string => {
					resolved = string;
				});
				break;

			default:
				break;
		}
		resolvedVariable = resolvedVariable.replace(item[1], resolved);
	}
	// escape .*{}[]?^$ if using in a find 
	if (find) return resolvedVariable.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
	else return resolvedVariable;
}


exports.getSearchResultsFiles = async function () {

	// handle no results
	await vscode.commands.executeCommand('search.action.copyAll');
	// await vscode.env.clipboard.readText().then(results => {
	// 	console.log(`results = ${results}`);
	// });
	let results = await vscode.env.clipboard.readText();
	console.log(results);
	results = results.replaceAll(/^\s*\d.*$\s?|^$\s/gm, "");
	console.log(results);
	let resultsArray = results.split(/[\r\n]{1,2}/);
	console.log(resultsArray);
}