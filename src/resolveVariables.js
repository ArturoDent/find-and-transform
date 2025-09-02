const vscode = require('vscode');
const { window, workspace, env, Range } = require('vscode');

const variables = require('./variables');
const regexp = require('./regex');
const path = require('path');        
const os = require('os');     
const utilities = require('./utilities');
const outputChannel = require('./outputChannel');


/**
 * If '${getTextLines:${line(Index|Number)}}' resolve lineIndex/Number immediately.
 * Else, resolve later in transform.js for each line of document/selection/line.
 * Only works on 'find' value, not 'replace', etc.
 * 
 * @param {window.activeTextEditor} editor
 * @param {Object} args - keybinding/settings args
 * @param {Number} matchIndex - which match is it: first, second, etc.
 * @param {import("vscode").Selection} selection
 * @returns {Promise<object>} findValue, isRegex
 */
exports.resolveFind = async function (editor, args, matchIndex, selection) {
  
  let resolvedFind = "";
  let cursorIndex = editor?.document?.offsetAt(editor.selection?.active);
  
  const lineIndexNumberRE = /\$\{getTextLines:[^}]*\$\{line(Index|Number)\}.*?\}/;
  
  if (args.find && args?.find?.search(lineIndexNumberRE) !== -1)
    resolvedFind = await this.resolveVariables(args, "find", null, selection ?? editor.selection, cursorIndex, matchIndex);
  else
    resolvedFind = await this.resolveVariables(args, "ignoreLineNumbers", null, selection ?? editor.selection, cursorIndex, matchIndex);
    
  return await this.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.ignoreWhiteSpace, args.madeFind);
}


/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {Object} args - keybinding/settings args
 * @param {string} caller - find/replace/cursorMoveSelect
 * @param {Object} groups - may be a single match
 * @param {import("vscode").Selection} selection - the current selection
 * @param {number} selectionStartIndex
 * @param {number} matchIndex - which match is it
 * @returns {Promise<string>} - the resolved string
 */
