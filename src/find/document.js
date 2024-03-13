const { window, WorkspaceEdit, TextEdit, Range, Position, Selection, workspace } = require('vscode');

const resolve = require('../resolveVariables');
const regexp = require('../regex');


const utilities = require('../utilities');
const transforms = require('../transform');
const prePostCommands = require('../prePostCommands');



/**
 * Replace all find matches in the entire document
 *
 * @param {window.activeTextEditor} editor
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInWholeDocument = async function (editor, args) {

  const document = editor.document;
  const cursorPosition = document.getWordRangeAtPosition(editor.selection.active)?.end || editor.selection.end;
  const originalSelectons = editor.selections;
  
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
  
  // so args.find/makeFind and args.replace
  if (args.restrictFind === "matchAroundCursor") {
    
    await Promise.all(editor.selections.map(async (selection) => {
      
      let [foundSelection, foundMatch, foundLineIndex] = transforms.matchAroundCursor(args, resolvedFind, selection);
      if (foundSelection && foundMatch) {
        foundSelections.push(foundSelection);
        foundMatches.push(foundMatch);
        if (typeof foundLineIndex === 'number') lineIndices.push(foundLineIndex); // so handles the 0 case
        matches.push(foundMatch);
      }
    }));
  }
  
  else {

    if (resolvedFind?.search(regexp.lineNumberIndexRE) !== -1) {
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
  
    foundMatches.push(...matches);

    foundMatches.map(match => {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      foundSelections.push(new Selection(startPos, endPos));
    });
  }
  
  if (!foundMatches.length) return;
  
  let lastMatchLengthDiff = 0;
  
  // do this so editBuilder will select the replacements, but have originalSelectons for later
  if (foundSelections.length) editor.selections = foundSelections;

  const textEdits = [];  // TextEdit[]
  
  let index = 0;

  for await (const match of foundMatches) {

    resolvedReplace = await resolve.resolveVariables(args, "replace", match, foundSelections[index], null, index);

    if (resolvedReplace === "Error: jsOPError") return;    // abort

    if (args.isRegex) resolvedReplace = resolvedReplace?.replace(/(?<!\r)\n/g, "\r\n");  // might be unnecessary

    if (args.restrictFind === 'matchAroundCursor')  lineIndex = lineIndices[index];
    
    const startPos = document.positionAt(match.index + lineIndex);

    const endPos = document.positionAt(match.index + match[0].length + lineIndex);
    const matchRange = new Range(startPos, endPos);
    
    textEdits.push(new TextEdit(matchRange, resolvedReplace));

    if (args.cursorMoveSelect) {  // to be used in cursorMoveSelect below to build matching text
      matches[index].range = new Range(startPos, new Position(startPos.line, startPos.character + resolvedReplace?.length));
      matches[index].lastMatchLengthDiff = lastMatchLengthDiff;
      lastMatchLengthDiff += (resolvedReplace?.length - match[0].length);
      matches[index].replaceLength = resolvedReplace?.length;
    }
    
    index++;
  }
  
  // await editor.edit(editBuilder => {
  //   textEdits.forEach(textEdit => {
  //     editBuilder.replace(textEdit.range, textEdit.newText);
  //   });
  // });
  
  if (textEdits.length) {
    await editor.edit(editBuilder => {
      textEdits.forEach(textEdit => {
        editBuilder.replace(textEdit.range, textEdit.newText);
      });
    });
  }
  
  // originalSelectons
  // cursorMoveSelect may not match anything
  if (args.preserveSelections && foundSelections.length) editor.selections = originalSelectons;
  
  
  //////////////////////////  cursorMoveSelect   //////////////////////////
  
  if (args.cursorMoveSelect  && !args.preserveSelections) {

    const foundCMSSelections = [];
    let index = 0;

    const combinedMatches = await transforms.combineMatches(Array.from(matches));

    for await (const match of foundMatches) {

      let cursorMoveSelect = await resolve.resolveVariables(args, "cursorMoveSelect", combinedMatches, null, null, index);
      cursorMoveSelect = await resolve.adjustCMSValueForRegex(cursorMoveSelect, args.isRegex, args.matchWholeWord);
  
      if (cursorMoveSelect.length) {

        const re = new RegExp(cursorMoveSelect, args.regexOptions);
        
        // since the match can extend over different lines
        const startPos = document.positionAt(match.index + match.lastMatchLengthDiff);
        const endPos = document.positionAt(match.index + match.lastMatchLengthDiff + match.replaceLength);
        const matchRangeAfterReplacement = new Range(startPos, endPos);
    
        const textOfMatch = textEdits[index].newText;

        const cmsMatches = [...textOfMatch.matchAll(re)];

        for (const cmsMatch of cmsMatches) {
          const startPos = document.positionAt(document.offsetAt(matchRangeAfterReplacement?.start) + cmsMatch.index);
          const endPos = document.positionAt(document.offsetAt(matchRangeAfterReplacement?.start) + cmsMatch?.index + cmsMatch[0]?.length);
          foundCMSSelections.push(new Selection(startPos, endPos));
        }
      }
      index++;
    }
    if (foundCMSSelections.length && !args.preserveSelections) {
      editor.selections = foundCMSSelections; 
      editor.revealRange(new Range(foundCMSSelections[0].start, foundCMSSelections[0].end), 2);
    }
  }
  
  // TODO: add  && !args.preserveSelections ?
  if (foundSelections.length && args.reveal && !args.cursorMoveSelect) {
    const selectionToReveal = await utilities.getSelectionToReveal(foundSelections, cursorPosition, args.reveal);
    editor.revealRange(new Range(selectionToReveal.start, selectionToReveal.end), 2);
  }

  await transforms.runWhen(args, foundMatches, foundSelections, editor.selection);
  
  if (args.postCommands) await prePostCommands.runPost(args, foundMatches, foundSelections, editor.selection);
};