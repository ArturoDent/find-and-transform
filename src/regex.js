const variables = require('./variables');


// The case modifiers below accept one OR two backslashes ('\U' and '\\U'). A value in
// keybindings.json/settings.json is JSON-parsed on the way in, so a written "\\U" has
// already been collapsed to '\U' by the time it gets here - but a .js script file is
// read as raw text, so a '\\U' written there really does arrive with both backslashes.
// Matching only one left the extra backslash behind, stranded in the script's generated
// source, where JS then read it as an escape: harmless before an uppercase letter
// (dropped), but silently turning into a newline/tab before 'n'/'t', or throwing
// "Invalid Unicode escape sequence" before a 'u'. Accepting both spellings avoids that.
// See _normalizeCaseModifier() in resolveVariables.js, which collapses the captured
// modifier back to one backslash before it is compared.
let vars = variables.getPathVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
exports.pathGlobalRE = new RegExp(`(?<pathCaseModifier>\\\\{1,2}[UuLl])?(?<path>${ vars })`, 'g');

// in exports.resolveSearchPathVariables
// let vars = variables.getPathVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
exports.pathNotGlobalRE = `(?<pathCaseModifier>\\\\{1,2}[UuLl])?(?<path>${ vars })`;

vars = variables.getSnippetVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
exports.snippetRE = new RegExp(`(?<pathCaseModifier>\\\\{1,2}[UuLl])?(?<snippetVars>${ vars })`, 'g');

vars = variables.getExtensionDefinedVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
exports.extensionGlobalRE = new RegExp(`(?<caseModifier>\\\\{1,2}[UuLl])?(?<extensionVars>${ vars })`, 'g');
exports.extensionNotGlobalRE = new RegExp(`(?<caseModifier>\\\\{1,2}[UuLl])?(?<extensionVars>${ vars })`);

exports.capGroupCaseModifierRE = new RegExp("(?<caseModifier>\\\\{1,2}[UuLl])(?<capGroup>\\$\\{\\d(?!:)\\}|\\$\\d)", "g");
exports.capGroupOnlyRE = new RegExp("(?<capGroupOnly>(?<!\\$)\\$\{(\\d)\\}|(?<!\\$)\\$(\\d))", "g");

exports.caseTransformRE = new RegExp("(?<caseModifier>\\\\{1,2}[UuLl])?(?<caseTransform>\\$\\{(\\d):\\/((up|down|pascal|camel|snake|kebab)case|capitalize)\\})", "g");

exports.conditionalRE = new RegExp("(?<caseModifier>\\\\{1,2}[UuLl])?(?<conditional>(\\$\\{(\\d):([-+?]?)(.*?\\\\\}.*?|.*?))\\})", "g");

// there is no jsOp in runInSearchPanel
// below is not working in resolveVaraibles for some reason
// exports.jsOpRE = new RegExp("(?<jsOp>\\$\\$\\{([\\S\\s]*?)\\}\\$\\$)", "gm");
  //  exports.jsOpRE = new RegExp("(?<jsOp>\\$\\$\\{([\\S\\s]*?)\\}\\$\\$)", "g");

//  lineNumber/lineIndex
exports.lineNumberIndexRE = new RegExp("\\$\\{line(Number|Index)\\}");

// all in resolveVaraibles.js
exports.pathCaseModifierRE = new RegExp("(?<caseModifier>\\\\{1,2}[UuLl])?(?<vars>\\$\{\\s*.*?\\s*\\})");

// escape .*{}[]?^$+()| if using in a find or findSearch
exports.escapeRegExCharacters = new RegExp("([\\.\\*\\?\\{\\}\\[\\]\\^\\$\\+\\|\\(\\)])", "g");
// 6 matches in resolveVariables.js
// if (!args.isRegex && caller === "find") return resolved?.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");
// else if (!args.isRegex && caller === "findSearch") return resolved?.replaceAll(/([\.\*\?\{\}\[\]\^\$\+\|])/g, "\\$1");

// empty line: in makeFind
// selectedText = '^(?!\n)$(?!\n)';  // TODO: 5 matches

// in line.js
// const re = /(?<!\r)\n/g;  // TODO this, 7 matches
 // put cursor at the old start of the/each line          
//  if (cursorMoveSelect === "^(?!\n)") cmsMatches = [cmsMatches[0]];
 // put cursor at the new end of the/each line
//  else if (cursorMoveSelect === "$(?!\n)") cmsMatches = [cmsMatches.at(-1)];
// args.find = `\\n{0}` + args.find.replace(/\s+/g, '\\s*');
// replacementText: resolvedReplace.replaceAll(/(?!<\r)\n/g, '\r\n'),
// if (cursorMoveSelect === "^(?!\n)") {            // TODO
//  else if (cursorMoveSelect === "$(?!\n)") {      // TODO
 
// in previousNext.js
//  if (resolvedFind === "^(?!\n)" || resolvedFind === "$(?!\n)") {
//  if (args.isRegex) resolvedReplace = resolvedReplace?.replace(/(?<!\r)\n/g, "\r\n");
 
 // in selections.js
//  const lineIndexNumberRE = /\$\{getTextLines:[^}]*\$\{line(Index|Number)\}.*?\}/;
//  const re = /(?<!\r)\n/g;
// if (cursorMoveSelect === "^(?!\n)") {  // args.cursorMoveSelect === "^"
//  else if (cursorMoveSelect === "$(?!\n)") {  // args.cursorMoveSelect === "$"

 



 




 