exports.resolveVariables = async function (args, caller, groups, selection, selectionStartIndex, matchIndex) {
  
  const { document } = window.activeTextEditor;
  let replaceValue;
  let jsOPerationHasAwait = [];
  
  // {
  //   "command": "workbench.action.terminal.sendSequence",
  //   "args": {
  //     // send the filename: to the terminal
  //     // "text": "code -g '${relativeFileDirname}\\${selectedText}':"
  //     // "text": "code -g '${relativeFileDirname}\\${selectedText}'\u000D"
  //     // "text": "code -g '${selectedText}'\u000D" // works but no line number
  //     // "text": "code -g '${selectedText}'\u000D" // works but no line number
  //     "text": "code -g '$1'\u000D" // does not work, vars are resolved but not capture groups?
  //   }
  // }
  
 
  if (caller === "find" || caller === "ignoreLineNumbers") replaceValue = args?.find;
  else if (caller === "replace") replaceValue = args?.replace;

  // else if (caller === "run") replaceValue = args?.run;
  else if (caller === "run")
    replaceValue = Array.isArray(args?.run) ? args?.run[0] : args?.run;
    
  // else if (caller === "cursorMoveSelect") replaceValue = args;
  else if (caller === "cursorMoveSelect") replaceValue = args.cursorMoveSelect;
  else if (caller === "snippet") replaceValue = args?.snippet;
  // else if (caller === "postCommands") replaceValue = args?.postCommands[matchIndex]?.args?.text;
  else if (caller === "postCommands") {
    if (Array.isArray(args.postCommands)) replaceValue = args?.postCommands[matchIndex]?.args?.text;
    else replaceValue = args?.postCommands?.args?.text;
    // if (Array.isArray(args.postCommands)) replaceValue = args?.postCommands[matchIndex]?.args?.lineNumber;
    // else replaceValue = args?.postCommands?.args?.lineNumber;
    
    // loop through args to find which one has a variable?
  }
  
  // need to set a flag for presence of 'await' in jsOp BEFORE any variable substitution,
  // in case some variable has "await" in it like ${selectedText}, but not part of jsOp
    
//  const jsOpRE = regexp.jsOpRE;  // this does work
  const jsOpRE = new RegExp("(?<jsOp>\\$\\$\\{([\\S\\s]*?)\\}\\$\\$)", "g"); 
 
  if (caller === "run" || caller === "replace") {
   // const re = new RegExp("(?<jsOp>\\$\\$\\{([\\S\\s]*?)\\}\\$\\$)", "g");
    
    // const matches = [...replaceValue.matchAll(re)];
    const matches = [...replaceValue.matchAll(jsOpRE)];
    let i = 0;
    
    for await (const match of matches) {
      const jsOp = match.groups.jsOp;
      if (jsOp && /\bawait\b/.test(jsOp)) jsOPerationHasAwait[i] = "true";
      else jsOPerationHasAwait[i] = "false";
      i++;
    }
  }
  
  // if jsOp replace all \w => \\w
  if (groups?.length && (caller === "replace" || caller === "run")) {
    
   // let jsOpRE = new RegExp("(?<jsOp>\\$\\$\\{([\\S\\s]*?)\\}\\$\\$)", "gm");
  //  const jsOpRE = regexp.jsOpRE;
    
    if (jsOpRE.test(args.replace) || jsOpRE.test(args.run)) {
    
      const tempIndex = groups.index;
      
      // loop through groups[1,2, etc.]      
      groups = groups.map((item, index) => {
        if (index === 0) return item;
        else return item?.replace(/(?<!\\)\\(?!\\)/g, "\\$&");  // only 1 \
      });
      
      groups.index = tempIndex;
    }
  }
    
  if (!replaceValue) return replaceValue;
  const specialVariable = new RegExp('\\$[\\{\\d]');
  if (replaceValue.search(specialVariable) === -1) return replaceValue;  // doesn't contain '${' or '$\d'

  let resolved = replaceValue;
  let re;
  let groupNames = {};
  
 // --------------------  path variables -----------------------------------------------------------
 
  re = regexp.pathGlobalRE;
  
  resolved = await utilities.replaceAsync(resolved, re, async function (match, p1, p2) {
    
    const variableToResolve = await _resolvePathVariables(match, args, caller, selection, groups, selectionStartIndex, matchIndex);
    groupNames = {
      pathCaseModifier: p1,
      path: p2
    }
    if (!groupNames.pathCaseModifier) return variableToResolve;
    else return _applyCaseModifier(groupNames, groups, variableToResolve);
  });
  // --------------------  path variables -----------------------------------------------------------
  
  
 // --------------------  snippet variables -----------------------------------------------------------
 
 re = regexp.snippetRE;
  
  resolved = await utilities.replaceAsync(resolved, re, async function (match, p1, p2) {
    const variableToResolve = await _resolveSnippetVariables(match, args, caller, selection, groups);
    groupNames = {
      pathCaseModifier: p1,
      snippetVars: p2
    }
    if (!groupNames.pathCaseModifier) return variableToResolve;
    else return _applyCaseModifier(groupNames, groups, variableToResolve);
  });
  // --------------------  snippet variables -----------------------------------------------------------
  
  
 // --------------------  extension-defined variables -------------------------------------------
 
  re = regexp.extensionGlobalRE;
  
  resolved = await utilities.replaceAsync2(resolved, re, this.resolveExtensionDefinedVariables, args, caller); 
 
  // --------------------  extension-defined variables ----------------------------------------------

  
  if (caller !== "find" && caller !== "snippet") {  // caller === "find"  caseModifier and capGroups handled in replaceFindCaptureGroups
  
   // --------------------  caseModifier/capGroup --------------------------------------------------
   
   re = regexp.capGroupCaseModifierRE;
    
    if (!resolved || resolved === '') return '';  // TODO add to all/rest
    resolved = await utilities.replaceAsync(resolved, re, await function (match, p1, p2) {

      groupNames = {
        caseModifier: p1,
        capGroup: p2
      };
      return _applyCaseModifier(groupNames, groups, "");
    });
  }
    
  // --------------------  caseModifier/capGroup --------------------------------------------------

  
  // --------------------  caseTransform ----------------------------------------------------------
  re = regexp.caseTransformRE;
 
  resolved = await utilities.replaceAsync(resolved, re, async function (match, p1, p2, p3, p4) {
    const variableToResolve = _applyCaseTransform(p3, p4, groups);
    groupNames = {
      caseModifier: p1,
      caseTransform: p2
    }
    if (!groupNames.caseModifier) return variableToResolve;
    else return _applyCaseModifier(groupNames, groups, variableToResolve);
  });
  // --------------------  caseTransform ----------------------------------------------------------

  
 // --------------------  conditional ------------------------------------------------------------
 
  // if (caller !== "snippet") {  // because you can have a conditional like '${2:else}' which is a good snippet

  // can handle one \\} within the conditional
 re = regexp.conditionalRE;
  
  resolved = await utilities.replaceAsync(resolved, re, async function (match, p1, p2, p3, p4, p5, p6) {
    const variableToResolve = _applyConditionalTransform(match, p4, p5, p6, groups);
    groupNames = {
      caseModifier: p1,
      conditional: p2
    }
    if (!groupNames.caseModifier) return variableToResolve;
    else return _applyCaseModifier(groupNames, groups, variableToResolve);
  });

  // // if a '}' in a replacement? => '\\}' must be escaped
  // // ${1:+${2}}  ?  => ${1:+`$2`} or ${1:+`$2`} note the backticks or ${1:+$1 pardner}
  //  will check for capture groups inside _applyConditionalTransform
  // --------------------  conditional -----------------------------------------------------------

  
 // --------------------  capGroupOnly ----------------------------------------------------------
 
 re = regexp.capGroupOnlyRE;
  
  resolved = await utilities.replaceAsync(resolved, re, async function (match, p1, p2, p3, offset) {
    // So can use 'replace(/.../, '$nn?')` in a jsOp and use the replace's capture group
    
    // check for a capture group '$nn?' in a replace/replaceAll replacement
    // if there is a capture group, check to see if it is the <capGroupOnly> $nn by their same index and offset
    // if true just return the match $nn? and do not replace the capture group by any group[n] match
    const replaceRE = /(?<=(?:\.replaceAll\(|\.replace\()\s*\/[^/]+\/[gmi]?\s*,\s*\\?["'`].*?)(?<capGroup>\$\d\d?).*?(?=\\?["'`]\s*\))/g;
    const found = [...resolved?.matchAll(replaceRE)];
    if (offset && found[0]?.index === offset) return match;    // also works for emptyPointSelections
          
    if (groups && p2 && (groups[p2] !== undefined)) return groups[p2];
    else if (groups && p3 && (groups[p3] !== undefined)) return groups[p3];
    else return "";     // no matching capture group
  });
  // --------------------  capGroupOnly ----------------------------------------------------------

  
  // -------------------  jsOp ------------------------------------------------------------------
  
  // can have multiple $${...}$$ in a replace
 re = new RegExp("(?<jsOp>\\$\\$\\{([\\S\\s]*?)\\}\\$\\$)", "gm");
//  re = regexp.jsOpRE;  // doesn't work although it is the same?
  
  try {
    
    resolved = await utilities.replaceAsync(resolved, re, async function (match, p1, operation) {
    
      // fix for newlines in operations, like from selectedText, etc.
      operation = operation.replaceAll(/\r\n/g, '\\r\\n').replaceAll(/(?<!\r)\n/g, '\\n');
    
      if (jsOPerationHasAwait.includes("true")) {
    
        if (/vscode\./.test(operation) && /path\./.test(operation))
          return Function('vscode', 'path', 'require', 'document', `"use strict"; (async function run (){${ operation }})()`)
            (vscode, path, require, document);
        else if (/vscode\./.test(operation))
          return Function('vscode', 'require', 'document', `"use strict"; (async function run (){${ operation }})()`)
            (vscode, require, document);
        else if (/path\./.test(operation))
          return Function('path', 'require', 'document', `"use strict"; (async function run (){${ operation }})()`)
            (path, require, document);
        else {
          Function('require', 'document', `"use strict"; return (async function run (){${ operation }})()`)
            (require, document);
        }
      }
        
      else {  // no await in the jsOp
        
        if (/vscode\./.test(operation) && /path\./.test(operation))
          return Function('vscode', 'path', 'require', 'document', `"use strict"; ${ operation }`)
            (vscode, path, require, document);
        else if (/vscode\./.test(operation))
          return Function('vscode', 'require', 'document', `"use strict"; ${ operation }`)
            (vscode, require, document);
        else if (/path\./.test(operation))
          return Function('path', 'require', 'document', `"use strict"; ${ operation }`)
            (path, require, document);
        else {
          return Function('require', 'document', `"use strict"; ${ operation }`)
            (require, document);
        }
      }
    });
  }
  
  catch (jsOPError) {  // this doesn't run async
    resolved = 'Error: jsOPError';     
    outputChannel.write(`\n${ jsOPError.stack }\n`);
    
    // below: could be in 'run' value, not 'replace'
    window.showWarningMessage("There was an error in the `$${<operations>}$$`.  See the Output channel: `find-and-transform` for more.")
    
    throw new Error(jsOPError.stack);
  }
  // -------------------  jsOp ------------------------------------------------------------------
  
  // if still have a '${` or `$n` re-resolve
  // if (!error && caller !== "snippet" && resolved.search(/\$[\{\d]/) !== -1) {  // could this be replaced with a while loop up top?
  //   args.replace = resolved;
  //   resolved = this.resolveVariables(args, "replace");
  // }
  // return resolved;
  
  return resolved?.replace(/\\}/g, '}');  // mainly for conditionals like ${1:+${POW\\}}
};


/**
 * Wrap or escape the findValue if matchWholeWord or not a regexp.
 * @param {string} findValue 
 * @param {string} replaceValue 
 * @param {boolean} isRegex 
 * @param {boolean} matchWholeWord 
 * @param {boolean} ignoreWhiteSpace  * 
 * @param {boolean} madeFind 
 * 
 * @returns {Promise<object>} { findValue,  isRegex }
 */
exports.adjustValueForRegex = async function (findValue, replaceValue, isRegex, matchWholeWord, ignoreWhiteSpace, madeFind) {

  if (findValue === "") return { findValue, isRegex };
	if (matchWholeWord) findValue = findValue?.replace(/\\b/g, "@%@");
  
  // when there is a capture group in a replace && isRegex = false
  // then do want to treat as text (so escape regex characters) and set regex to true
  
  if (!isRegex && replaceValue) {
    const re = /\$(\d+)/g;
    const capGroups = [...replaceValue?.matchAll(re)];
    
    if (capGroups.length) {
  
      if (!ignoreWhiteSpace) findValue = findValue?.replace(/([+?$^.\\*\{\}\[\]\(\)])/g, "\\$1");
      findValue = `(${ findValue })`;
      isRegex = true;
    }
  }

	if (!isRegex && madeFind) findValue = findValue?.replace(/([+?$^.\\*\{\}\[\]\(\)])/g, "\\$1");
  else if (!isRegex) findValue = findValue?.replace(/([+?^.\\*\[\]\(\)]|\$(?!{line(Number|Index)})|\{(?!line(Number|Index)})|(?<!\$\{lineNumber)(?<!\$\{lineIndex)\})/g, "\\$1");
  
	if (matchWholeWord) findValue = findValue?.replace(/@%@/g, "\\b");
  if (matchWholeWord && !madeFind) findValue = `\\b${ findValue }\\b`;
  if (matchWholeWord && !madeFind) findValue = findValue?.replace(/(\\b)+/g, "\\b");
  if (matchWholeWord && !madeFind) findValue = findValue?.replace(/(?<!\\b)(\|)(?!\\b)/g, "\\b$1\\b");

  // since all \n are replaced by \r?\n by vscode - except in [\n] ?
  
  // (?<!\[[^\]]*)(\\(\\)*n)(?![^\[]\[[^\]]*\]) - \n not in a []
  // (?<=\[[^\]]*?)(\\(\\)*n)(?=[^\[]*?\]) - \n in a []
  
  // (?<=\[[^\]]*?)(?<!(\\r|\r)\??)(\\n|\n)(?=[^\[]*?\]) - \n in a [] not preceded by \r?
  // (?<!\[[^\]]*?)(?<!(\\r|\r)\??)(\\n|\n)(?![^\[]*?\]) - \n not in a [] and not preceded by \r?
  
  if (window.activeTextEditor.document.eol === vscode.EndOfLine.CRLF) {

    // \n not in a [] and not preceded by \r?
    if (isRegex && !ignoreWhiteSpace) findValue = findValue?.replaceAll(/(?<!\[[^\]]*?)(?<!(\\r|\r)\??)(\\n|\n)(?![^\[]*?\])/g, "\r?\n");
    
    // \n in a [] not preceded by \r?
    if (isRegex && !ignoreWhiteSpace) findValue = findValue?.replaceAll(/(?<=\[[^\]]*?)(?<!(\\r|\r)\??)(\\n|\n)(?=[^\[]*?\])/g, "\r\n");
  }
  
  if (isRegex && window.activeTextEditor.document.eol === vscode.EndOfLine.CRLF) {
    if (findValue === "^") findValue = "^(?!\n)";
    else if (findValue === "$") findValue = "$(?!\n)";
  }
  
  // find a blank line: '^$' => '^(?!\n)$(?!\n)'
  // two blank lines, use '(^$)\n(^$)'  // works
  
  // works in a more complex regex, like 'howdy\\n^$\\nthere' => with a blank line between
  if (window.activeTextEditor.document.eol === vscode.EndOfLine.CRLF)
    if (isRegex) findValue = findValue?.replaceAll(/\^\$/g, "^(?!\n)$(?!\n)");  // is this necessary? Yes
  
  return {
    findValue,
    isRegex
  };
}

/**
 * Wrap or escape the findValue if matchWholeWord or not a regexp.
 * @param {string} cursorMoveSelect 
 * @param {boolean} isRegex 
 * @param {boolean} matchWholeWord 
 * @returns {Promise<string>} findValue escaped or wrapped
 */
exports.adjustCMSValueForRegex = async function (cursorMoveSelect, isRegex, matchWholeWord) {
  
  if (!cursorMoveSelect) return "";

  const lineEndOrStart = cursorMoveSelect?.search(/^[\^\$]$/m) !== -1;
  const containsOr         = cursorMoveSelect?.includes("|");
  const containsBoundary   = cursorMoveSelect?.includes("\\b");
  
  if (!isRegex) cursorMoveSelect = cursorMoveSelect?.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
  
  cursorMoveSelect = cursorMoveSelect?.replace(/\|+/g, "\|");
  
  // don't do below if cursorMoveSelect is only ^ or $
  if (!lineEndOrStart) {
    cursorMoveSelect = cursorMoveSelect?.replace(/(\\b)+/g, "\\b");  //  get rid of duplicate \\b\\b+
    
    if (containsOr && containsBoundary) {   // where there might be no value for a capture group
      cursorMoveSelect = cursorMoveSelect?.replace(/(?<!\\)(\()\\b\|(\\b\|)*/g, "$1");  // "cursorMoveSelect": "(\\b$1\\b|$2|$3)"
      cursorMoveSelect = cursorMoveSelect?.replace(/\|\\b(?=\|)|\|\\b(\))/g, "$1");
      cursorMoveSelect = cursorMoveSelect?.replace(/^(\\b?\|+)+|(\|\\b)+$/gm, "");
      cursorMoveSelect = cursorMoveSelect?.replace(/(?<=\()\\b(?=\))|^\\b$/gm, "");  // (\\b) or \\b
    }

    if (containsOr) { 
      cursorMoveSelect = cursorMoveSelect?.replace(/(?<!\\)(\()\||\|(?!\\)(\))/g, "$1$2");  // "cursorMoveSelect": "($1|$2|$3)"
      cursorMoveSelect = cursorMoveSelect?.replace(/^\|+|\|+$|\|(?=\|)|(?<=\()\|(?=\))/gm, "");  // "cursorMoveSelect": "$1|$2|$3",
    }
    
    if (cursorMoveSelect === '()' || cursorMoveSelect === '') return "";
    
    if (matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;  // wrap with \\b
    
    if (matchWholeWord && containsOr)
      cursorMoveSelect = cursorMoveSelect?.replace(/(?<!\\b)(\|)(?!\\b)/g, "\\b$1\\b");// ($1|$2) => (\\b$1\\b|\\b$2\\b)
    
    cursorMoveSelect = cursorMoveSelect?.replace(/(\\b)+/g, "\\b");  //  get rid of duplicate \\b\\b+
    
    if (isRegex) cursorMoveSelect = cursorMoveSelect?.replace(/(?<!\r)\n/g, "\r\n");
  }
  
  if (isRegex && lineEndOrStart) {
    // otherwise the \r\n at the end of a line 
    if (cursorMoveSelect === "^") cursorMoveSelect = "^(?!\n)";
    else if (cursorMoveSelect === "$") cursorMoveSelect = "$(?!\n)";
  }
  
  return cursorMoveSelect;
}

/**
 * 
 * @param {string} findValue 
 * @returns {Promise<string>}
 */
exports.replaceFindCaptureGroups = async function (findValue) {
  
  const selections = window.activeTextEditor?.selections;
  const document = window.activeTextEditor?.document;
  
  findValue = findValue?.replace(/(\\[UuLl])?\\\$(\d+)/g, (match, p1, p2) => {
    
    // if no selection[n] in document, but in findValue
    if (p2 > selections?.length) return "";
    
    // if selection.isEmpty get wordRangeAtCursor
    else if (selections[p2 - 1]?.isEmpty) {
      const pos = selections[p2 - 1].active;
      const range = document.getWordRangeAtPosition(pos);
      return _modifyCaseOfFindCaptureGroup(p1, document.getText(range));
    }
    // wrap each $n in a group () ?
    // else return `(${_modifyCaseOfFindCaptureGroup(p1, document.getText(selections[p2 - 1]))})`;
    else return _modifyCaseOfFindCaptureGroup(p1, document.getText(selections[p2 - 1]));
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
      resolvedCaptureGroup = resolvedCaptureGroup?.toLocaleUpperCase();
      break;

    case "\\u":
      resolvedCaptureGroup = resolvedCaptureGroup[0]?.toLocaleUpperCase() + resolvedCaptureGroup?.substring(1);
      break;

    case "\\L":
      resolvedCaptureGroup = resolvedCaptureGroup?.toLocaleLowerCase();
      break;

    case "\\l":
      resolvedCaptureGroup = resolvedCaptureGroup[0]?.toLocaleLowerCase() + resolvedCaptureGroup?.substring(1);
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
 * @returns {Promise<string>} - the resolved path variable
 */
async function _resolveExtensionDefinedVariables (variableToResolve, args, caller) {
  
  const document = window.activeTextEditor?.document;
  
  if (typeof variableToResolve !== 'string') return variableToResolve;
  
  let resolved = variableToResolve;
  
  let testLineRE = /\$\{getTextLines:\(\s*(?<lineNumberOP>\d+(\s*[-+%*\/]?\s*\d+)?\s*)\)\}|\$\{getTextLines:\s*(?<lineNumberOnly>[-+]?\d+)\s*\}/;
  let lineTextMatch = variableToResolve?.match(testLineRE);
   
  if (lineTextMatch?.groups?.lineNumberOP) {      // '(23-1)'
    // if eval is a negative number => wrap
    const lineNumber = eval(lineTextMatch?.groups?.lineNumberOP);
    if (lineNumber >= 0) resolved = document.lineAt(lineNumber).text;
    else resolved = document.lineAt(document.lineCount + lineNumber).text;
  }
  else if (lineTextMatch?.groups?.lineNumberOnly) {      // '22'
    if (Number(lineTextMatch?.groups?.lineNumberOnly) >= 0)
      resolved = document?.lineAt(Number(lineTextMatch?.groups?.lineNumberOnly)).text;
    else 
      resolved = document?.lineAt(document.lineCount + Number(lineTextMatch?.groups?.lineNumberOnly)).text;
  }
    
  else {
    testLineRE = /\$\{getTextLines:(?<From>\d+)-(?<To>\d+)\}/;
    lineTextMatch = variableToResolve.match(testLineRE);
    if (lineTextMatch?.groups) {
      const lastChar = document?.lineAt(Number(lineTextMatch.groups.To)).range.end.character;
      resolved = document?.getText(new Range(Number(lineTextMatch.groups.From), 0, Number(lineTextMatch.groups.To), lastChar));
    }
    else {
      testLineRE = /\$\{getTextLines:(?<startL>\d+),(?<startCh>\d+),(?<endL>\d+),(?<endCh>\d+)\}/;
      lineTextMatch = variableToResolve?.match(testLineRE);
      if (lineTextMatch?.groups)
        resolved = document.getText(new Range(Number(lineTextMatch.groups.startL), Number(lineTextMatch.groups.startCh),
          Number(lineTextMatch.groups.endL), Number(lineTextMatch.groups.endCh)));
    }
  }

  if (!lineTextMatch?.groups) {

    const namedGroups = resolved?.match(regexp.pathCaseModifierRE)?.groups;

    switch (namedGroups.vars) {
    
      case "${getDocumentText}": case "${ getDocumentText }":
        resolved = document?.getText();
        break;
  
      case "${resultsFiles}": case "${ resultsFiles }":
        resolved = await utilities.getSearchResultsFiles(args.clipText);
        // resolved = args?.resultsFiles;
        break;
        
        // ${getFindInput} is deprecated in favor of ${getInput}
      case "${getFindInput}": case "${ getFindInput }": case "${getInput}": case "${ getInput }":
        // "ignoreLineNumbers" or "replace"
        const input = await utilities.getInput(caller);
        
        if (input || input === '')  // accept inputBox with nothing in it = ''
          resolved = input;
        else {
          resolved = '';
        }
        break;
  
      default:
        break;
    }
  }

 // removing as seems unecessary
   // escape .*{}[]?^$ if using in a find or findSearch
  // if (!args.isRegex && (caller === "find" || caller === "findSearch")) return resolved?.replaceAll(regexp.escapeRegExCharacters, "\\$1");
 
  // if (!args.isRegex && caller === "find") return resolved?.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
  // else if (!args.isRegex && caller === "findSearch") return resolved?.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");

  // else if (caller === "filesToInclude" && resolved === ".") return  "./";
  if (caller === "filesToInclude" && resolved === ".") return  "./";
  
  else return resolved;
};

/**
 * Resolve the matchIndex/Number variable.
 * 
 * @param {string} variableToResolve 
 * @param {number} replaceIndex  - for a find/replace/filesToInclude value?
 * @returns {Promise<string>} - resolvedVariable with matchIndex/Number replaced
 */
exports.resolveMatchVariable = async function (variableToResolve, replaceIndex) {
  
  if (typeof variableToResolve !== 'string') return variableToResolve;

  variableToResolve = variableToResolve?.replaceAll(/\$\{\s*matchIndex\s*\}/g, String(replaceIndex));
  variableToResolve = variableToResolve?.replaceAll(/\$\{\s*matchNumber\s*\}/g, String(replaceIndex + 1));

  return variableToResolve;
}


/**
 * Resolve thelineIndex/Number variable.
 * 
 * @param {string} variableToResolve 
 * @param {number} index  - match.index
 * @returns {Promise<string>} - resolvedVariable with matchIndex/Number replaced
 */
exports.resolveLineVariable = async function (variableToResolve, index) {

  const document = window.activeTextEditor?.document;
  
  if (typeof variableToResolve !== 'string') return variableToResolve;

  const line = document?.positionAt(index).line;

  variableToResolve = variableToResolve?.replaceAll(/\$\{\s*lineIndex\s*\}/g, String(line));
  variableToResolve = variableToResolve?.replaceAll(/\$\{\s*lineNumber\s*\}/g, String(line + 1));
  return variableToResolve;
}


/**
 * If the "filesToInclude/find/replace" entry uses a path variable(s) return the resolved value  
 * 
 * @param {string} variableToResolve - the "filesToInclude/find/replace" value 
 * @param {Object} args -  keybinding/settings args
 * @param {string} caller - if called from a find.parseVariables() or replace or filesToInclude 
 * @param {import("vscode").Selection} selection - current selection
 * @param {Object} match - the current match
 * @param {number} selectionStartIndex - in the start index of this selection
 * @param {number} matchIndex - which match is it
 * 
 * @returns {Promise<string>} - the resolved path variable
 */
async function _resolvePathVariables (variableToResolve, args, caller, selection, match, selectionStartIndex, matchIndex) {

  const document = window.activeTextEditor?.document;
  
  if (typeof variableToResolve !== 'string') return variableToResolve;

  selectionStartIndex = selectionStartIndex ?? 0;
	const filePath = document.uri.path;

	let relativePath;
	if ((caller === "filesToInclude" || caller === "filesToExclude") && workspace.workspaceFolders.length > 1) {
		relativePath = workspace?.asRelativePath(document.uri, true);
		relativePath = `./${ relativePath }`;
	}
	else relativePath = workspace?.asRelativePath(document.uri, false);

  let resolved = variableToResolve;

 
  const namedGroups = resolved?.match(regexp.pathCaseModifierRE)?.groups;

  switch (namedGroups?.vars) {

    case "${file}":  case "${ file }":
      if (os.type() === "Windows_NT") resolved = filePath?.substring(4);
      else resolved = filePath;
      break;

    case "${relativeFile}":	 case "${ relativeFile }":
      resolved = workspace?.asRelativePath(document.uri, false);
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
      resolved = workspace?.getWorkspaceFolder(document.uri).uri.path;
      break;
     
    case "${workspaceFolder}": case "${ workspaceFolder }":
      resolved = workspace?.getWorkspaceFolder(document.uri).uri.path;
      break;

    case "${relativeFileDirname}": case "${ relativeFileDirname }":
      resolved = path.dirname(workspace?.asRelativePath(document.uri, false));
      // https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options :  
      // '.' or './' does nothing in the "files to exclude" input for some reason
      if (caller === "filesToExclude" && resolved === ".")
        resolved = "**";
      break;

    case "${workspaceFolderBasename}":  case "${ workspaceFolderBasename }":
      resolved = path.basename(workspace?.getWorkspaceFolder(document.uri).uri.path);
       break;
     
    case "${selectedText}": case "${ selectedText }":
      if (!selection) selection = window.activeTextEditor.selection;
      
      if (selection.isEmpty) {
        const wordRange = document?.getWordRangeAtPosition(selection.start);
        if (wordRange) resolved = document?.getText(wordRange);
        else resolved = '';
      }
      else resolved = document?.getText(selection);
      break;
     
    case "${pathSeparator}": case "${ pathSeparator }": case "${\/}": case "${ \/ }":
      resolved = path.sep;
      break;
     
    case "${matchIndex}": case "${ matchIndex }":
      resolved = String(matchIndex);
      break;
     
    case "${matchNumber}": case "${ matchNumber }":
      resolved = String(matchIndex + 1);
      break;
       
     case "${lineIndex}": case "${ lineIndex }":    // 0-based
       if (caller === "cursorMoveSelect" && args.restrictFind !== "document") resolved = String(match);
       else if (caller === "cursorMoveSelect" && args.restrictFind === "document") resolved = resolved;

       else if (caller !== "ignoreLineNumbers") {
      //  else if (caller !== "ignoreLineadasdbers") {
         if (args.restrictFind === "selections") {
           const line = document?.positionAt(match?.index + selectionStartIndex).line;
           resolved = String(line);
         }
         else if (args.restrictFind?.startsWith("next") || args.restrictFind?.startsWith("previous")) {
           resolved = String(document?.positionAt(selectionStartIndex).line); //  works for wholeDocument
         }
         else if (args.restrictFind === "document") resolved = String(document?.positionAt(match.index).line);
         else resolved = String(selection?.active?.line); // line/once/onceFromStart/onceFromCursor find/replace
       }
       // "ignoreLineNumbers" will pass through unresolved
      break;
    
    case "${columnNumber}": case "${ columnNumber }":   // 1-based
      // resolved = String(window.activeTextEditor.selection?.active?.character);
      resolved = String(selection?.active?.character);
      break;

    case "${lineNumber}":  case "${ lineNumber }":   // 1-based
      if (caller === "cursorMoveSelect" && args.restrictFind !== "document") resolved = String(match + 1);
      else if (caller === "cursorMoveSelect" && args.restrictFind === "document") resolved = resolved;

      else if (caller !== "ignoreLineNumbers") {
        if (args.restrictFind === "selections") {
          const line = document?.positionAt(match?.index + selectionStartIndex).line;
          resolved = String(line + 1);
        }
        else if (args.restrictFind?.startsWith("next") || args.restrictFind?.startsWith("previous")) {
          resolved = String(document?.positionAt(selectionStartIndex).line + 1); //  works for wholeDocument
        }
        else if (args.restrictFind === "document") resolved = String(document?.positionAt(match?.index).line + 1); //  works for wholeDocument
        else resolved = String(selection?.active?.line + 1); // line/once/onceFromStart/onceFromCursor find/replace
      }
      // "ignoreLineNumbers" will pass through unresolved
      break;

    case "${CLIPBOARD}": case "${ CLIPBOARD }":
      resolved = await env.clipboard.readText();    // need to make function async
      break;

    default:
      break;
   }

  // removed, see above
  // escape .*{}[]?^$+()| if using in a find
  //  if (!args.isRegex && (caller === "find" || caller === "findSearch")) return resolved?.replaceAll(regexp.escapeRegExCharacters, "\\$1");
 
    // in case use "let re = /${selectedText}/" and selectedText, etc. has a / in it, then must escape it
  // else if (caller === "replace") {
  if (caller === "replace") {
    const re = /\$\{[^}]*\}/m;
    // if args.replace is only a variable ${...} do nothing
    if (args.replace.match(re)) return resolved;
    else return resolved?.replaceAll(/([\\/])/g, "\\$1");
  }
    
  else if (caller === "filesToInclude" && resolved === ".") return  "./";
  
  else return resolved;
};


/**
 * If the "filesToInclude/find/replace" entry uses a path variable(s) return the resolved value  
 * 
 * @param {string} variableToResolve - the "filesToInclude/find/replace" value 
 * @param {Object} args -  keybinding/settings args
 * @param {string} caller - if called from a find.parseVariables() or replace or filesToInclude 
 * @param {import("vscode").Selection} selection - current selection
 * @param {Object} groups - the current match

 * @returns {Promise<string>} - the resolved path variable
 */
// function _resolveSnippetVariables (variableToResolve, args, caller, selection, groups) {
async function _resolveSnippetVariables (variableToResolve, args, caller, selection, groups) {

  const document = window.activeTextEditor?.document;
  let comments;
  
  if (typeof variableToResolve !== 'string') return variableToResolve;

  const _date = new Date();

  let resolved = variableToResolve;

  const namedGroups = resolved?.match(regexp.pathCaseModifierRE)?.groups;

  switch (namedGroups?.vars) {
     
    case "$TM_CURRENT_LINE": case "${TM_CURRENT_LINE}":
      let textLine = "";
      const selectionOffset = document?.offsetAt(selection.active);
      // what is groups doing here?  replace in selections?
      // if (caller === 'replace' && groups  && (args.restrictFind !== 'line')) {     // caller === replace
      //   textLine = document.lineAt(document.positionAt(selectionOffset + groups?.index).line).text;
      // }
      // else {                                    // caller === find/ignoreLineNumbers/cursorMoveSelect
      //   textLine = document.lineAt(document.positionAt(selectionOffset).line).text;
      // }
      // resolved = textLine;
      resolved = document?.lineAt(document?.positionAt(selectionOffset).line).text;
    break; 

    case "$TM_CURRENT_WORD": case "${TM_CURRENT_WORD}":
      const wordRange = document?.getWordRangeAtPosition(selection?.active);
      if (wordRange) resolved = document?.getText(wordRange);
      else resolved = "";
      break;
     
    case "$CURRENT_YEAR": case "${CURRENT_YEAR}":
      resolved = String(_date?.getFullYear());
      break;
     
    case "$CURRENT_YEAR_SHORT": case "${CURRENT_YEAR_SHORT}":
      resolved = String(_date?.getFullYear()).slice(-2);
      break;
     
    case "$CURRENT_MONTH": case "${CURRENT_MONTH}":
      resolved = String(_date?.getMonth().valueOf() + 1).padStart(2, '0');
      break;
     
    case "$CURRENT_MONTH_NAME": case "${CURRENT_MONTH_NAME}":
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      resolved = monthNames[_date?.getMonth()];
      break;
     
    case "$CURRENT_MONTH_NAME_SHORT": case "${CURRENT_MONTH_NAME_SHORT}":
      const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      resolved = monthNamesShort[_date?.getMonth()];
      break;
     
    case "$CURRENT_DATE": case "${CURRENT_DATE}":
      resolved = String(_date?.getDate()?.valueOf()).padStart(2, '0');
      break;
     
    case "$CURRENT_DAY_NAME": case "${CURRENT_DAY_NAME}":
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      resolved = dayNames[_date?.getDay()];
      break;
     
    case "$CURRENT_DAY_NAME_SHORT": case "${CURRENT_DAY_NAME_SHORT}":
      const dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      resolved = dayNamesShort[_date?.getDay()];
      break;
     
    case "$CURRENT_HOUR": case "${CURRENT_HOUR}":
      resolved = String(_date?.getHours()?.valueOf()).padStart(2, '0');
      break;
     
    case "$CURRENT_MINUTE": case "${CURRENT_MINUTE}":
      resolved = String(_date?.getMinutes()?.valueOf()).padStart(2, '0');
      break;
     
    case "$CURRENT_SECOND": case "${CURRENT_SECOND}": case "${ CURRENT_SECOND }":
      resolved = String(_date?.getSeconds()?.valueOf()).padStart(2, '0');
      break;
     
    case "$CURRENT_SECONDS_UNIX": case "${CURRENT_SECONDS_UNIX}": case "${ CURRENT_SECONDS_UNIX }":
      resolved = String(Math.floor(_date?.getTime() / 1000));
      break;
      
    // This code is thanks to https://github.com/microsoft/vscode/pull/170518 and @MonadChains
    // https://github.com/MonadChains
    case "$CURRENT_TIMEZONE_OFFSET": case "${CURRENT_TIMEZONE_OFFSET}": case "${ CURRENT_TIMEZONE_OFFSET }":
      const currentDate = new Date();
      const rawTimeOffset = currentDate.getTimezoneOffset();
      // const sign = rawTimeOffset < 0 ? '-' : '+';
      const sign = rawTimeOffset > 0 ? '-' : '+';
      const hours = Math.trunc(Math.abs(rawTimeOffset / 60));
      const hoursString = (hours < 10 ? '0' + hours : hours);
      const minutes = Math.abs(rawTimeOffset) - hours * 60;
      const minutesString = (minutes < 10 ? '0' + minutes : minutes);
      resolved = sign + hoursString + ':' + minutesString;    
      break;
     
    case "$RANDOM": case "${RANDOM}": case "${ RANDOM }":
      resolved = Math.random().toString().slice(-6);
      break;
     
    case "$RANDOM_HEX": case "${RANDOM_HEX}": case "${ RANDOM_HEX }":
      resolved = Math.random().toString(16).slice(-6);
      break;
     
    case "$BLOCK_COMMENT_START": case "${BLOCK_COMMENT_START}": case "${ BLOCK_COMMENT_START }":
      // blockCommentConfig = args.currentLanguageConfig?.blockComment;
      // resolved = blockCommentConfig ? blockCommentConfig[0] : "";
      
      if (!comments) comments = await utilities.getlanguageConfigComments(args);
      resolved = comments?.blockComment[0] ?? "";  
      break;
     
    case "$BLOCK_COMMENT_END": case "${BLOCK_COMMENT_END}": case "${ BLOCK_COMMENT_END }":
      // blockCommentConfig = args.currentLanguageConfig?.blockComment;
      // resolved = blockCommentConfig ? blockCommentConfig[1] : "";
      
      if (!comments) comments = await utilities.getlanguageConfigComments(args);
      resolved = comments?.blockComment[1] ?? "";  
      break;
     
    case "$LINE_COMMENT": case "${LINE_COMMENT}": case "${ LINE_COMMENT }":
      // resolved = args.currentLanguageConfig?.lineComment ?? "";
      
      if (!comments) comments = await utilities.getlanguageConfigComments(args);
      resolved = comments?.lineComment ?? "";      
      break;
     
    default:
      break;
   }

 // removed, see above for old code
 // escape .*{}[]?^$ if using in a find or findSearch
//  if (!args.isRegex && (caller === "find" || caller === "findSearch")) return resolved?.replaceAll(regexp.escapeRegExCharacters, "\\$1");

  // else if (caller === "filesToInclude" && resolved === ".") return  "./";
  if (caller === "filesToInclude" && resolved === ".") return  "./";
  
  else return resolved;
};

/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {string} replaceValue
 * @param {Object} args - keybinding/setting args
 * @param {string} caller - find/replace/cursorMoveSelect
 * 
 * @returns {Promise<string>} - the resolved string
 */
 exports.resolveExtensionDefinedVariables = async function (replaceValue, args, caller) {

  if (replaceValue === "") return replaceValue;
  
  let resolved = replaceValue;
  
  let re = regexp.extensionNotGlobalRE;

  // if (replaceValue !== null && !searchCaller) {
  if (replaceValue !== null) {
   
   let resolved = await _resolveExtensionDefinedVariables(replaceValue, args, caller);
   const found = replaceValue.match(re);
   
   if (!found.groups.caseModifier) return resolved;
   else return _applyCaseModifier(found.groups, undefined, resolved);
  }
}

/**
 * Build the replaceString by updating the setting 'replaceValue' to
 * account for case modifiers, capture groups and conditionals
 *
 * @param {string} replaceValue
 * @param {Object} args - keybinding/setting args
 * @param {string} caller - find/replace/cursorMoveSelect
 * @param {import("vscode").Selection} selection - the current selection
 * 
 * @returns {Promise<string>} - the resolved string
 */
exports.resolveSearchPathVariables = async function (replaceValue, args, caller, selection) {

  if (replaceValue === "") return replaceValue;

  let identifiers;
  let re;

  if (replaceValue !== null) {

   re = regexp.pathGlobalRE;
   identifiers = [...replaceValue?.matchAll(re)];
  }

  if (!identifiers.length) return replaceValue;

  for (const identifier of identifiers) {

    let resolved = "";

    if (identifier?.groups?.path) {
      resolved = await _resolvePathVariables(identifier.groups.path, args, caller, selection, null, null, null);
      if (identifier.groups.pathCaseModifier)
        resolved = _applyCaseModifier(identifier.groups, identifiers, resolved);
    }

    replaceValue = replaceValue?.replace(identifier[0], resolved);
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
 * @param {import("vscode").Selection} selection - the current selection
 * 
 * @returns {Promise<string>} - the resolved string
 */
 exports.resolveSearchSnippetVariables = async function (replaceValue, args, caller, selection) {

  if (replaceValue === "") return replaceValue;

  let vars;
  let re;
  // let resolved;
  let resolved = replaceValue;

  if (replaceValue !== null) {

   re = regexp.snippetRE;
    
    resolved = await utilities.replaceAsync(resolved, re, async function (match, p1, p2, offset, string, namedGroups) {
      // const variableToResolve =  _resolveSnippetVariables(match, args, caller, selection, undefined);
      const variableToResolve =  await _resolveSnippetVariables(match, args, caller, selection, undefined);
      return _applyCaseModifier(namedGroups, undefined, variableToResolve);
    });
  };
  return resolved;
}


/**
 * Apply case modifier, like '\\U' to capture groups $1, etc..
 * @param {Object} namedGroups
 * @param {Object} groups
 * @param {string} resolvedPathVariable
 * @returns {string} - case-modified text
 */
function _applyCaseModifier(namedGroups, groups, resolvedPathVariable) {

  let resolved = resolvedPathVariable;
  
  if (namedGroups?.path && namedGroups?.path.search(/\$\{\s*(line|match)(Index|Number)\s*\}/) !== -1) {
    return resolvedPathVariable;
  }
  
  if (namedGroups?.caseModifier) {
    if (namedGroups?.capGroup) {
      const thisCapGroup = namedGroups.capGroup.replace(/[${}]/g, "");
      if (groups[thisCapGroup]) resolved = groups[thisCapGroup];
    }
    else if (namedGroups?.caseTransform || namedGroups.conditional || namedGroups.extensionVars) { } // do nothing, resolved already = resolvedPathVariable
    else return "";
  }
  else if (namedGroups?.pathCaseModifier) {
    resolved = resolvedPathVariable;
  }
  
  switch (namedGroups?.caseModifier || namedGroups?.pathCaseModifier || namedGroups) {
  
    case "\\U":
      resolved = resolved?.toLocaleUpperCase();
      break;

    case "\\u":
      resolved = resolved[0]?.toLocaleUpperCase() + resolved?.substring(1);
      break;

    case "\\L":
      resolved = resolved?.toLocaleLowerCase();
      break;

    case "\\l":
      resolved = resolved[0]?.toLocaleLowerCase() + resolved?.substring(1);
      break;

    default:
      break;
  }
  return resolved;
}


/**
 * Apply case transform, like '${1:/upcase}' to text.
 * @param   {string} p2 - capture group 2
 * @param   {string} p3 - capture group 3
 * @param   {Object} groups
 * @returns {string} - modified text
 */
function _applyCaseTransform(p2, p3, groups) {
  
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
    
    case "snakecase":     // firstSecondThird => first_second_third
      resolved = utilities.toSnakeCase(resolved);
      break;
  }
  
  return resolved;
}


/**
 * Apply conditional transform, like '${1:+ add text }' to text.
 * 
 * @param   {string} match 
 * @param   {string} p2 - capture group 2
 * @param   {string} p3 - capture group 3
 * @param   {string} p4 - capture group 4
 * @param   {Object} groups
 * @returns {string} - modified text
 */
function _applyConditionalTransform(match, p2, p3, p4, groups) {
  
  let resolved = match;

  switch (p3) {

    case "+":                        // if ${1:+yes}
      if (groups && (groups[p2] !== undefined)) {
        resolved = _checkForCaptureGroupsInConditionalReplacement(p4, groups);
      }
      // "if" but no matching capture group, do nothing
      else resolved = "";
      break;

    case "-":                       // else ${1:-no} or ${1:no}
    case "":
      // if (groups && !groups[p2]) {
      if (groups && groups[p2] === undefined) {
        resolved = _checkForCaptureGroupsInConditionalReplacement(p4, groups);
      }
      // "else" there is a matching capture group, do nothing
      else resolved = "";
      break;

    case "?":                        // if/else ${1:?yes:no}
      const replacers = p4?.split(":");

      if (groups && (groups[p2] !== undefined)) {
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
  const capGroups = [...replacement?.matchAll(re)];

  for (let i = 0; i < capGroups.length; i++) {
    if (capGroups[i].groups.ticks) {
      replacement = replacement?.replace(capGroups[i][0], groups[capGroups[i][2]] ?? "");
    }
  }
  return replacement;
}


/**
 * When no 'find' key in command: make a find value for use as a regexp
 * from all selected words or words at cursor positions wrapped by word boundaries \b
 *
 * @param   {readonly vscode.Selection[]} selections
 * @param   {Object} args
 * @returns {Promise<Object>} - { selected text '(a|b c|d)', mustBeRegex b/c Set.size > 1 }
 */
exports.makeFind = async function (selections, args) {
  
  // should respect "restrictFind": "line/onceFromStart/onceFromCursor" for example, make find only from selections in that line
  // would have to call makeFind per line

  const document = window.activeTextEditor?.document;
  
  let selectedText = "";
  let textSet = new Set();
  let find = "";
  let mustBeRegex = false;
  let emptyPointSelections = new Set();

  // only use the first selection for these options: nextSelect/nextMoveCursor/nextDontMoveCursor
  if (args?.restrictFind?.startsWith("next") || args?.restrictFind?.startsWith("previous")) {
    selections = [selections[0]];
  }

  for await (const selection of selections) {

    if (selection.isEmpty) {
      
      const emptyLine = await utilities.isEmptySelectionOnOwnLine(selection);

      // so a cursor at the start of an empty line will find all empty lines
      if (emptyLine) {
        // selectedText = '^(?!\n)$(?!\n)';  // the original re
        selectedText = '^$';  // this is sufficient, but not in adjustValueForRegex()
        mustBeRegex = true;
      }
      else {
        const wordRange = document.getWordRangeAtPosition(selection.start);  // undefined if no word at cursor
        if (wordRange) selectedText = document.getText(wordRange);
        else emptyPointSelections.add(selection);
      }
    }
    else {
      selectedText = document.getText(selection);
    }
    if ( selectedText.length ) textSet.add(selectedText);
  };

  for (let item of textSet) {
    // how to deal with multiple finds/ignoreWhiteSpace's (an array)
    if (args.ignoreWhiteSpace && args.ignoreWhiteSpace[0]) item = item.trim();
    find += `${ item }|`;
  } // Sets are unique, so this de-duplicates any selected text
  
  find = find?.substring(0, find.length - 1);  // remove the trailing '|'

  // if .size of the set is greater than 1 then isRegex must be true
  if (textSet?.size > 1) mustBeRegex = true;
  
  if ((mustBeRegex || args.isRegex) && find.length) find = `(${ find })`;  // e.g. "(word|some words|more)"
  
  return { find, mustBeRegex, emptyPointSelections };
};