const vscode = require('vscode');
const path = require('path');
const os = require('os');
const utilities = require('./utilities');


/**
 * Resolve the matchIndex/Number variable.
 * 
 * @param {String} variableToResolve 
 * @param {Number} replaceIndex  - for a find/replace/filesToInclude value?
 * @returns {String} - resolvedVariable with matchIndex/Number replaced
 */
exports.resolveMatchVariable = function (variableToResolve, replaceIndex) {

  if (typeof variableToResolve !== 'string') return variableToResolve;

  variableToResolve = variableToResolve.replaceAll(/\$\{matchIndex\}/g, String(replaceIndex));
  variableToResolve = variableToResolve.replaceAll(/\$\{matchNumber\}/g, String(replaceIndex + 1));

  return variableToResolve;
}


/**
 * Resolve thelineIndex/Number variable.
 * 
 * @param {String} variableToResolve 
 * @param {Number} index  - match.index
 * @returns {String} - resolvedVariable with matchIndex/Number replaced
 */
exports.resolveLineVariable = function (variableToResolve, index) {

  if (typeof variableToResolve !== 'string') return variableToResolve;

  const line = vscode.window.activeTextEditor.document.positionAt(index).line;

  variableToResolve = variableToResolve.replaceAll(/\$\{lineIndex\}/g, String(line));
  variableToResolve = variableToResolve.replaceAll(/\$\{lineNumber\}/g, String(line + 1));
  return variableToResolve;
}


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
 * @param {Object} match - the current match
 */
exports.resolvePathVariables = function (variableToResolve, caller, isRegex, selection, clipText, match, restrict, selectionStartIndex) {

  selectionStartIndex = selectionStartIndex ?? 0;
	const filePath = vscode.window.activeTextEditor.document.uri.path;

	let relativePath;
	if ((caller === "filesToInclude" || caller === "filesToExclude") && vscode.workspace.workspaceFolders.length > 1) {
		relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, true);
		relativePath = `./${ relativePath }`;
	}
	else relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, false);

	// if no filePath message to open an editor TODO

  let resolved = variableToResolve;

  switch (variableToResolve) {

			case "${file}":	case "${ file }":
				resolved = filePath;
				if (os.type() === "Windows_NT") resolved = filePath.substring(4);  // for Windows
			break;

			case "${relativeFile}":	case "${ relativeFile }":
				resolved = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, false);
			break;

			case "${fileBasename}":	case "${ fileBasename }":
				resolved = path.basename(relativePath);
			break;

			case "${fileBasenameNoExtension}": case "${ fileBasenameNoExtension }":
				resolved = path.basename(relativePath, path.extname(relativePath));
			break;

			case "${fileExtname}": case "${ fileExtname }":
				resolved = path.extname(relativePath);
			break;

			case "${fileDirname}": case "${ fileDirname }":
				resolved = path.dirname(filePath);
			break;

			case "${fileWorkspaceFolder}": case "${ fileWorkspaceFolder }":
				resolved = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).uri.path;
			break;

			case "${workspaceFolder}": case "${ workspaceFolder }":
				resolved = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).uri.path;
			break;

			case "${relativeFileDirname}": case "${ relativeFileDirname }":
				resolved = path.dirname(vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, false));
				// https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options :  
				// '.' or './' does nothing in the "files to exclude" input for some reason
				if (caller === "filesToExclude" && resolved === ".") resolved = "**";
			break;

			case "${workspaceFolderBasename}": case "${ workspaceFolderBasename }":
				resolved = path.basename(vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).uri.path);
      break;

			case "${selectedText}": case "${ selectedText }":
        if (selection.isEmpty) {
          const wordRange = vscode.window.activeTextEditor.document.getWordRangeAtPosition(selection.start);
          resolved = vscode.window.activeTextEditor.document.getText(wordRange);
        }
				else resolved = vscode.window.activeTextEditor.document.getText(selection);
      break;

			case "${pathSeparator}": case "${ pathSeparator }":
				resolved = path.sep;
      break;

      case "${lineIndex}": case "${ lineIndex }":    // 0-based

        if (caller === "cursorMoveSelect" && restrict !== "document") resolved = String(match);
        else if (caller === "cursorMoveSelect" && restrict === "document") resolved = resolved;

        else if (caller !== "ignoreLineNumbers") {
          if (restrict === "selections") {
            const line = vscode.window.activeTextEditor.document.positionAt(match.index + selectionStartIndex).line;
            resolved = String(line);
          }
          else if (restrict === "next") resolved = String(vscode.window.activeTextEditor.document.positionAt(selectionStartIndex).line); //  works for wholeDocument
          else if (restrict === "document") resolved = String(match.line); //  works for wholeDocument
          else resolved = String(selection.active.line); // line/once find/replace
        }
      break;   // "ignoreLineNumbers" will pass through unresolved

			case "${lineNumber}": case "${ lineNumber }":   // 1-based
				
        if (caller === "cursorMoveSelect" && restrict !== "document") resolved = String(match + 1);
        else if (caller === "cursorMoveSelect" && restrict === "document") resolved = resolved;

        else if (caller !== "ignoreLineNumbers") {
          if (restrict === "selections") {
            const line = vscode.window.activeTextEditor.document.positionAt(match.index + selectionStartIndex).line;
            resolved = String(line + 1);
          }
          else if (restrict === "next") resolved = String(vscode.window.activeTextEditor.document.positionAt(selectionStartIndex).line + 1); //  works for wholeDocument
          else if (restrict === "document") resolved = String(match.line + 1); //  works for wholeDocument
          else resolved = String(selection.active.line + 1); // line/once find/replace
        }
      break;  // "ignoreLineNumbers" will pass through unresolved

      case "${CLIPBOARD}": case "${ CLIPBOARD }":
        resolved = clipText;
      break;

			case "${resultsFiles}":	case "${ resultsFiles }":
				resolved = this.getSearchResultsFiles();
      break;

			default:
			break;
    }

	// escape .*{}[]?^$ if using in a find // TODO do this after a case modifier?
  if (!isRegex && caller === "find") return resolved.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
  else if (caller === "filesToInclude" && resolved === ".") return resolved = "./";
  else return resolved;
};

