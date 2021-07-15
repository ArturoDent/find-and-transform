const vscode = require('vscode');
const path = require('path');
const os = require('os');
const utilities = require('./utilities');



/**
 * If the "filesToInclude/find/replace" value uses a variable(s) return the resolved value  
 * 
 * @param {String} variableToResolve - the "filesToInclude/find/replace" value  
 * @param {String} caller - if called from a find.parseVariables() or replace or filesToInclude 
 * @param {Boolean} isRegex 
 */
exports.parseVariables = async function (variableToResolve, caller, isRegex) {

	// support conditionals here?  ${2:+yada}

	if (typeof variableToResolve !== 'string') return "";
	// couldn't this be built from some list  TODO
	const re = /(\${\s*file\s*}|\${\s*relativeFile\s*}|\${\s*fileBasename\s*}|\${\s*fileBasenameNoExtension\s*}|\${\s*fileExtname\s*}|\${\s*fileDirname\s*}|\${\s*fileWorkspaceFolder\s*}|\${\s*workspaceFolder\s*}|\${\s*relativeFileDirname\s*}|\${\s*workspaceFolderBasename\s*}|\${\s*selectedText\s*}|\${\s*pathSeparator\s*}|\${\s*lineNumber\s*}|\${\s*CLIPBOARD\s*}|\${\s*resultsFiles\s*})/g;

	const matches = [...variableToResolve.matchAll(re)];
	if (!matches.length) return variableToResolve;

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
				resolved = path.dirname(filePath);
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
				resolved = path.basename(vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).uri.path);
				break;

			case "${selectedText}":
			case "${ selectedText }":
				// resolve for each selection ??
				resolved = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selections[0]);
				break;

			case "${pathSeparator}":
			case "${ pathSeparator }":
				resolved = path.sep;
				break;

			case "${lineNumber}":
			case "${ lineNumber }":
				// resolve for each selection
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
		variableToResolve = variableToResolve.replace(item[1], resolved);
	}

	// escape .*{}[]?^$ if using in a find 
	if (isRegex && caller === "find") return variableToResolve.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
	// else if (caller === "filesToInclude" && variableToResolve === ".") return variableToResolve = "./";
	else if (caller === "filesToInclude" && variableToResolve === ".") return variableToResolve = "./";
	else return variableToResolve;
};


/**
 * Build the replacestring by updating the setting 'replaceValue' to
 * account for case modifiers and capture groups
 *
 * @param {String} replaceValue
 * @param {Array} groups - the result of matching the docString with the regexp findValue
 * @returns {String} - the replace string
 */
