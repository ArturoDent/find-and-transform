const vscode = require('vscode');    
const path = require('path');        
const os = require('os');     
const utilities = require('./utilities');     
const outputChannel = vscode.window.createOutputChannel("find-and-transform");


/**
 * 
 * @param {string} findValue 
 * @returns {Promise<string>}
 */
exports.replaceFindCaptureGroups = async function (findValue) {


  const editor = vscode.window.activeTextEditor;
  // findValue = findValue.replace(/\\\$(\d+)/g, (match, p1) => {
  findValue = findValue.replace(/(\\[UuLl])?\\\$(\d+)/g, (match, p1, p2) => {
    
    // if no selection[n] in document, but in findValue
    // if (p1 > editor.selections.length) return "";
    if (p2 > editor.selections.length) return "";
    
    // if selection.isEmpty get wordRangeAtCursor
    // else if (editor.selections[p1 - 1].isEmpty) {
    else if (editor.selections[p2 - 1].isEmpty) {
      // const pos = editor.selections[p1 - 1].active;
      const pos = editor.selections[p2 - 1].active;
      const range = editor.document.getWordRangeAtPosition(pos);
      // return editor.document.getText(range);
      return _modifyCaseOfFindCaptureGroup(p1, editor.document.getText(range));
    }
    // escape regex characters above and below
    // else return editor.document.getText(editor.selections[p1 - 1]);
    // else return editor.document.getText(editor.selections[p2 - 1]);
    else return _modifyCaseOfFindCaptureGroup(p1, editor.document.getText(editor.selections[p2 - 1]));
  });
  
  return findValue;
}


/**
 * 
 * @param {string} caseModifier - e.g., \\U, \\u, etc.
 * @param {string} resolvedCaptureGroup
 * @returns {string}
 */
 function _modifyCaseOfFindCaptureGroup (caseModifier, resolvedCaptureGroup ) {

  if (!caseModifier) return resolvedCaptureGroup;

  switch (caseModifier) {
    
    case "\\U":
      resolvedCaptureGroup = resolvedCaptureGroup.toLocaleUpperCase();
      break;

    case "\\u":
      resolvedCaptureGroup = resolvedCaptureGroup[0].toLocaleUpperCase() + resolvedCaptureGroup.substring(1);
      break;

    case "\\L":
      resolvedCaptureGroup = resolvedCaptureGroup.toLocaleLowerCase();
      break;

    case "\\l":
      resolvedCaptureGroup = resolvedCaptureGroup[0].toLocaleLowerCase() + resolvedCaptureGroup.substring(1);
      break;

    default:
      break;
  }

  return resolvedCaptureGroup;
}


/**
 * If the "filesToInclude/find/replace" entry uses a path variable(s) return the resolved value  
 * 
 * @param {string} variableToResolve - the "filesToInclude/find/replace" value 
 * @param {Object} args -  keybinding/settings args
 * @param {string} caller - if called from a find.parseVariables() or replace or filesToInclude 
 * @returns {string} - the resolved path variable
 */