/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {String} replaceValue
 * @param {String} caller - find/replace/cursorMoveSelect
 * @param {Boolean} isRegex
 * @param {vscode.Selection} selection - the current selection
 * @param {String} clipText - the curent clipboard text
 * @returns {String} - the resolved string
 */
exports.resolveSearchPathVariables = function (replaceValue, caller, isRegex, selection, clipText) {

  if (replaceValue === "") return replaceValue;

  let identifiers;
  let re;

  if (replaceValue !== null) {

    let vars = _getPathVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
    vars = `(?<pathCaseModifier>\\\\[UuLl])?(?<path>${ vars })`;

    re = new RegExp(`${ vars }`, "g");
    identifiers = [...replaceValue.matchAll(re)];
  }

  if (!identifiers.length) return replaceValue;

  for (const identifier of identifiers) {

    let resolved = "";

    if (identifier.groups.path) {
      resolved = this.resolvePathVariables(identifier.groups.path, caller, isRegex, selection, clipText, null, "", null);
      if (identifier.groups.pathCaseModifier) resolved = _applyCaseModifier(identifier.groups.pathCaseModifier, resolved);
    }

    // end of identifiers loop
    replaceValue = replaceValue.replace(identifier[0], resolved);
  }
  return replaceValue;
};

/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {String} replaceValue
 * @param {Array|Number} groups - may be a single match
 * @param {String} caller - find/replace/cursorMoveSelect
 * @param {Boolean} isRegex
 * @param {vscode.Selection} selection - the current selection
 * @param {String} clipText - the curent clipboard text
 * @param {String} restrict - restrictFind: document/once/line/selections
 * @returns {String} - the resolved string
 */
