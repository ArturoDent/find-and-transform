const { window, WorkspaceEdit, TextEdit, Range, Position, Selection, workspace } = require('vscode');
const registerCommands = require('./registerCommands');
const resolve = require('./resolveVariables');
const regexp = require('./regex');


/**
 * Add any empty/words at cursor position to the editor.selections.
 * Modifies existing selections.
 * @param {window.activeTextEditor} editor
 */
exports.addEmptySelectionMatches = async function (editor) {

  const { document } = window.activeTextEditor;

  for await (const selection of editor.selections) {

    const emptySelections = [];

    // if selection start = end then just a cursor no actual selected text
    if (selection.isEmpty) {

      const wordRange = document?.getWordRangeAtPosition(selection.start);
      if (!wordRange) return;

      emptySelections.push(new Selection(wordRange?.start, wordRange?.end));

      // filter out the original empty selection
      editor.selections = editor.selections?.filter(oldSelection => oldSelection !== selection);
      editor.selections = emptySelections?.concat(editor.selections);
    }
  // }));
  };
};


/**
 * Run the args.run and args.runWhen, no return
 * 
 * @param {Object} args
 * @param {string} resolvedFind
 * @param {Selection} selection - the editor.selection
 * 
 */
exports.matchAroundCursor = function (args, resolvedFind, selection) {

  const document = window.activeTextEditor.document;
  let lineIndex = 0;
  let matches = [];
  let foundSelection;
  let foundMatch;

 if (resolvedFind.search(regexp.lineNumberIndexRE) !== -1) {
   
    let selectedLineRange = document.lineAt(selection.active.line).range;
    // matches = module.exports.buildLineNumberMatches(resolvedFind, selectedLineRange);
    matches = this.buildLineNumberMatches(resolvedFind, selectedLineRange);
  }
  else if (resolvedFind?.length) {
      
    // optimize by trying to match in the same line first
    const lineText = document.lineAt(selection.active.line).text;
    matches = [...lineText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
    if (matches.length) lineIndex = document.offsetAt(new Position(selection.active.line, 0));
    
    if (!matches.length) {
      const fullText = document.getText();
      matches = [...fullText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
    }
  }

  const found = matches?.find(match => {
    const startPos = document?.positionAt(match.index + lineIndex);
    const endPos = document?.positionAt(match.index + match[0].length + lineIndex);
    const thisSelection = new Selection(startPos, endPos);
  
    if (thisSelection.contains(selection)) {
      foundSelection = thisSelection;
      foundMatch = match;
      return true;
    }
  });
  return [ foundSelection, foundMatch, lineIndex ];
}


/**
 * Run the args.run and args.runWhen, no return
 * 
 * @param {Object} args
 * @param {Array} foundMatches
 * @param {Array<Selection>} foundSelections
 * @param {Selection} selection - the editor.selection
 * 
 */
exports.runWhen = async function (args, foundMatches, foundSelections, selection) {

  if (args.runWhen === "onceIgnoreMatches")
    await resolve.resolveVariables(args, "run", null, selection, null, null);  // no matches, run once
  
  else if (foundMatches.length) {
    
    if (args.runWhen === "onEveryMatch") {
      
      let selectionIndex = 0;
      for await (const foundSelection of foundSelections) {
        // TODO: test on ${matchIndex/Number}
        await resolve.resolveVariables(args, "run", foundMatches[selectionIndex], foundSelection, null, selectionIndex);
        selectionIndex++;
      };
    }
    
    else if (!args.runWhen || args.runWhen === "onceIfAMatch")  // uses first match and first selection = editor.selection
      await resolve.resolveVariables(args, "run", foundMatches[0], foundSelections[0], null, null);
  }
  
  else if (args.runWhen === "onceOnNoMatches")
    await resolve.resolveVariables(args, "run", null, selection, null, null);  // no matches, run once
}


/**
 * If find has ${lineNumber} or ${lineIndex} check match ** on each line **
 * 
 * @param {string} find - value to match
 * @param {Range} range - line or selection range within which to search
 * @returns {Array} of matches
 */
exports.buildLineNumberMatches = function (find, range) {

  const document = window.activeTextEditor.document;

  let matches = [];
  const startLineNumber = range.start.line;
  const endLineNumber = range.end.line;

  for (let line = startLineNumber; line <= endLineNumber; line++) {

    const lineIndex = document.offsetAt(new Position(line, 0));
    let lineText = document.lineAt(line).text;

    // if no lineText continue
   
    // for selections/once/onceIncludeCurrentWord/onceExcludeCurrentWord
    // change lineText to start of wordAtCursor?
    
    if (range.start.line === line) lineText = lineText.substring(range.start.character);
    else if (range.end.line === line) lineText = lineText.substring(0, range.end.character);

    let resolved = find?.replaceAll("${lineNumber}", String(line + 1))?.replaceAll("${lineIndex}", String(line));
    const lineMatches = [...lineText.matchAll(new RegExp(resolved, "g"))];

    for (const match of lineMatches) {
     match["line"] = line;
     // should lineIndex be included at all?
      if (range.start.line === line) match["index"] = lineIndex + match.index + range.start.character;
      else match["index"] = lineIndex + match.index;  // don't add range.start.character to non-first line of selections
      matches.push(match);
    }
  }
  return matches;
}


/**
 * Combine matches so that any undefined capture groups are filled from other matches
 * 
 * @param {Array} matches 
 * @returns {Promise<array>}
 */
exports.combineMatches = async function (matches) {
  
  // match A = ["howdy there", undefined, "howdy"]; match B = ["howdy there", "there", "undefined"]
  // combined = ["howdy there", "there", "howdy"]
  // undefineds are replaced from capture group values from other matches

  let firstMatch = matches.shift().flat();  // gets rid of match.index/input/groups
  
  let index = 0;

  for await (const value of firstMatch) {
    
    if (!value) {  // i.e., = undefined
      let foundMatch = matches.find(match => {
        if (match[index]) return match[index];
      });
      if (foundMatch) firstMatch[index] = foundMatch[index];
    }
    index++;
  };
  
  return firstMatch;
};