function _resolveExtensionDefinedVariables (variableToResolve, args, caller) {

  if (typeof variableToResolve !== 'string') return variableToResolve;
    
  const document = vscode.window.activeTextEditor.document;
  let resolved = variableToResolve;
  
  let testLineRE = /\$\{getTextLines:(?<lineNumber>\d+)\}/;
  let lineTextMatch = variableToResolve.match(testLineRE);
   
  if (lineTextMatch?.groups) {
    resolved = document.lineAt(Number(lineTextMatch.groups.lineNumber)).text;
  }
  else {
    testLineRE = /\$\{getTextLines:(?<From>\d+)-(?<To>\d+)\}/;
    lineTextMatch = variableToResolve.match(testLineRE);
    if (lineTextMatch?.groups) {
      const lastChar = document.lineAt(Number(lineTextMatch.groups.To)).range.end.character;
      resolved = document.getText(new vscode.Range(Number(lineTextMatch.groups.From), 0, Number(lineTextMatch.groups.To), lastChar));
    }
    else {
      testLineRE = /\$\{getTextLines:(?<startL>\d+),(?<startCh>\d+),(?<endL>\d+),(?<endCh>\d+)\}/;
      lineTextMatch = variableToResolve.match(testLineRE);
      if (lineTextMatch?.groups)
        resolved = document.getText(new vscode.Range(Number(lineTextMatch.groups.startL), Number(lineTextMatch.groups.startCh),
          Number(lineTextMatch.groups.endL), Number(lineTextMatch.groups.endCh)));
    }
  }

  if (!lineTextMatch?.groups) {

  // else {
  
    const namedGroups = resolved.match(/(?<varCaseModifier>\\[UuLl])?(?<definedVars>\$\{\s*.*?\s*\})/).groups;

    switch (namedGroups.definedVars) {
    
      case "${getDocumentText}": case "${ getDocumentText }":
        resolved = document.getText();
        break;
  
      case "${resultsFiles}": case "${ resultsFiles }":
        resolved = args.resultsFiles;
        break;
  
      default:
        break;
    }
  }

	// escape .*{}[]?^$ if using in a find or findSearch
  if (!args.isRegex && caller === "find") return resolved.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
  else if (!args.isRegex && caller === "findSearch") return resolved.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");

  else if (caller === "filesToInclude" && resolved === ".") return  "./";
  
  else return resolved;
};

/**
 * Resolve the matchIndex/Number variable.
 * 
 * @param {string} variableToResolve 
 * @param {number} replaceIndex  - for a find/replace/filesToInclude value?
 * @returns {string} - resolvedVariable with matchIndex/Number replaced
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
 * @param {string} variableToResolve 
 * @param {number} index  - match.index
 * @returns {string} - resolvedVariable with matchIndex/Number replaced
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
 * @param {string} variableToResolve - the "filesToInclude/find/replace" value 
 * @param {Object} args -  keybinding/settings args
 * @param {string} caller - if called from a find.parseVariables() or replace or filesToInclude 
 * @param {vscode.Selection} selection - current selection
 * @param {Object} match - the current match
 * @param {number} selectionStartIndex - in the start index of this selection
 * @param {number} matchIndex - which match is it
 * 
 * @returns {string} - the resolved path variable
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
       else if (caller === "cursorMoveSelect" && args.restrict === "document") resolved = resolved;

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

    // case "${resultsFiles}": case "${ resultsFiles }":
    //   resolved = args.resultsFiles;
    //   break;
     
    default:
      break;
   }

	// escape .*{}[]?^$+|/ if using in a find
  if (!args.isRegex && caller === "find") return resolved.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
  else if (!args.isRegex && caller === "findSearch") return resolved.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
  // in case use " let re = /${selectedText}/" and selectedText, etc. has a / in it, then 
  else if (caller === "replace") return resolved.replaceAll(/([\\/])/g, "\\$1");
  else if (caller === "filesToInclude" && resolved === ".") return  "./";
  
  else return resolved;
};


/**
 * If the "filesToInclude/find/replace" entry uses a path variable(s) return the resolved value  
 * 
 * @param {string} variableToResolve - the "filesToInclude/find/replace" value 
 * @param {Object} args -  keybinding/settings args
 * @param {string} caller - if called from a find.parseVariables() or replace or filesToInclude 
 * @param {vscode.Selection} selection - current selection
 * @param {Object} groups - the current match
 * @returns {string} - the resolved path variable
 */
