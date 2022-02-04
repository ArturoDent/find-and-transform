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

  variableToResolve = variableToResolve.replaceAll(/\$\{\s*matchIndex\s*\}/g, String(replaceIndex));
  variableToResolve = variableToResolve.replaceAll(/\$\{\s*matchNumber\s*\}/g, String(replaceIndex + 1));

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

  variableToResolve = variableToResolve.replaceAll(/\$\{\s*lineIndex\s*\}/g, String(line));
  variableToResolve = variableToResolve.replaceAll(/\$\{\s*lineNumber\s*\}/g, String(line + 1));
  return variableToResolve;
}


/**
 * If the "filesToInclude/find/replace" entry uses a path variable(s) return the resolved value  
 * 
 * @param {String} variableToResolve - the "filesToInclude/find/replace" value 
 * @param {Object} args -  keybinding/settings args
 * @param {String} caller - if called from a find.parseVariables() or replace or filesToInclude 
 * @param {vscode.Selection} selection - current selection
 * @param {Object} match - the current match
 * @param {Number} selectionStartIndex - in the start index of this selection
 * @param {Number} matchIndex - which match is it
 * 
 * @returns {String} - the resolved path variable
 */
 function _resolvePathVariables (variableToResolve, args, caller, selection, match, selectionStartIndex, matchIndex) {

  if (typeof variableToResolve !== 'string') return variableToResolve;

  selectionStartIndex = selectionStartIndex ?? 0;
	const filePath = vscode.window.activeTextEditor.document.uri.path;

	let relativePath;
	if ((caller === "filesToInclude" || caller === "filesToExclude") && vscode.workspace.workspaceFolders.length > 1) {
		relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, true);
		relativePath = `./${ relativePath }`;
	}
	else relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, false);

  let resolved = variableToResolve;
  const namedGroups = resolved.match(/(?<pathCaseModifier>\\[UuLl])?(?<path>\$\{\s*.*?\s*\})/).groups;

   switch (namedGroups.path) {

    case "${file}":  case "${ file }":
      if (os.type() === "Windows_NT") resolved = filePath.substring(4);
      else resolved = filePath;
      break;
  
    case "${relativeFile}":	 case "${ relativeFile }":
      resolved = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri, false);
      break;
  
    case "${fileBasename}": case "${ fileBasename }":
      resolved = path.basename(relativePath);
      break;
    
    case "${fileBasenameNoExtension}": case "${ fileBasenameNoExtension }":
      resolved = path.basename(relativePath, path.extname(relativePath))
      break;
     
    case "${fileExtname}": case "${ fileExtname }":   // includes the `.` unfortunately
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
      if (caller === "filesToExclude" && resolved === ".")
        resolved = "**";
      break;

    case "${workspaceFolderBasename}":  case "${ workspaceFolderBasename }":
      resolved = path.basename(vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).uri.path);
       break;
     
    case "${selectedText}":  case "${ selectedText }":
      if (selection.isEmpty) {
        const wordRange = vscode.window.activeTextEditor.document.getWordRangeAtPosition(selection.start);
        resolved = vscode.window.activeTextEditor.document.getText(wordRange);
      }
      else resolved = vscode.window.activeTextEditor.document.getText(selection);
      break;
     
    case "${pathSeparator}": case "${ pathSeparator }":
      resolved = path.sep;
      break;
     
    case "${matchIndex}": case "${ matchIndex }":
      resolved = String(matchIndex);
      break;
     
    case "${matchNumber}": case "${ matchNumber }":
      resolved = String(matchIndex + 1);
      break;
       
     case "${lineIndex}": case "${ lineIndex }":    // 0-based
       if (caller === "cursorMoveSelect" && args.restrict !== "document") resolved = String(match);
       else if (caller === "cursorMoveSelect" && args.restrict === "document") resolved = resolved;  // TODO?

       else if (caller !== "ignoreLineNumbers") {
         if (args.restrict === "selections") {
           const line = vscode.window.activeTextEditor.document.positionAt(match.index + selectionStartIndex).line;
           resolved = String(line);
         }
         else if (args.restrict === "next") {
           resolved = String(vscode.window.activeTextEditor.document.positionAt(selectionStartIndex).line); //  works for wholeDocument
         }
         // else if (restrict === "document") resolved = String(match.line); //  works for wholeDocument
         else if (args.restrict === "document") resolved = String(vscode.window.activeTextEditor.document.positionAt(match.index).line);
         else resolved = String(selection.active.line); // line/once find/replace
       }
       // "ignoreLineNumbers" will pass through unresolved
      break;

    case "${lineNumber}":  case "${ lineNumber }":   // 1-based
      if (caller === "cursorMoveSelect" && args.restrict !== "document") resolved = String(match + 1);
      else if (caller === "cursorMoveSelect" && args.restrict === "document") resolved = resolved;

      else if (caller !== "ignoreLineNumbers") {
        if (args.restrict === "selections") {
          const line = vscode.window.activeTextEditor.document.positionAt(match.index + selectionStartIndex).line;
          resolved = String(line + 1);
        }
        else if (args.restrict === "next") {
          resolved = String(vscode.window.activeTextEditor.document.positionAt(selectionStartIndex).line + 1); //  works for wholeDocument
        }
        // else if (restrict === "document") resolved = String(match.line + 1); //  works for wholeDocument
        else if (args.restrict === "document") resolved = String(vscode.window.activeTextEditor.document.positionAt(match.index).line + 1); //  works for wholeDocument
        else resolved = String(selection.active.line + 1); // line/once find/replace
      }
      // "ignoreLineNumbers" will pass through unresolved
      break;

    case "${CLIPBOARD}": case "${ CLIPBOARD }":
      resolved = args.clipText;
      break;

    case "${resultsFiles}": case "${ resultsFiles }":
      resolved = args.resultsFiles;
      break;
     
    default:
      break;
   }

	// escape .*{}[]?^$ if using in a find
  if (!args.isRegex && caller === "find") return resolved.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
   
  else if (caller === "filesToInclude" && resolved === ".") return  "./";
  
  else return resolved;
};


