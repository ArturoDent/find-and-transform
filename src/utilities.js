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
 * If the "filesToInclude/find/replace" value uses a variable(s) return the resolved value  
 * 
 * @param {String} resolvedVariable - the "filesToInclude/find/replace" value  
 * @param {String} caller - if called from a find.parseVariables() or replace or filesToInclude 
 * @param {Boolean} isRegex 
 */
exports.parseVariables = async function (resolvedVariable, caller, isRegex) {

	// support conditionals here?  ${2:+yada}

	if (typeof resolvedVariable !== 'string') return "";
	// couldn't this be built from some list  TODO
	const re = /(\${\s*file\s*}|\${\s*relativeFile\s*}|\${\s*fileBasename\s*}|\${\s*fileBasenameNoExtension\s*}|\${\s*fileExtname\s*}|\${\s*fileDirname\s*}|\${\s*fileWorkspaceFolder\s*}|\${\s*workspaceFolder\s*}|\${\s*relativeFileDirname\s*}|\${\s*workspaceFolderBasename\s*}|\${\s*selectedText\s*}|\${\s*pathSeparator\s*}|\${\s*lineNumber\s*}|\${\s*CLIPBOARD\s*}|\${\s*resultsFiles\s*})/g;

	const matches = [...resolvedVariable.matchAll(re)];
	if (!matches.length) return resolvedVariable;

	const filePath = vscode.window.activeTextEditor.document.uri.path;

	let relativePath;
	if ((caller === "filesToInclude" || caller === "filesToExclude") && vscode.workspace.workspaceFolders.length > 1) {
		relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, true);
		relativePath = `./${ relativePath }`;
	}
	else relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, false);

	// if no filePath message to open an editor TODO

	for (const item of matches) {

		let resolved = "";

		switch (item[1]) {

			case "${file}":
			case "${ file }":
				resolved = filePath;
				if (os.type() === "Windows_NT") resolved = filePath.substring(4);  // for Windows
				break;

			case "${relativeFile}":
			case "${ relativeFile }":
				// resolved = relativePath;
				resolved = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, false);
				break;

			case "${fileBasename}":
			case "${ fileBasename }":
				resolved = path.basename(relativePath);
				break;

			case "${fileBasenameNoExtension}":
			case "${ fileBasenameNoExtension }":
				resolved = path.basename(relativePath, path.extname(relativePath));
				break;

			case "${fileExtname}":
			case "${ fileExtname }":
				resolved = path.extname(relativePath);
				break;

			case "${fileDirname}":
			case "${ fileDirname }":
				resolved = path.dirname(filePath)
				break;

			case "${fileWorkspaceFolder}":
			case "${ fileWorkspaceFolder }":
				// resolved = relativePath.replace(/(^[^/\\]*).*/, "$1");
				resolved = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).uri.path;
				break;

			case "${workspaceFolder}":
			case "${ workspaceFolder }":
				resolved = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).uri.path;
				break;

			case "${relativeFileDirname}":
			case "${ relativeFileDirname }":
				resolved = path.dirname(vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, false));
				// https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options :  
				// '.' or './' does nothing in the "files to exclude" input for some reason
				if (caller === "filesToExclude" && resolved === ".") resolved = "**";
				break;

			case "${workspaceFolderBasename}":
			case "${ workspaceFolderBasename }":
				if (caller === "filesToInclude" && vscode.workspace.workspaceFolders.length > 1) {
					resolved = `./${ vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).name}`;
				}
				else	resolved = "";
				break;

			case "${selectedText}":
			case "${ selectedText }":
				resolved = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selections[0]);
				break;

			case "${pathSeparator}":
			case "${ pathSeparator }":
				resolved = path.sep;
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

			case "${resultsFiles}":
			case "${ resultsFiles }":
				resolved = await this.getSearchResultsFiles();
				break;

			default:
				break;
		}
		resolvedVariable = resolvedVariable.replace(item[1], resolved);
	}

	// if more than one match, one is ${resultsFiles}, and one is a negation which follows


	// escape .*{}[]?^$ if using in a find 
	if (isRegex && caller === "find") return resolvedVariable.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
	// else if (caller === "filesToInclude" && resolvedVariable === ".") return resolvedVariable = "./";
	else if (caller === "filesToInclude" && resolvedVariable === ".") return resolvedVariable = "./";
	else return resolvedVariable;
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
exports.toPascalCase = function (value) {

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