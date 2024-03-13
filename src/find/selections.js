const { window, WorkspaceEdit, TextEdit, Range, Position, Selection, workspace } = require('vscode');

const resolve = require('../resolveVariables');
const regexp = require('../regex');

const transforms = require('../transform');
const prePostCommands = require('../prePostCommands');



/**
 * Replace matches within each selection range
 *
 * @param {window.activeTextEditor} editor - the active editor
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInSelections = async function (editor, args) {

  const originalFindArg = args.find;
  const originalisRegexArg = args.isRegex;
  const originalSelections = editor.selections;
  let   changeInSelectionLength = 0;
  
  const document = editor.document;

  let   resolvedFind;
  let   resolvedReplace;
  let   matches;
  const matchesPerSelection = new Map();
  const foundMatches = [];
  let   foundSelections = [];      // before any replacement
  const foundCMSSelections = [];  
  
  const textEdits = [];  // TextEdit[]

  let index = 0;
  let thisSelectionNumber = 0;
  let selectionStartIndex = 0;
  let selectionStartAdjust = 0;
  let cumulativeChangesInSelectionLength = 0;
  
  // sort the selections because the line and character changes are computed from the top of the document down
  // and if the user selects some other order of selections it will noy comput properly
  let sortedSelections = originalSelections;
  // @ts-ignore  because editor.selections are read-only
  if (args.cursorMoveSelect) sortedSelections = sortedSelections.toSorted(compareSelections);
  
        function compareSelections(a, b) {
          if (a.start.line < b.start.line) {
            return -1;
          }
          else if (a.start.line > b.start.line) {
            return 1;
          }
          
          else if (a.start.character < b.start.character) {
            return -1;
          }
          else if (a.start.character > b.start.character) {
            return 1;
          }
          // a is to b
          return 0;
        }
  

  for await (const selection of sortedSelections) {
    
    changeInSelectionLength = 0;

    args.isRegex = originalisRegexArg;
    // empty selections, pointReplacements?
    // could filter out empty selections first
    const selectedRange = new Range(selection.start, selection.end);
    if (selection.isReversed) selectionStartIndex = document.offsetAt(selection.active);
    else selectionStartIndex = document.offsetAt(selection.anchor);
    
    if (!originalFindArg) {
      const findObject = await resolve.makeFind([selection], args);
      args.find = findObject.find;
      args.isRegex = args.isRegex || findObject.mustBeRegex;
      args.madeFind = true;
      args.pointReplaces = findObject.emptyPointSelections;
    }
    
    // this will never be needed, the find is the entire selection so there would be no more than the one match
    // if (args.find && args.ignoreWhiteSpace) {
    //   args.find = args.find.trim();
    //   args.find = `\\n{0}` + args.find.replace(/\s+/g, '\\s*');
    //   args.isRegex = true;
    // }

    const lineIndexNumberRE = regexp.lineNumberIndexRE;

    // if (args.find.search(lineIndexNumberRE) !== -1)
    //   resolvedFind = await resolve.resolveVariables(args, "find", null, selection, null, index);
    // else
   //   resolvedFind = await resolve.resolveVariables(args, "ignoreLineNumbers", null, selection, null, index);
   
    resolvedFind = await resolve.resolveVariables(args, "ignoreLineNumbers", null, selection, null, index);

    const obj = await resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.ignoreWhiteSpace, args.madeFind);
    resolvedFind = obj.findValue;
    args.isRegex = obj.isRegex;
    
    if (!resolvedFind && !args.replace) return;
    
    if (resolvedFind?.search(regexp.lineNumberIndexRE) !== -1) {
      matches = transforms.buildLineNumberMatches(resolvedFind, selectedRange);
      selectionStartIndex = 0;
    }

    else {
      const re = new RegExp(resolvedFind, args.regexOptions);
      const selectedText = document.getText(selectedRange);
      matches = [...selectedText.matchAll(re)];
    }
    
    foundMatches.push(...matches);
    
    for await (const match of matches) {
      const startPos = document.positionAt(selectionStartIndex + match.index);
      const endPos = document.positionAt(selectionStartIndex + match.index + match[0].length);
      
      if (!selection.isReversed) foundSelections.push(new Selection(startPos, endPos));
      else foundSelections.push(new Selection(endPos, startPos));
      
      resolvedReplace = await resolve?.resolveVariables(args, "replace", match, selection, selectionStartIndex, index);
      if (resolvedReplace !== null) textEdits.push(new TextEdit(foundSelections[index], resolvedReplace));
   
      if (args.cursorMoveSelect) {  // to be used in cursorMoveSelect below, also used in line.js
        
        // if (?<!\\r)\\n in resolvedReplace add 1 to resolvedReplace.length for each newline w/o a preceding \r
        // because vscode will "normalize" \n => \r\n, thus adding a character
        const re = /(?<!\r)\n/g;
        const numNewLInes = [...resolvedReplace.matchAll(re)].length;
        
        changeInSelectionLength += (resolvedReplace?.length - match[0].length + numNewLInes);
      }
      index++;
    }
    
    selectionStartAdjust = cumulativeChangesInSelectionLength;    
    cumulativeChangesInSelectionLength += changeInSelectionLength;
    
    let originalLength = Math.abs(document.offsetAt(selection.end) - document.offsetAt(selection.start));
    
    matchesPerSelection.set(thisSelectionNumber, {
      selectionNumber: thisSelectionNumber,
      numMatches: matches.length,
      matches: matches,
      isSelectionWithMatch: matches.length ? true : false,
      originalLength,
      cumulativeChangesInSelectionLength,
      selectionStartIndex,
      selectionStartAdjust
    });
    
    thisSelectionNumber++;
  };
   
  if (foundSelections.length) editor.selections = foundSelections;
  
  if (textEdits.length) {
    await editor.edit(editBuilder => {
      textEdits.forEach(textEdit => {
        editBuilder.replace(textEdit.range, textEdit.newText);
      });
    });
  }
  
  if (args.preserveSelections && foundSelections.length) editor.selections = originalSelections;
  
  //////////////////////////  cursorMoveSelect   //////////////////////////
  
  if (args.cursorMoveSelect && !args.preserveSelections) {
    let index = 0;
    let cursorMoveSelect;
    
    const iter = matchesPerSelection.values();    

    for await (const selection of originalSelections) {
      
      let numMatches = 0, matches = null, originalLength = 0,
        selectionStartIndex = 0, selectionStartAdjust = 0, cumulativeChangesInSelectionLength = 0;
      
      // works since Map items are added and retrieved in insertion order
      const item = iter.next();
      if (!item.done)
        ({ numMatches, matches, selectionStartIndex, originalLength, selectionStartAdjust, cumulativeChangesInSelectionLength } = item.value);  // the !item.done is not strictly necessary
      else break; 
      
      if (numMatches) {

        const combinedMatches = await transforms.combineMatches(Array.from(matches));

        cursorMoveSelect = await resolve.resolveVariables(args, "cursorMoveSelect", combinedMatches, selection, null, index);
        cursorMoveSelect = await resolve.adjustCMSValueForRegex(cursorMoveSelect, args.isRegex, args.matchWholeWord);

        if (cursorMoveSelect.length) {  // don't if cursorMoveSelect === ""

          // put cursor at the old start of the/each selection
          if (cursorMoveSelect === "^(?!\n)") {  // args.cursorMoveSelect === "^"
            const startPos = document.positionAt(selectionStartIndex + selectionStartAdjust);
            foundCMSSelections.push(new Selection(startPos, startPos));
          }
          // put cursor at the old end of the/each selection
          else if (cursorMoveSelect === "$(?!\n)") {  // args.cursorMoveSelect === "$"
            const endPos = document.positionAt(selectionStartIndex + originalLength + cumulativeChangesInSelectionLength);
            foundCMSSelections.push(new Selection(endPos, endPos));
          }
          else {
            const startPos = document.positionAt(selectionStartIndex + selectionStartAdjust);
            const endPos = document.positionAt(selectionStartIndex + originalLength + cumulativeChangesInSelectionLength);
            const selectionText = document.getText(new Range(startPos, endPos));
            
            const cmsMatches = [...selectionText.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

            for (const match of cmsMatches) {
              const startPos = document.positionAt(selectionStartIndex + selectionStartAdjust + match.index);
              const endPos = document.positionAt(selectionStartIndex + selectionStartAdjust + match.index + match[0].length);
              
              foundCMSSelections.push(new Selection(startPos, endPos));
            }
          }
        }
        index++;
      }
    };
  };
    
  if (foundCMSSelections.length) {
    if (!args.preserveSelections) editor.selections = foundCMSSelections;
    editor.revealRange(new Range(foundCMSSelections[0].start, foundCMSSelections[0].end), 2);  // InCenterIfOutsideViewport
  }
  else if (foundSelections.length) {
    editor.revealRange(new Range(foundSelections[0].start, foundSelections[0].end), 2);  // 2 = InCenterIfOutsideViewport
  }
    
  await transforms.runWhen(args, foundMatches, foundSelections, editor.selection);
  
  if (args.postCommands) await prePostCommands.runPost(args, foundMatches, foundSelections, editor.selection);
};