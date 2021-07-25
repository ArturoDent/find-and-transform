const vscode = require('vscode');
const path = require('path');
const os = require('os');
const utilities = require('./utilities');


/**
 * Resolve the launch/task-like path variables.
 * 
 * @param {String} variableToResolve 
 * @param {String} caller  - for a find/replace/filesToInclude value?
 * @param {Boolean} isRegex 
 * @returns 
 */
exports.resolveClipboardVariable = async function (variableToResolve, caller, isRegex) {

  if (typeof variableToResolve !== 'string') return variableToResolve;
  let clipText = "";

  if (variableToResolve.includes("${CLIPBOARD}")) {
    await vscode.env.clipboard.readText().then(string => {
      clipText = string;
    });
  }
  else return variableToResolve;
  
  let re = /((\\[UuLl])?(\${\s*CLIPBOARD\s*}))/g;
  const matches = [...variableToResolve.matchAll(re)];

  // for (let index = 0; index < matches.length; index++) {

  for (const match of matches) {

    let resolved = "";

    if (match[2]) resolved = _applyCaseModifier(match[2], clipText);
    else resolved = clipText;

    // let index = match.index;
    // if (match[0].length >= resolved.length) index = match.index - (match[0].length - resolved.length);
    // else index = match.index + (resolved.length - match[0].length);

    // pattern is a string, so only first match is replaced
    variableToResolve = variableToResolve.replace(match[1], resolved);
  }
  if (!isRegex && caller === "find") return variableToResolve.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
  else if (caller === "filesToInclude" && variableToResolve === ".") return variableToResolve = "./";
  else return variableToResolve;
}


/**
 * If the "filesToInclude/find/replace" value uses a variable(s) return the resolved value  
 * 
 * @param {String} variableToResolve - the "filesToInclude/find/replace" value  
 * @param {String} caller - if called from a find.parseVariables() or replace or filesToInclude 
 * @param {Boolean} isRegex
 * @param {vscode.Selection} selection - current selection
 * @param {String} clipText - the clipBoard text
 */
exports.resolvePathVariables = function (variableToResolve, caller, isRegex, selection, clipText) {

	// support conditionals here?  ${2:+yada}

	if (typeof variableToResolve !== 'string') return "";
  const vars = _getPathVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
  const re = new RegExp(`(${vars})`, "g");

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

	for (const match of matches) {

		let resolved = "";

		switch (match[1]) {

			case "${file}":
			case "${ file }":
				resolved = filePath;
				if (os.type() === "Windows_NT") resolved = filePath.substring(4);  // for Windows
				break;

			case "${relativeFile}":
			case "${ relativeFile }":
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
        if (selection.isEmpty) {
          const wordRange = vscode.window.activeTextEditor.document.getWordRangeAtPosition(selection.start);
          resolved = vscode.window.activeTextEditor.document.getText(wordRange);
        }
				else resolved = vscode.window.activeTextEditor.document.getText(selection);
				break;

			case "${pathSeparator}":
			case "${ pathSeparator }":
				resolved = path.sep;
				break;

			case "${lineNumber}":
			case "${ lineNumber }":
				// resolve for each selection
				// +1 because it is 0-based ? which seems weird to me
				resolved = String(selection.active.line + 1);
				break;

      case "${CLIPBOARD}":
      case "${ CLIPBOARD }":
          resolved = clipText;
        break;

			case "${resultsFiles}":
			case "${ resultsFiles }":
				resolved = this.getSearchResultsFiles();
				break;

			default:
				break;
    }
    // pattern is a string, only first match replaced
		variableToResolve = variableToResolve.replace(match[1], resolved);
	}

	// escape .*{}[]?^$ if using in a find 
	if (!isRegex && caller === "find") return variableToResolve.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
	else if (caller === "filesToInclude" && variableToResolve === ".") return variableToResolve = "./";
	else return variableToResolve;
};


/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {String} replaceValue
 * @param {Array} groups - 
 * @returns {String} - the resolved string
 */
