const variables = require('./variables');


let vars = variables.getPathVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
exports.pathGlobalRE = new RegExp(`(?<pathCaseModifier>\\\\[UuLl])?(?<path>${ vars })`, 'g');

// in exports.resolveSearchPathVariables
// let vars = variables.getPathVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
exports.pathNotGlobalRE = `(?<pathCaseModifier>\\\\[UuLl])?(?<path>${ vars })`;

vars = variables.getSnippetVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
exports.snippetRE = new RegExp(`(?<pathCaseModifier>\\\\[UuLl])?(?<snippetVars>${ vars })`, 'g');

vars = variables.getExtensionDefinedVariables().join("|").replaceAll(/([\$][\{])([^\}]+)(})/g, "\\$1\\s*$2\\s*$3");
exports.extensionGlobalRE = new RegExp(`(?<caseModifier>\\\\[UuLl])?(?<extensionVars>${ vars })`, 'g');
exports.extensionNotGlobalRE = new RegExp(`(?<caseModifier>\\\\[UuLl])?(?<extensionVars>${ vars })`);

exports.capGroupCaseModifierRE = new RegExp("(?<caseModifier>\\\\[UuLl])(?<capGroup>\\$\\{?\\d(?!:)\\}?)", "g");
exports.capGroupOnlyRE = new RegExp("(?<capGroupOnly>(?<!\\$)\\$\{(\\d)\\}|(?<!\\$)\\$(\\d))", "g");

exports.caseTransformRE = new RegExp("(?<caseModifier>\\\\[UuLl])?(?<caseTransform>\\$\\{(\\d):\\/((up|down|pascal|camel|snake)case|capitalize)\\})", "g");

exports.conditionalRE = new RegExp("(?<caseModifier>\\\\[UuLl])?(?<conditional>(\\$\\{(\\d):([-+?]?)(.*?\\\\\}.*?|.*?))\\})", "g");

// there is no jsOp in runInSearchPanel
exports.jsOpRE = new RegExp("(?<jsOp>\\$\\$\\{([\\S\\s]*?)\\}\\$\\$)", "gm");

//  lineNumber/lineIndex
exports.lineNumberIndexRE = new RegExp("\\$\\{line(Number|Index)\\}");

// all in resolveVaraibles.js
exports.pathCaseModifierRE = new RegExp("(?<caseModifier>\\\\[UuLl])?(?<vars>\\$\{\\s*.*?\\s*\\})");

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

 



 




 