exports.buildReplace = function (replaceValue, groups) {

	// support conditional here?  ${2:+yada}

	let buildReplace = "";

	// array of case modifiers + $n's
	// groups.capGroupOnly is for '$n' with no case modifier
	let identifiers;

	if (replaceValue === "") return replaceValue;

	if (replaceValue !== null)
		// (?<caseTransform>\$\{(\d\d ?): \/((up|down|pascal|camel)case|capitalize)\})
		// identifiers = [...replaceValue.matchAll(/(?<case>\\[UuLl])(?<capGroup>\$\d\d?)|(?<capGroupOnly>\$\d\d?)|(?<conditional>\$\{\d\d?:[-+?]?(.*?)(?<!\\)\})/g)];
		identifiers = [...replaceValue.matchAll(/(?<case>\\[UuLl])(?<capGroup>\$\d\d?)|(?<capGroupOnly>\$\d\d?)|(?<caseTransform>\$\{(\d\d?):\/((up|down|pascal|camel)case|capitalize)\})|(?<conditional>\$\{\d\d?:[-+?]?(.*?)(?<!\\)\})/g)];

	if (!identifiers.length) return replaceValue;

	else {
		buildReplace = replaceValue.substring(0, identifiers[0].index);

		// loop through case modifiers/capture groups in the replace setting
		for (let i = 0; i < identifiers.length; i++) {

			if (identifiers[i].groups.capGroupOnly) {   // so no case modifier, only an unmodified capture group: "$n"
				const thisCapGroup = identifiers[i].groups.capGroupOnly.substring(1);
				if (groups && groups[thisCapGroup]) {
					buildReplace += groups[thisCapGroup];
					buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
				}
				else if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
				continue;
			}

			else if (identifiers[i].groups.caseTransform) {

				if (groups && groups[identifiers[i][5]]) {

					switch (identifiers[i][6]) {

						case "upcase":
							buildReplace += groups[identifiers[i][5]].toLocaleUpperCase();
							break;

						case "downcase":
							buildReplace += groups[identifiers[i][5]].toLocaleLowerCase();
							break;

						case "capitalize":
							buildReplace += groups[identifiers[i][5]][0].toLocaleUpperCase() + groups[identifiers[i][5]].substring(1);
							break;

						case "pascalcase":   			// first_second_third => FirstSecondThird
							buildReplace += utilities.toPascalCase(groups[identifiers[i][5]]);
							break;

						case "camelcase":        // first_second_third => firstSecondThird
							buildReplace += utilities.toCamelCase(groups[identifiers[i][5]]);
							break;
					}
				}
				buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
			}

			else if (identifiers[i].groups.conditional) {

				// if a '}' in a replacement? => '\\}' must be escaped
				// ${1:+${2}}  ?  => ${1:+`$2`} note the backticks
				// easy to ${1:capitalize} when mean ${1:/capitalize}  TODO warning?

				const conditionalRE = /\$\{(?<capGroup>\d\d?):(?<ifElse>[-+?]?)(?<replacement>(.*?)(?<!\\))\}/;
				const matches = identifiers[i].groups.conditional.match(conditionalRE);
				const thisCapGroup = matches.groups.capGroup;
				const replacement = matches.groups.replacement.replace(/\\/g, "");

				switch (matches.groups.ifElse) {

					case "+":                        // if ${1:+yes}
						if (groups && groups[thisCapGroup]) {
							// buildReplace += matches.groups.replacement;
							// buildReplace += replacement;
							buildReplace += _checkForCaptureGroupsInReplacement(replacement, groups);
						}
						// "if" but no matching capture group

						if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						else buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						break;

					case "-":                       // else ${1:-no} or ${1:no}
					case "":
						if (groups && !groups[thisCapGroup]) {
							// buildReplace += matches.groups.replacement;
							// buildReplace += replacement;
							buildReplace += _checkForCaptureGroupsInReplacement(replacement, groups);
						}
						// "else" and there is a matching capture group

						if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						else buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						break;

					case "?":                        // if/else ${1:?yes:no}
						// const replacers = matches.groups.replacement.split(":");
						const replacers = replacement.split(":");

						if (groups && groups[thisCapGroup]) {
							// buildReplace += replacers[0];
							buildReplace += _checkForCaptureGroupsInReplacement(replacers[0], groups);
						}
						// else buildReplace += replacers[1] ?? "";
						else buildReplace += _checkForCaptureGroupsInReplacement(replacers[1] ?? "", groups);


						if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						else buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						break;
				}
			}

			else {

				let thisGroup = "0";
				if (identifiers[i][2]) thisGroup = identifiers[i][2].substring(1);			 // "1" or "2", etc.

				switch (identifiers[i].groups.case) {  // "\\U", "\\l", etc.  // identifiers[i].groups.case

					case "\\U":
						if (groups && groups[thisGroup]) {
							buildReplace += groups[thisGroup].toLocaleUpperCase();
							buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						}
						// else if (!groups[thisGroup]) {
						// 	buildReplace += `\\U$${ thisGroup }`;
						// 	buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						// }
						// case "\\U$n" but there is no matching capture group
						else if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						break;

					case "\\u":
						if (groups && groups[thisGroup]) {
							buildReplace += groups[thisGroup].substring(0, 1).toLocaleUpperCase() + groups[thisGroup].substring(1);
							buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						}
						// else if (!groups[thisGroup]) {
						// buildReplace += `\\u$${ thisGroup }`;
						// buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						// }
						else if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						break;

					case "\\L":
						if (groups && groups[thisGroup]) {
							buildReplace += groups[thisGroup].toLocaleLowerCase();
							buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						}
						// else if (!groups[thisGroup]) {
						// buildReplace += `\\L$${ thisGroup }`;
						// buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						// }
						else if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						break;

					case "\\l":
						if (groups && groups[thisGroup]) {
							buildReplace += groups[thisGroup].substring(0, 1).toLocaleLowerCase() + groups[thisGroup].substring(1);
							buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						}
						// else if (!groups[thisGroup]) {
						// buildReplace += `\\l$${ thisGroup }`;
						// buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						// }
						else if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						break;

					default:
						break;
				}
			}
		}
	}
	return buildReplace;
};

/**
 * 
 * @param {String} replacement 
 * @param {Array} groups 
 */
function _checkForCaptureGroupsInReplacement(replacement, groups) {

	const re = /(?<ticks>`\$(\d+)`)|(?<escapes>\$\{(\d+)\})/g;
	const capGroups = [...replacement.matchAll(re)];

	for (let i = 0; i < capGroups.length; i++) {
		if (capGroups[i].groups.ticks) {
			replacement = replacement.replace(capGroups[i][0], groups[capGroups[i][2]] ?? "");
		}
		else if (capGroups[i].groups.escapes) {
			replacement = replacement.replace(capGroups[i][0], groups[capGroups[i][4]] ?? "");
		}
	}
	return replacement;
}


/**
 * Add any intervening characters, only between identifier groups, to the replace string
 *
 * @param {Array} identifiers - case modifiers and capture groups
 * @param {Number} i - index of currrent identifier
 * @param {String} replaceValue
 * @returns {String} - new ReplaceValue
 */
function _stringBetweenIdentifiers(identifiers, i, replaceValue) {
	return replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
}

/**
 * If a next case modifier or capture group, add any intervening characters to the replace string,
 * otherwise, add to end of input string
 *
 * @param {Array} identifiers - case modifiers and capture groups
 * @param {Number} i - index of currrent identifier
 * @param {String} replaceValue
 * @returns {String} - new ReplaceValue
 */
function _addToNextIdentifier(identifiers, i, replaceValue) {
	if (identifiers[i + 1])    // if there is a later case modifier in the replace field
		return _stringBetweenIdentifiers(identifiers, i, replaceValue);
	else                       // get to end of input string
		return replaceValue.substring(identifiers[i].index + identifiers[i][0].length);
}