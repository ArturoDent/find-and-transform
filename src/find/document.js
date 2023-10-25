const { window, WorkspaceEdit, TextEdit, Range, Position, Selection, workspace } = require('vscode');

const commands = require('../commands');
const resolve = require('../resolveVariables');
const utilities = require('../utilities');
const transforms = require('../transform');


/**
 * Replace all find matches in the entire document
 *
 * @param {window.activeTextEditor} editor
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInWholeDocument = async function (editor, args) {

  const document = editor.document;
  const cursorPosition = document.getWordRangeAtPosition(editor.selection.active)?.end || editor.selection.end;
  
  let   docRange;
  let   fullText;
  let   matches = [];
  let   resolvedFind = "";
  let   resolvedReplace;
  
  let   foundSelections = [];
  const foundMatches = [];
  
  let   lineIndex = 0;
  let   lineIndices = [];
  
  if (args.find) {
    const findObject = await resolve.resolveFind(editor, args, null, null);
    resolvedFind = findObject.findValue;
    args.isRegex = findObject.isRegex;
  }
  
  if (resolvedFind === "Error: jsOPError") return;  // abort
  
  // so a args.find/makeFind and a args.replace
  if (args.restrictFind === "matchAroundCursor") {
    
    await Promise.all(editor.selections.map(async (selection) => {
    // for await (const selection of editor.selections) {
      
      let [foundSelection, foundMatch, foundLineIndex] = transforms.matchAroundCursor(args, resolvedFind, selection);
      if (foundSelection) foundSelections.push(foundSelection);
      if (foundMatch) foundMatches.push(foundMatch);
      if (typeof foundLineIndex === 'number') lineIndices.push(foundLineIndex); // so handles the 0 case
      matches.push(foundMatch);
      
    }));
    // };
  }
  
  else {

    if (resolvedFind?.search(/\$\{\s*line(Number|Index)\s*\}/) !== -1) {
      // lineCount is 1-based, so need to subtract 1 from it
      const lastLineRange = document.lineAt(document.lineCount - 1).range;
      docRange = new Range(0, 0, document.lineCount - 1, lastLineRange.end.character);
      matches = transforms.buildLineNumberMatches(resolvedFind, docRange);
    }

    // get all the matches in the document, resolvedFind !== lineNumber/lineIndex
    else if (resolvedFind?.length) {
      fullText = document.getText();
      matches = [...fullText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
    }

    args?.pointReplaces?.forEach(point => {
      const match = { index: document.offsetAt(point.active) };
      match[0] = "";
      matches.push(match);
    });
  
    // set selections to the find matches, need this for ${selectedText} in a replace, for example
    matches?.forEach((match, index) => {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);

      // foundSelections.push(new Selection(startPos, endPos));
      foundMatches.push(match);
    });
  }
  
  // TODO to preserve pre-existing selections, don't use below
  if (!args.preserveSelections && foundSelections.length) editor.selections = foundSelections;
  // if (foundSelections.length) editor.selections = foundSelections;  // and so postCommands work on selections

  let lastMatchLengthDiff = 0;

  const wsEdit = new WorkspaceEdit();
  const textEdits = [];  // TextEdit[]
  
  
  let index = 0;

  // for (const match of matches) {
  for (const match of foundMatches) {

    resolvedReplace = await resolve.resolveVariables(args, "replace", match, editor.selections[index], null, index);

    if (resolvedReplace === "Error: jsOPError") return;    // abort

    if (args.isRegex) resolvedReplace = resolvedReplace?.replace(/(?<!\r)\n/g, "\r\n");  // might be unnecessary

    if (args.restrictFind === 'matchAroundCursor')  lineIndex = lineIndices[index];
    
    const startPos = document.positionAt(match.index + lineIndex);
    const endPos = document.positionAt(match.index + match[0].length + lineIndex);
    
    // const endPosReplace = document.positionAt(match.index + lineIndex + resolvedReplace.length);
    
    const matchRange = new Range(startPos, endPos);
    // foundSelections.push(new Selection(startPos, endPosReplace));
        
    textEdits.push(new TextEdit(matchRange, resolvedReplace));

    if (args.cursorMoveSelect) {  // to be useed in cursorMoveSelect below to build matching text
      matches[index].range = new Range(startPos, new Position(startPos.line, startPos.character + resolvedReplace?.length));
      matches[index].lastMatchLengthDiff = lastMatchLengthDiff;
      lastMatchLengthDiff += (resolvedReplace?.length - match[0].length);
      matches[index].replaceLength = resolvedReplace?.length;
    }
    
    index++;
  }
  
  wsEdit.set(editor.document.uri, textEdits);
  await workspace.applyEdit(wsEdit);
  
  textEdits.map(edit => {
    const endPos = new Position(edit.range.end.line, edit.range.start.character + edit.newText.length);
    foundSelections.push(new Selection(edit.range.start, endPos));
  })
  
  editor.selections = foundSelections; 
  
  if (args.cursorMoveSelect) {

    const foundCMSSelections = [];
    let index = 0;

    const combinedMatches = await transforms.combineMatches(Array.from(matches));

    for (const match of matches) {

      // let cursorMoveSelect = await resolve.resolveCursorMoveSelect(args.cursorMoveSelect, matches.length, combinedMatches, null, index);
      let cursorMoveSelect = await resolve.resolveVariables(args, "cursorMoveSelect", combinedMatches, null, null, index);
      // args, caller, groups, selection, selectionStartIndex, matchIndex
      cursorMoveSelect = await resolve.adjustCMSValueForRegex(cursorMoveSelect, args.isRegex, args.matchWholeWord);
  
      if (cursorMoveSelect.length) {

        const re = new RegExp(cursorMoveSelect, args.regexOptions);
        // since the match can extend over different lines
        const startPos = document.positionAt(match.index + match.lastMatchLengthDiff);
        const endPos = document.positionAt(match.index + match.lastMatchLengthDiff + match.replaceLength);
        const matchRangeAfterReplacement = new Range(startPos, endPos);
    
        const textOfMatch = document.getText(matchRangeAfterReplacement);

        const cmsMatches = [...textOfMatch.matchAll(re)];

        for (const cmsMatch of cmsMatches) {
          const startPos = document.positionAt(document.offsetAt(matchRangeAfterReplacement?.start) + cmsMatch.index);
          const endPos = document.positionAt(document.offsetAt(matchRangeAfterReplacement?.start) + cmsMatch?.index + cmsMatch[0]?.length);
          foundCMSSelections.push(new Selection(startPos, endPos));
        }
      }
      index++;
    }
    if (foundCMSSelections.length) {
      editor.selections = foundSelections; 
      editor.revealRange(new Range(foundCMSSelections[0].start, foundCMSSelections[0].end), 2);
    }
    // index++;
  }
  
  if (foundSelections.length && args.reveal && !args.cursorMoveSelect) {
    const selectionToReveal = await utilities.getSelectionToReveal(foundSelections, cursorPosition, args.reveal);
    editor.revealRange(new Range(selectionToReveal.start, selectionToReveal.end), 2);
  }

  await transforms.runWhen(args, foundMatches, foundSelections, editor.selection);
  
  if (foundSelections.length && args.run) Object.assign(foundSelections, editor.selections);
  
  // if (foundMatches.length && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands");
  if (foundMatches.length && args.postCommands) await transforms.runPostCommands(args, foundMatches, foundSelections, editor.selection);
  
};