/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {String} replaceValue
 * @param {Object} args - keybinding/setting args
 * @param {String} caller - find/replace/cursorMoveSelect
 * @param {vscode.Selection} selection - the current selection
 * 
 * @returns {Promise<string>} - the resolved string
 */
exports.resolveSearchPathVariables = async function (replaceValue, args, caller, selection) {

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
      resolved = _resolvePathVariables(identifier.groups.path, args, caller, selection, null, null, null);
      if (identifier.groups.pathCaseModifier)
        resolved = _applyCaseModifier(identifier.groups.pathCaseModifier, identifier[1], identifier[2], null, "", identifier.groups, identifiers, resolved);
    }

    replaceValue = replaceValue.replace(identifier[0], resolved);
  }  // end of identifiers loop
  
  return replaceValue;
};

/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {Object} args - keybinding/settings args
 * @param {String} caller - find/replace/cursorMoveSelect
 * @param {Array} groups - may be a single match
 * @param {vscode.Selection} selection - the current selection
 * @param {Number} matchIndex - which match is it
 * @returns {string} - the resolved string
 */
exports.buildReplace = function (args, caller, groups, selection, selectionStartIndex, matchIndex) {

  let replaceValue;
  
  if (caller === "find" || caller === "ignoreLineNumbers") replaceValue = args?.find;
  else if (caller === "replace") replaceValue = args?.replace;
  else if (caller === "cursorMoveSelect") replaceValue = args?.cursorMoveSelect;
  
  if (!replaceValue) return replaceValue;
  const specialVariable = new RegExp('\\$[\\{\\d]');
  if (replaceValue.search(specialVariable) === -1) return replaceValue;  // doesn't contain '${' or '$\d'

  let resolved = replaceValue;
  let re;

  // --------------------  path variables -----------------------------------------------------------
  let vars = _getPathVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
  re = new RegExp(`(?<pathCaseModifier>\\\\[UuLl])?(?<path>${ vars })`, 'g');

  resolved = resolved.replaceAll(re, function (match, p1, p2, offset, string, namedGroups) {
    
    const variableToResolve = _resolvePathVariables(match, args, caller, selection, groups, selectionStartIndex, matchIndex);
    return _applyCaseModifier(match, p1, p2, offset, string, namedGroups, groups, variableToResolve);
  });
  // --------------------  path variables -----------------------------------------------------------
  

  // https://regex101.com/r/zwuKpM/1 for full regex
  // (?<pathCaseModifier>\\\\[UuLl])?(?<path>\${\s*file\s*}|\${\s*relativeFile\s*}|\${\s*fileBasename\s*}|\${\s*fileBasenameNoExtension\s*}|\${\s*fileExtname\s*}|\${\s*fileDirname\s*}|\${\s*fileWorkspaceFolder\s*}|\${\s*workspaceFolder\s*}|\${\s*relativeFileDirname\s*}|\${\s*workspaceFolderBasename\s*}|\${\s*selectedText\s*}|\${\s*pathSeparator\s*}|\${\s*lineIndex\s*}|\${\s*lineNumber\s*}|\${\s*CLIPBOARD\s*}|\${\s*resultsFiles\s*})|(?<caseModifier>\\\\[UuLl])(?<capGroup>\$\{?\d\d?\}?)|(?<caseTransform>\$\{(\d\d?):\/((up|down|pascal|camel)case|capitalize)\})|(?<conditional>\$\{\d\d?:[-+?]?(.*?)(?<!\\)\})|(?<capGroupOnly>\$\{?\d\d?\}?)|(?<jsOp>\$\$\{(.*)\})

  // if (caller !== "find" && !args.isRegex) {
  if (caller !== "find") {
  
    // --------------------  caseModifier/capGroup --------------------------------------------------
    re = new RegExp("(?<caseModifier>\\\\[UuLl])(?<capGroup>\\$\\{?\\d\\d?\\}?)", "g");
      
    resolved = resolved.replaceAll(re, (match, p1, p2, offset, string, namedGroups) =>
      _applyCaseModifier(match, p1, p2, offset, string, namedGroups, groups, ""));
    // --------------------  caseModifier/capGroup --------------------------------------------------
      
    // --------------------  caseTransform ----------------------------------------------------------
    re = new RegExp("(?<caseTransform>\\$\\{(\\d\\d?):\\/((up|down|pascal|camel)case|capitalize)\\})", "g");

    resolved = resolved.replaceAll(re, (match, p1, p2, p3, p4, offset, string, namedGroups) =>
      _applyCaseTransform(match, p1, p2, p3, p4, offset, string, namedGroups, groups));
    // --------------------  caseTransform ----------------------------------------------------------
    
    // --------------------  conditional ------------------------------------------------------------
    re = new RegExp("(?<conditional>\\$\\{(\\d\\d?):([-+?]?)(.*?)\\})", "g");
    
    // // if a '}' in a replacement? => '\\}' must be escaped
    // // ${1:+${2}}  ?  => ${1:+`$2`} or ${1:+`$2`} note the backticks or ${1:+$1 pardner}
    //  checks for capture groups inside _applyConditionalTransform
    resolved = resolved.replaceAll(re, (match, p1, p2, p3, p4, offset, string, namedGroups) =>
      _applyConditionalTransform(match, p1, p2, p3, p4, offset, string, namedGroups, groups));
    // --------------------  conditional -----------------------------------------------------------
    
    // --------------------  capGroupOnly ----------------------------------------------------------
    re = new RegExp("(?<capGroupOnly>(?<!\\$)\\$\{(\\d\\d?)\\}|(?<!\\$)\\$(\\d\\d?))", "g");
    
    resolved = resolved.replaceAll(re, function(match, p1, p2, p3) {
      if (groups && p2 && groups[p2]) return groups[p2];
      else if (groups && p3 && groups[p3]) return groups[p3];
      else return "";     // no matching capture group
    });
    // --------------------  capGroupOnly ----------------------------------------------------------
    
    
    // -------------------  jsOp ------------------------------------------------------------------
    re = new RegExp("(?<jsOp>\\$\\$\\{([\\S\\s]*?)\\})", "g");
    
    resolved = resolved.replaceAll(re, function (match, p1, operation) {
      // checking for capture groups is not necessary, already done above
      return Function(`"use strict"; ${operation}`)();
    });
    // -------------------  jsOp ------------------------------------------------------------------
  }
  
  return resolved;
};