exports.buildReplace = function (replaceValue, groups) {

  // groups.capGroupOnly is for '$n' with no case modifier
  let identifiers;

  if (replaceValue === "") return replaceValue;

  if (replaceValue !== null) {
    // const re1 = "(?<case>\\\\[UuLl])(?<capGroup>\\$\\d\\d?)|(?<capGroupOnly>\\$\\d\\d?)";
    const re1 = "(?<caseModifier>\\\\[UuLl])(?<capGroup>\\$\\{\\d\\d?\\})|(?<capGroupOnly>\\$\\{?\\d\\d?\\}?)";
    const re2 = "|(?<caseTransform>\\$\\{(\\d\\d?):\\/((up|down|pascal|camel)case|capitalize)\\})";
    const re3 = "|(?<conditional>\\$\\{\\d\\d?:[-+?]?(.*?)(?<!\\\\)\\})";
    const re = new RegExp(`${ re1 }${ re2 }${ re3 }`, "g");
    identifiers = [...replaceValue.matchAll(re)];
  }

  if (!identifiers.length) return replaceValue;

  for (const identifier of identifiers) {

    let resolved = "";

    if (identifier.groups.capGroupOnly) {   // so no case modifier, only an unmodified capture group: "$n"
      // const thisCapGroup = identifier.groups.capGroupOnly.substring(1);
      const thisCapGroup = identifier.groups.capGroupOnly.replace(/[^\d]/g, "");
      if (groups && groups[thisCapGroup]) {
        replaceValue = replaceValue.replace(identifier[0], groups[thisCapGroup]);
      }
      // continue;
    }

    else if (identifier.groups.caseTransform) {

      if (groups && groups[identifier[5]] && identifier[6]) 
        resolved = _applyCaseTransform(identifier[6], groups[identifier[5]])
      else resolved = "";
    }

    else if (identifier.groups.conditional) {

      // if a '}' in a replacement? => '\\}' must be escaped
      // ${1:+${2}}  ?  => ${1:+`$2`} note the backticks
      // easy to ${1:capitalize} when mean ${1:/capitalize}  TODO warning?

      const conditionalRE = /\$\{(?<capGroup>\d\d?):(?<ifElse>[-+?]?)(?<replacement>(.*?)(?<!\\))\}/;
      const matches = identifier.groups.conditional.match(conditionalRE);
      const thisCapGroup = matches.groups.capGroup;
      const replacement = matches.groups.replacement.replace(/\\/g, "");

      resolved = _applyConditionalTransform(matches.groups.ifElse, replacement, groups, thisCapGroup);
    }

    else {   // case modifiers identifier.groups.caseModifier

      let thisCapGroup = "0";
      if (identifier[2]) {
        thisCapGroup = identifier[2].replace(/[^\d]/g, "");

        if (groups[thisCapGroup]) {
          // thisCapGroup = identifier[2].substring(1);			 // "1" or "2", etc.
          // thisCapGroup = identifier[2].replace(/[^\d]/g, "");
          resolved = _applyCaseModifier(identifier.groups.caseModifier, groups[thisCapGroup]);
        }
        else resolved = "";
      }
    }

    // end of identifiers loop
    replaceValue = replaceValue.replace(identifier[0], resolved);
  }
  return replaceValue;
};


/**
 * Apply case modifier, like '\\U' to text.
 * @param   {String} modifier 
 * @param   {String} textToModify
 * @returns {String} - modified text
 */
function _applyCaseModifier(modifier, textToModify) {

  let resolved = textToModify;

  switch (modifier) {
    case "\\U":
      resolved = textToModify.toLocaleUpperCase();
      break;

    case "\\u":
      resolved = textToModify[0].toLocaleUpperCase() + textToModify.substring(1);
      break;

    case "\\L":
      resolved = textToModify.toLocaleLowerCase();
      break;

    case "\\l":
      resolved = textToModify[0].toLocaleLowerCase() + textToModify.substring(1);
      break;

    default:
      break;
  }
  return resolved;
}


/**
 * Apply case transform, like '${1:/upcase}' to text.
 * @param   {String} transform 
 * @param   {String} textToModify
 * @returns {String} - modified text
 */
function _applyCaseTransform(transform, textToModify) {

  let resolved = textToModify;

  switch (transform) {

    case "upcase":
      resolved = textToModify.toLocaleUpperCase();
      break;

    case "downcase":
      resolved = textToModify.toLocaleLowerCase();
      break;

    case "capitalize":
      resolved = textToModify[0].toLocaleUpperCase() + textToModify.substring(1);
      break;

    case "pascalcase":   			// first_second_third => FirstSecondThird
      resolved = utilities.toPascalCase(textToModify);
      break;

    case "camelcase":        // first_second_third => firstSecondThird
      resolved = utilities.toCamelCase(textToModify);
      break;
  }
  return resolved;
}


/**
 * Apply conditional transform, like '${1:+ add text }' to text.
 * @param   {String} whichConditional - '+-:' 
 * @param   {String} conditionalText
 * @returns {String} - modified text
 */
function _applyConditionalTransform(whichConditional, conditionalText, groups, thisCapGroup) {

  let resolved = conditionalText;

  switch (whichConditional) {

    case "+":                        // if ${1:+yes}
      if (groups && groups[thisCapGroup]) {
        resolved = _checkForCaptureGroupsInReplacement(conditionalText, groups);
      }
      // "if" but no matching capture group
      break;

    case "-":                       // else ${1:-no} or ${1:no}
    case "":
      if (groups && !groups[thisCapGroup]) {
        resolved = _checkForCaptureGroupsInReplacement(conditionalText, groups);
      }
      // "else" and there is a matching capture group
      break;

    case "?":                        // if/else ${1:?yes:no}
      const replacers = conditionalText.split(":");

      if (groups && groups[thisCapGroup]) {
        resolved = _checkForCaptureGroupsInReplacement(replacers[0], groups);
      }
      else resolved = _checkForCaptureGroupsInReplacement(replacers[1] ?? "", groups);
      break;
  }
  return resolved;
}


/**
 * Are there capture groups, like `$1` in this conditional replacement text?
 * @param {String} replacement 
 * @param {Array} groups 
 * @returns {String} - resolve the capture group
 */
function _checkForCaptureGroupsInReplacement(replacement, groups) {

  const re = /(?<ticks>`\$(\d+)`)/g;
  const capGroups = [...replacement.matchAll(re)];

  for (let i = 0; i < capGroups.length; i++) {
    if (capGroups[i].groups.ticks) {
      replacement = replacement.replace(capGroups[i][0], groups[capGroups[i][2]] ?? "");
    }
  }
  return replacement;
}


/**
 * @returns {Array} - all the available path variables
 */
function _getPathVariables() {

  return [
    "${file}", "${relativeFile}", "${fileBasename}", "${fileBasenameNoExtension}", "${fileExtname}", "${fileDirname}",
    "${fileWorkspaceFolder}", "${workspaceFolder}", "${relativeFileDirname}", "${workspaceFolderBasename}", 
    "${selectedText}", "${pathSeparator}", "${lineNumber}", "${CLIPBOARD}", "${resultsFiles}"
  ];
}