function _resolveSnippetVariables (variableToResolve, args, caller, selection, groups) {

  if (typeof variableToResolve !== 'string') return variableToResolve;

  const _date = new Date();
  const document = vscode.window.activeTextEditor.document;
  let blockCommentConfig = {};
  // const documentLanguageId = document.languageId;
  // const currentLanguageConfig = await languageConfigs.get(documentLanguageId, 'comments');

  let resolved = variableToResolve;
  const namedGroups = resolved.match(/(?<pathCaseModifier>\\[UuLl])?(?<snippetVars>\$\{\s*.*?\s*\})/).groups;

  switch (namedGroups.snippetVars) {
     
    case "$TM_CURRENT_LINE": case "${TM_CURRENT_LINE}":
      let textLine = "";
      const selectionOffset = document.offsetAt(selection.active);
      if (caller === 'replace' && groups) {               // caller === replace
        textLine = document.lineAt(document.positionAt(selectionOffset + groups?.index).line).text;
      }
      else {                                    // caller === find/ignoreLineNumbers/cursorMoveSelect
        textLine = document.lineAt(document.positionAt(selectionOffset).line).text;
      }
      resolved = textLine;
    break; 

    case "$TM_CURRENT_WORD": case "${TM_CURRENT_WORD}":
      const wordRange = document.getWordRangeAtPosition(selection.active);
      if (wordRange) resolved = document.getText(wordRange);
      else resolved = "";
      break;
     
    case "$CURRENT_YEAR": case "${CURRENT_YEAR}":
      resolved = String(_date.getFullYear());
      break;
     
    case "$CURRENT_YEAR_SHORT": case "${CURRENT_YEAR_SHORT}":
      resolved = String(_date.getFullYear()).slice(-2);
      break;
     
    case "$CURRENT_MONTH": case "${CURRENT_MONTH}":
      resolved = String(_date.getMonth().valueOf() + 1).padStart(2, '0');
      break;
     
    case "$CURRENT_MONTH_NAME": case "${CURRENT_MONTH_NAME}":
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      resolved = monthNames[_date.getMonth()];
      break;
     
    case "$CURRENT_MONTH_NAME_SHORT": case "${CURRENT_MONTH_NAME_SHORT}":
      const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      resolved = monthNamesShort[_date.getMonth()];
      break;
     
    case "$CURRENT_DATE": case "${CURRENT_DATE}":
      resolved = String(_date.getDate().valueOf()).padStart(2, '0');
      break;
     
    case "$CURRENT_DAY_NAME": case "${CURRENT_DAY_NAME}":
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      resolved = dayNames[_date.getDay()];
      break;
     
    case "$CURRENT_DAY_NAME_SHORT": case "${CURRENT_DAY_NAME_SHORT}":
      const dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      resolved = dayNamesShort[_date.getDay()];
      break;
     
    case "$CURRENT_HOUR": case "${CURRENT_HOUR}":
      resolved = String(_date.getHours().valueOf()).padStart(2, '0');
      break;
     
    case "$CURRENT_MINUTE": case "${CURRENT_MINUTE}":
      resolved = String(_date.getMinutes().valueOf()).padStart(2, '0');
      break;
     
    case "$CURRENT_SECOND": case "${CURRENT_SECOND}": case "${ CURRENT_SECOND }":
      resolved = String(_date.getSeconds().valueOf()).padStart(2, '0');
      break;
     
    case "$CURRENT_SECONDS_UNIX": case "${CURRENT_SECONDS_UNIX}": case "${ CURRENT_SECONDS_UNIX }":
      resolved = String(Math.floor(_date.getTime() / 1000));
      break;
     
    case "$RANDOM": case "${RANDOM}": case "${ RANDOM }":
      resolved = Math.random().toString().slice(-6);
      break;
     
    case "$RANDOM_HEX": case "${RANDOM_HEX}": case "${ RANDOM_HEX }":
      resolved = Math.random().toString(16).slice(-6);
      break;
     
    case "$BLOCK_COMMENT_START": case "${BLOCK_COMMENT_START}": case "${ BLOCK_COMMENT_START }":
      blockCommentConfig = args.currentLanguageConfig?.blockComment;
      resolved = blockCommentConfig ? blockCommentConfig[0] : "";
      break;
     
    case "$BLOCK_COMMENT_END": case "${BLOCK_COMMENT_END}": case "${ BLOCK_COMMENT_END }":
      blockCommentConfig = args.currentLanguageConfig?.blockComment;
      resolved = blockCommentConfig ? blockCommentConfig[1] : "";
      break;
     
    case "$LINE_COMMENT": case "${LINE_COMMENT}": case "${ LINE_COMMENT }":
      resolved = args.currentLanguageConfig?.lineComment ?? "";
      break;
     
    default:
      break;
   }

	// escape .*{}[]?^$ if using in a find or findSearch
  if (!args.isRegex && caller === "find") return resolved.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
  else if (!args.isRegex && caller === "findSearch") return resolved.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");

  else if (caller === "filesToInclude" && resolved === ".") return  "./";
  
  else return resolved;
};