/**
 * Apply case modifier, like '\\U' to capture groups $1, etc..
 * 
 * @param {String} match
 * @param {String} p1 - capture group 1
 * @param {String} p2 - capture group 2
 * @param {Number} offset - offset index of this match
 * @param {String} string - the entire matched string
 * @param {Object} namedGroups
 * @param {Object} groups
 * @param {String} resolvedPathVariable
 * 
 * @returns {String} - case-modified text
 */
function _applyCaseModifier(match, p1, p2, offset, string, namedGroups, groups, resolvedPathVariable) {

  let resolved = resolvedPathVariable;
  
  if (namedGroups?.path && namedGroups?.path.search(/\$\{\s*(line|match)(Index|Number)\s*\}/) !== -1) {
    return resolvedPathVariable;
  }
  
  if (namedGroups?.caseModifier) {
    const thisCapGroup = namedGroups.capGroup.replace(/[${}]/g, "");
    resolved = groups[thisCapGroup];
  }
  else if (namedGroups?.pathCaseModifier) {
    resolved = resolvedPathVariable;
  }
  
  switch (namedGroups?.caseModifier || namedGroups?.pathCaseModifier) {
  
    case "\\U":
      resolved = resolved.toLocaleUpperCase();
      break;

    case "\\u":
      resolved = resolved[0].toLocaleUpperCase() + resolved.substring(1);
      break;

    case "\\L":
      resolved = resolved.toLocaleLowerCase();
      break;

    case "\\l":
      resolved = resolved[0].toLocaleLowerCase() + resolved.substring(1);
      break;

    default:
      break;
  }
  return resolved;
}


