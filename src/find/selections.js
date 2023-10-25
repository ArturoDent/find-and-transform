const { window, WorkspaceEdit, TextEdit, Range, Position, Selection, workspace } = require('vscode');

const commands = require('../commands');
const resolve = require('../resolveVariables');
// const utilities = require('../utilities');
const transforms = require('../transform');


/**
 * Replace matches within each selection range
 *
 * @param {window.activeTextEditor} editor - the active editor
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInSelections = async function (editor, args) {

  const originalFindArg = args.find;
  const originalisRegexArg = args.isRegex;
  
  const document = editor.document;

  // let   isSelectionWithMatch = false;  // at least one
  let   resolvedFind;
  let   resolvedReplace;
  let   matches;
  let   matchesPerSelection = new Set();
  const foundMatches = [];
  const foundSelections = [];
  const foundCMSSelections = [];  
  
  const wsEdit = new WorkspaceEdit();
  const textEdits = [];  // TextEdit[]

  let index = 0;
  let thisSelectionNumber = 0;

  // await Promise.all(editor.selections.map(async (selection, thisSelectionNumber) => {
  for await (const selection of editor.selections) {

    args.isRegex = originalisRegexArg;
    // empty selections, pointReplacements?
    // could filter out empty selections first
    const selectedRange = new Range(selection.start, selection.end);
    let selectionStartIndex = document.offsetAt(selection.start);
    
    // TODO: does ignoreWhiteSpace work here?
    if (!originalFindArg) {
      const findObject = resolve.makeFind([selection], args);
      args.find = findObject.find;
      args.isRegex = args.isRegex || findObject.mustBeRegex;
      args.madeFind = true;
      args.pointReplaces = findObject.emptyPointSelections;
    }

    // below instead of resolveVariables.resolveFind because it is async and editor.edit??
    const lineIndexNumberRE = /\$\{getTextLines:[^}]*\$\{line(Index|Number)\}.*?\}/;

    if (args.find.search(lineIndexNumberRE) !== -1)
      resolvedFind = await resolve.resolveVariables(args, "find", null, selection, null, index);
    else
      resolvedFind = await resolve.resolveVariables(args, "ignoreLineNumbers", null, selection, null, index);

    // resolvedFind = resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.madeFind);
    const obj = await resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.madeFind);
    resolvedFind = obj.findValue;
    args.isRegex = obj.isRegex;
    
    if (!resolvedFind && !args.replace) return;
    
    // if args.replace has a capture group in it AND regex is false:
    // find = (find); regex = true AND escape regex characters
    // if (args.isRegex === false) {
    //   args.find = resolvedFind;
    //   args = resolve.checkForCaptureGroupsInReplace(args);
    //   resolvedFind = args.find;
    // }
      

    if (resolvedFind?.search(/\$\{line(Number|Index)\}/) !== -1) {
      matches = transforms.buildLineNumberMatches(resolvedFind, selectedRange);
      selectionStartIndex = 0;
    }

    else {
      const re = new RegExp(resolvedFind, args.regexOptions);
      const selectedText = document.getText(selectedRange);
      matches = [...selectedText.matchAll(re)];
    }
    
    for (const match of matches) {

      resolvedReplace = await resolve?.resolveVariables(args, "replace", match, selection, selectionStartIndex, index);
      index++;

      const startPos = document.positionAt(selectionStartIndex + match.index);
      const endPos = document.positionAt(selectionStartIndex + match.index + match[0].length);
      const matchRange = new Range(startPos, endPos);

      // if (resolvedReplace !== null) edit.replace(matchRange, resolvedReplace);
      if (resolvedReplace !== null) textEdits.push(new TextEdit(matchRange, resolvedReplace));

      // TODO: might not need the below at all?
      // else editor.selections = editor.selections.filter(otherSelection => otherSelection !== selection);
      
      foundMatches.push(match);
      if (!foundSelections.includes(selection)) foundSelections.push(selection);        
    }

    matchesPerSelection.add({
      selectionNumber: thisSelectionNumber++,
      numMatches: matches.length,
      matches: matches,
      isSelectionWithMatch: matches.length ? true : false
    });
    
    // thisSelectionNumber++;
  };
  
  wsEdit.set(editor.document.uri, textEdits);
  await workspace.applyEdit(wsEdit);
  
  // textEdits.map(edit => {
  //   const endPos = new Position(edit.range.end.line, edit.range.start.character + edit.newText.length);
  //   foundSelections.push(new Selection(edit.range.start, endPos));
  // })
  
  // editor.selections = foundSelections; 
  
  if (args.cursorMoveSelect) {
    let index = 0;
    let cursorMoveSelect;
    
    const iter = matchesPerSelection.values();    

    // await Promise.all(editor.selections.map(async (selection, thisSelection) => {  // doesn't work synchronously
    for await (const selection of editor.selections) {
      
      let numMatches = 0, matches = null;
      
      // works since Set items are added and retrieved in insertion order
      const item = iter.next();
      if (!item.done) ({ numMatches, matches } = item.value);  // the !item.done is not strictly necessary
      else break; 
      
      // for (const item of matchesPerSelection) {
      //   if (item.selectionNumber === thisSelection) {
      //     ({ numMatches, matches } = item);
      //     matchesPerSelection.delete(item);
      //     break;
      //   }
        
      // }
      // thisSelection++;

      if (numMatches) {

        const combinedMatches = await transforms.combineMatches(Array.from(matches));

        // cursorMoveSelect = await resolve.resolveCursorMoveSelect(args.cursorMoveSelect, numMatches, combinedMatch, selection, index);
        cursorMoveSelect = await resolve.resolveVariables(args, "cursorMoveSelect", combinedMatches, selection, null, index);
        cursorMoveSelect = await resolve.adjustCMSValueForRegex(cursorMoveSelect, args.isRegex, args.matchWholeWord);

        if (cursorMoveSelect.length) {  // don't if cursorMoveSelect === ""

          const selectionIndex = document.offsetAt(selection.start);

          if (cursorMoveSelect === "^(?!\n)") {  // args.cursorMoveSelect === "^"
            foundCMSSelections.push(new Selection(selection.start, selection.start));
          }
          else if (cursorMoveSelect === "$(?!\n)") {  // args.cursorMoveSelect === "$"
            const diff = resolvedFind.length - resolvedReplace?.length;
            const selPos = new Position(selection.end.line, Math.abs(selection.end.character - (matchesPerSelection[index] * diff)));
            foundCMSSelections.push(new Selection(selPos, selPos));
          }
          else {
            const selectedRange = new Range(selection.start, selection.end);
            const selectionText = document.getText(selectedRange);
            const cmsMatches = [...selectionText.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

            for (const match of cmsMatches) {
              const startPos = document.positionAt(selectionIndex + match.index);
              const endPos = document.positionAt(selectionIndex + match.index + match[0].length);
              foundCMSSelections.push(new Selection(startPos, endPos));
            }
          }
        }
        index++;
      }
    // }));
    };
  };
    
  if (foundCMSSelections.length) {
    if (!args.preserveSelections) editor.selections = foundCMSSelections;
    editor.revealRange(new Range(foundCMSSelections[0].start, foundCMSSelections[0].end), 2);  // InCenterIfOutsideViewport
  }
  else if (foundSelections.length) {
    if (!args.preserveSelections) editor.selections = foundSelections;
    editor.revealRange(new Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
  }
    
  await transforms.runWhen(args, foundMatches, foundSelections, editor.selection);
  
  // TODO is this running per selection? No
  // if (args.postCommands && isSelectionWithMatch) await commands.runPrePostCommands(args.postCommands, "postCommands");
  if (args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands");
};