/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {string} replaceValue
 * @param {Object} args - keybinding/setting args
 * @param {string} caller - find/replace/cursorMoveSelect
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
}

/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {string} replaceValue
 * @param {Object} args - keybinding/setting args
 * @param {string} caller - find/replace/cursorMoveSelect
 * @param {vscode.Selection} selection - the current selection
 * 
 * @returns {Promise<string>} - the resolved string
 */
 exports.resolveSearchSnippetVariables = async function (replaceValue, args, caller, selection) {

  if (replaceValue === "") return replaceValue;

  let vars;
  let re;
  let resolved;

  if (replaceValue !== null) {

    vars = _getSnippetVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
    re = new RegExp(`(?<pathCaseModifier>\\\\[UuLl])?(?<snippetVars>${ vars })`, 'g');
  
    resolved = replaceValue.replaceAll(re, function (match, p1, p2, offset, string, namedGroups) {
      
      const variableToResolve =  _resolveSnippetVariables(match, args, caller, selection, undefined);
      return _applyCaseModifier(match, p1, p2, offset, string, namedGroups, undefined, variableToResolve);
    });
  };
  return resolved;
}

/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {Object} args - keybinding/settings args
 * @param {string} caller - find/replace/cursorMoveSelect
 * @param {Array} groups - may be a single match
 * @param {vscode.Selection} selection - the current selection
 * @param {number} matchIndex - which match is it
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
  
   // --------------------  extension-defined variables -------------------------------------------
  let vars = _getExtensionDefinedVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
  re = new RegExp(`(?<varCaseModifier>\\\\[UuLl])?(?<path>${ vars })`, 'g');

  resolved = resolved.replaceAll(re, function (match, p1, p2, offset, string, namedGroups) {
    
    const variableToResolve = _resolveExtensionDefinedVariables(match, args, caller);
    return _applyCaseModifier(match, p1, p2, offset, string, namedGroups, groups, variableToResolve);
  });
  // --------------------  extension-defined variables ----------------------------------------------

  // --------------------  path variables -----------------------------------------------------------
  vars = _getPathVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
  re = new RegExp(`(?<pathCaseModifier>\\\\[UuLl])?(?<path>${ vars })`, 'g');

  resolved = resolved.replaceAll(re, function (match, p1, p2, offset, string, namedGroups) {
    
    const variableToResolve = _resolvePathVariables(match, args, caller, selection, groups, selectionStartIndex, matchIndex);
    return _applyCaseModifier(match, p1, p2, offset, string, namedGroups, groups, variableToResolve);
  });
  // --------------------  path variables -----------------------------------------------------------
  
  // --------------------  snippet variables -----------------------------------------------------------
  vars = _getSnippetVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
  re = new RegExp(`(?<pathCaseModifier>\\\\[UuLl])?(?<snippetVars>${ vars })`, 'g');

  resolved = resolved.replaceAll(re, function (match, p1, p2, offset, string, namedGroups) {
    
    const variableToResolve = _resolveSnippetVariables(match, args, caller, selection, groups);
    return _applyCaseModifier(match, p1, p2, offset, string, namedGroups, groups, variableToResolve);
  });
  // --------------------  snippet variables -----------------------------------------------------------

  // https://regex101.com/r/zwuKpM/1 for full regex
  // (?<pathCaseModifier>\\\\[UuLl])?(?<path>\${\s*file\s*}|\${\s*relativeFile\s*}|\${\s*fileBasename\s*}|
  // \${ \s * fileBasenameNoExtension\s *}|\${ \s * fileExtname\s *}|\${ \s * fileDirname\s *}|\${ \s * fileWorkspaceFolder\s *}|
  // \${ \s * workspaceFolder\s *}|\${ \s * relativeFileDirname\s *}|\${ \s * workspaceFolderBasename\s *}|
  // \${ \s * selectedText\s *}|\${ \s * pathSeparator\s *}|\${ \s * lineIndex\s *}|\${ \s * lineNumber\s *}|
  // \${ \s * CLIPBOARD\s *}|\${ \s * resultsFiles\s *})| (? <caseModifier>\\\\[UuLl])(?<capGroup>\$\{?\d\d?\}?)|
  // (? <caseTransform>\$\{(\d\d?):\/((up|down|pascal|camel)case|capitalize)\})|(?<conditional>\$\{\d\d?:[-+?]?(.*?)(?<!\\)\})|
  // (? <capGroupOnly>\$\{?\d\d?\}?)|(?<jsOp>\$\$\{(.*)\}\$\$)

  // (?<=\.replaceAll\(|replace\()\s*\/([^\/]+)\/[gmi]\s*,\s*["'`]([^"'`]*)["'`]\s*\)
  // https://regex101.com/r/dTTHi7/1
  
  // if (caller !== "find" && !args.isRegex) {
  // TODO if caller = findSearch
  if (caller !== "find") {
  
    // --------------------  caseModifier/capGroup --------------------------------------------------
    re = new RegExp("(?<caseModifier>\\\\[UuLl])(?<capGroup>\\$\\{?\\d\\}?)", "g");
      
    resolved = resolved.replaceAll(re, (match, p1, p2, offset, string, namedGroups) =>
      _applyCaseModifier(match, p1, p2, offset, string, namedGroups, groups, ""));
    // --------------------  caseModifier/capGroup --------------------------------------------------
      
    // --------------------  caseTransform ----------------------------------------------------------
    re = new RegExp("(?<caseTransform>\\$\\{(\\d):\\/((up|down|pascal|camel)case|capitalize)\\})", "g");

    resolved = resolved.replaceAll(re, (match, p1, p2, p3, p4, offset, string, namedGroups) =>
      _applyCaseTransform(match, p1, p2, p3, p4, offset, string, namedGroups, groups));
    // --------------------  caseTransform ----------------------------------------------------------
    
    // --------------------  conditional ------------------------------------------------------------
    re = new RegExp("(?<conditional>\\$\\{(\\d):([-+?]?)(.*?)\\})", "g");
    
    // // if a '}' in a replacement? => '\\}' must be escaped
    // // ${1:+${2}}  ?  => ${1:+`$2`} or ${1:+`$2`} note the backticks or ${1:+$1 pardner}
    //  will check for capture groups inside _applyConditionalTransform
    resolved = resolved.replaceAll(re, (match, p1, p2, p3, p4, offset, string, namedGroups) =>
      _applyConditionalTransform(match, p1, p2, p3, p4, offset, string, namedGroups, groups));
    // --------------------  conditional -----------------------------------------------------------
    
    // --------------------  capGroupOnly ----------------------------------------------------------
    re = new RegExp("(?<capGroupOnly>(?<!\\$)\\$\{(\\d)\\}|(?<!\\$)\\$(\\d))", "g");
    
    resolved = resolved.replaceAll(re, function (match, p1, p2, p3, offset) {
      
      // So can use 'replace(/.../, '$nn?')` and use the replace capture group
      
      // check for a capture group '$nn?' in a replace/replaceAll replacement
      // if there is a capture group, check to see if it is the <capGroupOnly> $nn by their same index and offset
      // if true just return the match $nn? and do not replace the capture group by any group[n] match
      const replaceRE = /(?<=(?:\.replaceAll\(|\.replace\()\s*\/[^/]+\/[gmi]?\s*,\s*\\?["'`].*?)(?<capGroup>\$\d\d?).*?(?=\\?["'`]\s*\))/g;
      const found = [...resolved.matchAll(replaceRE)];
      if (found[0]?.index === offset) return match;    // also works for emptyPointSelections
            
      if (groups && p2 && groups[p2]) return groups[p2];
      else if (groups && p3 && groups[p3]) return groups[p3];
      else return "";     // no matching capture group
    });
    // --------------------  capGroupOnly ----------------------------------------------------------
    
    // ${vsapi: ... } here  
    
    // -------------------  vscode API -------------------------------------------------------------
    
    // just eval the whole string here? avoid jsOp?
    // re = new RegExp("(?<vscodeAPI>\\$\\{\\s*(vscode\..*?)\\s*\\})", "gm");
    // re = new RegExp("(?<vscodeAPI>\\$\\{\\s*((new)?\\s*vscode\..*?)\\s*\\})", "gm");   // new
    // re = new RegExp("(?<vscodeAPI>\\$\\$\\{\s*vsapi:\s*([\\S\\s]*?)\\}\\$\\$)", "gm");   // new
    
    // // "const fullText = `${vscode.window.activeTextEditor.document.getText()}`;",
    
    // try {
    //   resolved = resolved.replaceAll(re, function (match, p1, api) {
    //     // checking for capture groups and variables already done above
    //     return  eval(api);
    //   });
    // }
    // catch (error) {
    //   outputChannel.appendLine(`\n${error.stack}\n`);
    //   vscode.window.showWarningMessage("There was an error in the `$${<operations>}$$` part of the replace value.  See the Output channel: `find-and-transform` for more.")
    // }
    // -------------------  vscode API -------------------------------------------------------------
    
    // -------------------  jsOp ------------------------------------------------------------------
    // can have multiple $${...}$$ in a replace
    re = new RegExp("(?<jsOp>\\$\\$\\{([\\S\\s]*?)\\}\\$\\$)", "gm");
    try {
      resolved = resolved.replaceAll(re, function (match, p1, operation) {
        // checking for capture groups and variables already done above
        return Function(`"use strict"; ${operation}`)();
        // return await Function(`${operation}`)(vscode);
        
      });
    }
    catch (error) {
      outputChannel.appendLine(`\n${error.stack}\n`);
      vscode.window.showWarningMessage("There was an error in the `$${<operations>}$$` part of the replace value.  See the Output channel: `find-and-transform` for more.")
    }
    // -------------------  jsOp ------------------------------------------------------------------
  }
  
  return resolved;
};


/**
 * Apply case modifier, like '\\U' to capture groups $1, etc..
 * 
 * @param {string} match
 * @param {string} p1 - capture group 1
 * @param {string} p2 - capture group 2
 * @param {number} offset - offset index of this match
 * @param {string} string - the entire matched string
 * @param {Object} namedGroups
 * @param {Object} groups
 * @param {string} resolvedPathVariable
 * 
 * @returns {string} - case-modified text
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
 * @param   {string} match 
 * @param   {string} p1 - capture group 1
 * @param   {string} p2 - capture group 2
 * @param   {string} p3 - capture group 3
 * @param   {string} p4 - capture group 4
 * @param   {number} offset - offset index of this match
 * @param   {string} string - entire matched string
 * @param   {Object} namedGroups
 * @param   {Object} groups
 * @returns {string} - modified text
 */
function _applyCaseTransform(match, p1, p2, p3, p4, offset, string, namedGroups, groups) {
  
  let resolved = groups[p2];

  if (!resolved) return undefined;
  
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
 * @param   {string} match 
 * @param   {string} p1 - capture group 1
 * @param   {string} p2 - capture group 2
 * @param   {string} p3 - capture group 3
 * @param   {string} p4 - capture group 4
 * @param   {number} offset - offset index of this match
 * @param   {string} string - entire matched string
 * @param   {Object} namedGroups
 * @param   {Object} groups
 * @returns {string} - modified text
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
 * @param {string} replacement 
 * @param {Array} groups 
 * @returns {string} - resolve the capture group
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
 * @returns {Array} - all the available variables defined by this extension
 */
function _getExtensionDefinedVariables() {

  return ["${getDocumentText}", "${getTextLines:\\d+}", "${getTextLines:\\d+-\\d+}",
    "${getTextLines:\\d+,\\d+,\\d+,\\d+}", "${resultsFiles}"];
}


/**
 * @returns {Array} - all the available path variables
 */
function _getPathVariables() {

  return [
    "${file}", "${relativeFile}", "${fileBasename}", "${fileBasenameNoExtension}", "${fileExtname}", "${fileDirname}",
    "${fileWorkspaceFolder}", "${workspaceFolder}", "${relativeFileDirname}", "${workspaceFolderBasename}", 
    // "${selectedText}", "${pathSeparator}", "${lineIndex}", "${lineNumber}", "${CLIPBOARD}", "${resultsFiles}",
    "${selectedText}", "${pathSeparator}", "${lineIndex}", "${lineNumber}", "${CLIPBOARD}",     
    "${matchIndex}", "${matchNumber}"
  ];
}

/**
 * @returns {Array} - all the available snippet variables
 */
function _getSnippetVariables() {

  return [
    "${TM_CURRENT_LINE}", "${TM_CURRENT_WORD}", 
    
    "${CURRENT_YEAR}", "${CURRENT_YEAR_SHORT}", "${CURRENT_MONTH}", "${CURRENT_MONTH_NAME}",
    "${CURRENT_MONTH_NAME_SHORT}", "${CURRENT_DATE}", "${CURRENT_DAY_NAME}", "${CURRENT_DAY_NAME_SHORT}",
    "${CURRENT_HOUR}", "${CURRENT_MINUTE}", "${CURRENT_SECOND}", "${CURRENT_SECONDS_UNIX}",
    
    "${RANDOM}", "${RANDOM_HEX}",
    "${BLOCK_COMMENT_START}", "${BLOCK_COMMENT_END}", "${LINE_COMMENT}"
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
  // emptyPointSelections: when an empty selection has no word at cursor
  let emptyPointSelections = new Set();

  // only use the first selection for these options: nextSelect/nextMoveCursor/nextDontMoveCursor
  if (args?.restrictFind?.substring(0, 4) === "next") {
    selections = [selections[0]];
  }

  selections.forEach((selection) => {

    if (selection.isEmpty) {
      const wordRange = document.getWordRangeAtPosition(selection.start);  // undefined if no word at cursor
      if (wordRange) selectedText = document.getText(wordRange);
      else emptyPointSelections.add(selection);
    }
    else {
      const selectedRange = new vscode.Range(selection.start, selection.end);
      selectedText = document.getText(selectedRange);
    }
    if ( selectedText.length ) textSet.add(selectedText);
  });

  for (let item of textSet) find += `${ item }|`; // Sets are unique, so this de-duplicates any selected text
  find = find.substring(0, find.length - 1);  // remove the trailing '|'

  // if .size of the set is greater than 1 then isRegex must be true
  if (textSet.size > 1) mustBeRegex = true;
  // if (args.isRegex && find.length) find = `\\b(${ find })\\b`;  // e.g. "(\\bword\\b|\\bsome words\\b|\\bmore\\b)"
  if (args.isRegex && find.length) find = `(${ find })`;  // e.g. "(word|some words|more)"
  

  return { find, mustBeRegex, emptyPointSelections };
}