/**
 * Apply case transform, like '${1:/upcase}' to text.
 * 
 * @param   {String} match 
 * @param   {String} p1 - capture group 1
 * @param   {String} p2 - capture group 2
 * @param   {String} p3 - capture group 3
 * @param   {String} p4 - capture group 4
 * @param   {Number} offset - offset index of this match
 * @param   {String} string - entire matched string
 * @param   {Object} namedGroups
 * @param   {Object} groups
 * @returns {String} - modified text
 */
function _applyCaseTransform(match, p1, p2, p3, p4, offset, string, namedGroups, groups) {
  
  let resolved = groups[p2];

  switch (p3) {

    case "upcase":
      resolved = resolved.toLocaleUpperCase();
      break;

    case "downcase":
      resolved = resolved.toLocaleLowerCase();
      break;

    case "capitalize":
      resolved = resolved[0].toLocaleUpperCase() + resolved.substring(1);
      break;

    case "pascalcase":   			// first_second_third => FirstSecondThird
      resolved = utilities.toPascalCase(resolved);
      break;

    case "camelcase":        // first_second_third => firstSecondThird
      resolved = utilities.toCamelCase(resolved);
      break;
  }
  return resolved;
}


/**
 * Apply conditional transform, like '${1:+ add text }' to text.
 * 
 * @param   {String} match 
 * @param   {String} p1 - capture group 1
 * @param   {String} p2 - capture group 2
 * @param   {String} p3 - capture group 3
 * @param   {String} p4 - capture group 4
 * @param   {Number} offset - offset index of this match
 * @param   {String} string - entire matched string
 * @param   {Object} namedGroups
 * @param   {Object} groups
 * @returns {String} - modified text
 */
function _applyConditionalTransform(match, p1, p2, p3, p4, offset, string, namedGroups, groups) {
  
  let resolved = match;

  switch (p3) {

    case "+":                        // if ${1:+yes}
      if (groups && groups[p2]) {
        resolved = _checkForCaptureGroupsInConditionalReplacement(p4, groups);
      }
      // "if" but no matching capture group, do nothing
      else resolved = "";
      break;

    case "-":                       // else ${1:-no} or ${1:no}
    case "":
      if (groups && !groups[p2]) {
        resolved = _checkForCaptureGroupsInConditionalReplacement(p4, groups);
      }
      // "else" there is a matching capture group, do nothing
      else resolved = "";
      break;

    case "?":                        // if/else ${1:?yes:no}
      const replacers = p4.split(":");

      if (groups && groups[p2]) {
        resolved = _checkForCaptureGroupsInConditionalReplacement(replacers[0], groups);
      }
      else resolved = _checkForCaptureGroupsInConditionalReplacement(replacers[1] ?? "", groups);
      break;
  }
  return resolved;
}


/**
 * Are there capture groups, like `$1` in this conditional replacement text?
 * 
 * @param {String} replacement 
 * @param {Array} groups 
 * @returns {String} - resolve the capture group
 */
function _checkForCaptureGroupsInConditionalReplacement(replacement, groups) {

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
    "${selectedText}", "${pathSeparator}", "${lineIndex}", "${lineNumber}", "${CLIPBOARD}", "${resultsFiles}",
    "${matchIndex}", "${matchNumber}"
  ];
}


/**
 * When no 'find' key in command: make a find value for use as a regexp
 * from all selected words or words at cursor positions wrapped by word boundaries \b
 *
 * @param   {Array<vscode.Selection>} selections
 * @param   {Object} args
 * @returns {Object} - { selected text '(a|b c|d)', mustBeRegex b/c Set.size > 1 }
 */
exports.makeFind = function (selections, args) {

  const document = vscode.window.activeTextEditor.document;
  let selectedText = "";
  let textSet = new Set();
  let find = "";
  let mustBeRegex = false;

  // only use the first selection for these options: nextSelect/nextMoveCursor/nextDontMoveCursor
  if (args?.restrictFind?.substring(0, 4) === "next") {
    selections = [selections[0]];
  }

  selections.forEach((selection) => {

    if (selection.isEmpty) {
      const wordRange = document.getWordRangeAtPosition(selection.start);  // undefined if no word at cursor
      if (wordRange) selectedText = document.getText(wordRange);
    }
    else {
      const selectedRange = new vscode.Range(selection.start, selection.end);
      selectedText = document.getText(selectedRange);
    }
    textSet.add(selectedText);
  });

  for (let item of textSet) find += `${ item }|`; // Sets are unique, so this de-duplicates any selected text
  find = find.substring(0, find.length - 1);  // remove the trailing '|'

  // if .size of the set is greater than 1 then isRegex must be true
  if (textSet.size > 1) mustBeRegex = true;
  if (args.isRegex) find = `(${ find })`;  // e.g. "(\\bword\\b|\\bsome words\\b|\\bmore\\b)"

  return { find, mustBeRegex };
}