exports.buildReplace = function (replaceValue, groups, caller, isRegex, selection, clipText, restrict, selectionStartIndex) {

  // groups.capGroupOnly is for '$n' with no case modifier

  if (replaceValue === "") return replaceValue;

  let identifiers;
  let re;

  if (replaceValue !== null) {

    let vars = _getPathVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
    vars = `(?<pathCaseModifier>\\\\[UuLl])?(?<path>${vars})`;

    if (caller !== "find" && isRegex) {
      const re1 = "(?<caseModifier>\\\\[UuLl])(?<capGroup>\\$\\{?\\d\\d?\\}?)";
      const re2 = "|(?<caseTransform>\\$\\{(\\d\\d?):\\/((up|down|pascal|camel)case|capitalize)\\})";
      const re3 = "|(?<conditional>\\$\\{\\d\\d?:[-+?]?(.*?)(?<!\\\\)\\})";
      const re4 = "|(?<capGroupOnly>\\$\\{?\\d\\d?(?!:)\\}?)";
      re = new RegExp(`${ vars }|${ re1 }${ re2 }${ re3 }${ re4 }`, "g");
    }
    // else if (caller !== "find" && !isRegex) {
    //   const re1 = "(?<caseModifier>\\\\[UuLl])(?<capGroup>\\$\\{?\\d\\d?\\}?)";
    //   re = new RegExp(`${ vars }|${ re1 }`, "g");
    // }
    else re = new RegExp(`${ vars }`, "g");
    identifiers = [...replaceValue.matchAll(re)];
  }

  if (!identifiers.length) return replaceValue;

  for (const identifier of identifiers) {

    let resolved = "";

    if (identifier.groups.path) {
      resolved = this.resolvePathVariables(identifier.groups.path, caller, isRegex, selection, clipText, groups, restrict, selectionStartIndex);
      if (identifier.groups.pathCaseModifier) resolved = _applyCaseModifier(identifier.groups.pathCaseModifier, resolved);
    }

    else if (identifier.groups.capGroupOnly) {   // so no case modifier, only an unmodified capture group: "$n" or "${n}""
      const thisCapGroup = identifier.groups.capGroupOnly.replace(/[^\d]/g, "");
      if (groups && groups[thisCapGroup]) resolved = groups[thisCapGroup];
    }

    else if (identifier.groups.caseTransform) {

      if (groups && groups[identifier[6]] && identifier[7])
        resolved = _applyCaseTransform(identifier[7], groups[identifier[6]]);
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

    else if (identifier.groups.caseModifier) {   // case modifiers identifier.groups.caseModifier \\U, \\L etc.

      let thisCapGroup;
      if (identifier[4]) {
        thisCapGroup = identifier[4].replace(/[^\d]/g, "");

        if (groups && groups[thisCapGroup]) {
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

  // let resolved = conditionalText;
  let resolved = "";

  switch (whichConditional) {

    case "+":                        // if ${1:+yes}
      if (groups && groups[thisCapGroup]) {
        resolved = _checkForCaptureGroupsInReplacement(conditionalText, groups);
      }
      // "if" but no matching capture group
      // else resolved = "";
      break;

    case "-":                       // else ${1:-no} or ${1:no}
    case "":
      if (groups && !groups[thisCapGroup]) {
        resolved = _checkForCaptureGroupsInReplacement(conditionalText, groups);
      }
      // "else" and there is a matching capture group
      // else resolved = "";
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
    "${selectedText}", "${pathSeparator}", "${lineIndex}", "${lineNumber}", "${CLIPBOARD}", "${resultsFiles}"
  ];
}


/**
 * When no 'find' key in command: make a find value for use as a regexp
 * from all selected words or words at cursor positions wrapped by word boundaries \b
 *
 * @param   {Array<vscode.Selection>} selections
 * @param   {Object} args
 * @returns {String} - selected text '(\\ba\\b|\\bb c\\b|\\bd\\b)'
 */
exports.makeFind = function (selections, args) {

  const document = vscode.window.activeTextEditor.document;
  let selectedText = "";
  let find = "";

  // only use the first selection for these options
  if (args?.restrictFind?.substring(0, 4) === "next") {
    selections = [selections[0]];
  }

  selections.forEach((selection, index) => {

    if (selection.isEmpty) {
      const wordRange = document.getWordRangeAtPosition(selection.start);
      selectedText = document.getText(wordRange);
    }
    else {
      const selectedRange = new vscode.Range(selection.start, selection.end);
      selectedText = document.getText(selectedRange);
    }

    let boundary = "";
    if (args.matchWholeWord) boundary = "\\b";

    // wrap with word boundaries \b must be escaped to \\b
    if (index < selections.length - 1) find += `${ boundary }${ selectedText }${ boundary }|`;  // add an | or pipe to end
    else find += `${ boundary }${ selectedText }${ boundary }`;
  });

  if (args.isRegex) find = `(${ find })`;  // e.g. "(\\bword\\b|\\bsome words\\b|\\bmore\\b)"
  return find;
}