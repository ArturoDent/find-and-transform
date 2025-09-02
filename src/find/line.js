const { window, WorkspaceEdit, TextEdit, Range, Position, Selection, workspace } = require('vscode');

const resolve = require('../resolveVariables');
const utilities = require('../utilities');
const transforms = require('../transform');
const prePostCommands = require('../prePostCommands');



/**
 * Replace find matches on the current line.  
 * restrictFind = line/once...
 *
 * @param {window.activeTextEditor} editor
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInLine = async function (editor, args) {

  const document = editor.document;
  const cursorPosition = document.getWordRangeAtPosition(editor.selection?.active)?.end || editor.selection?.end;
  const findArg = args.find;
  const originalSelectons = editor.selections;

  let changeInSelectionLength = 0;

  let currentLine = "";
  let matches = [];
  let foundMatches = [];
  let foundSelections = [];
  const matchesPerSelection = new Map();

  let lines = [];
  let lineMatches = [];
  let uniqueSelections = [];
  let foundCMSSelections = [];  // cursorMoveSelect matches

  let index = 0;
  let thisSelectionNumber = 0;
  let selectionStartIndex = 0;
  let selectionStartAdjust = 0;
  let cumulativeChangesInSelectionLength = 0;

  const textEdits = [];  // TextEdit[]  

  uniqueSelections.push(editor.selections[0]);
  lines.push(uniqueSelections[0].active.line);

  for await (const selection of editor.selections) {
    if (!lines.includes(selection.active.line)) {
      uniqueSelections.push(selection);
      lines.push(selection.active.line);
    }
  };

  lines = [];  // reused, OK to clear

  let sortedSelections = uniqueSelections;
  // @ts-ignore
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
    // a is equal to b (which can't happen with selections anyway)
    return 0;
  }

  if (args.restrictFind === "line") {

    // get all the matches on the line
    let lineIndex;

    for await (const selection of sortedSelections) {

      changeInSelectionLength = 0;

      // if (selection.isReversed) selectionStartIndex = document.offsetAt(selection.active);
      // else selectionStartIndex = document.offsetAt(selection.anchor);
      selectionStartIndex = document.offsetAt(new Position(selection.active.line, 0));

      args.find = findArg; // reset to the original args.find
      let resolvedFind;

      // call makeFind(selections, args) here with currentLine selections only
      if (!args.find) {   // TODO: should this be args.find !== undefined
        const lineSelections = editor.selections.filter(eachSelection => eachSelection.active.line === selection.active.line);
        const findObject = await resolve.makeFind(lineSelections, args);
        ({ find: args.find, emptyPointSelections: args.pointReplaces } = findObject);
        args.madeFind = true;
        args.isRegex ||= findObject.mustBeRegex;
      }

      // if (!args.find) return;
      if (args.find === undefined) return;

      if (args.ignoreWhiteSpace && args.madeFind) {
        args.find = args.find.trim();
        args.find = `\\n{0}` + args.find.replace(/\s+/g, '\\s*');
      }

      resolvedFind = await resolve.resolveVariables(args, "find", null, selection, null, index);
      const findObject = await resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.ignoreWhiteSpace, args.madeFind);
      resolvedFind = findObject.findValue;
      args.isRegex = findObject.isRegex;

      if (!resolvedFind && !args.replace) return;

      const re = new RegExp(resolvedFind, args.regexOptions);
      // currentLine = document.getText(document.lineAt(selection.active.line).rangeIncludingLineBreak);
      currentLine = document.getText(document.lineAt(selection.active.line).range);

      if (resolvedFind)
        matches = [...currentLine.matchAll(re)];
      else {
        const match = { index: selection.active.character };
        match[0] = "";
        matches.push(match);
      }

      // collect all the matches from all runs
      foundMatches.push(...matches);

      for await (const match of matches) {

        lineIndex = document.offsetAt(new Position(selection.active.line, 0));
        // let resolvedReplace = await resolve.resolveVariables(args, "replace", match, foundSelections[index], null, index);
        let resolvedReplace = await resolve.resolveVariables(args, "replace", match, selection, null, index);

        const startPos = document.positionAt(lineIndex + match.index);
        const endPos = document.positionAt(lineIndex + match.index + match[0].length);
        const matchRange = new Range(startPos, endPos);

        textEdits.push(new TextEdit(matchRange, resolvedReplace));

        lineMatches[index] = match;
        lines[index++] = startPos.line;

        // this is also used in selections.js, so could be re-factored
        if (args.cursorMoveSelect) {  // to be used in cursorMoveSelect below

          // if (?<!\\r)\\n in resolvedReplace add 1 to resolvedReplace.length for each
          // because vscode will "normalize" \n => \r\n, thus adding a character
          const re = /(?<!\r)\n/g;
          const numNewLInes = [...resolvedReplace.matchAll(re)].length;

          changeInSelectionLength += (resolvedReplace?.length - match[0].length + numNewLInes);
        }
      };

      if (matches.length) {
        selectionStartAdjust = cumulativeChangesInSelectionLength;
        cumulativeChangesInSelectionLength += changeInSelectionLength;

        // let originalLength = Math.abs(document.offsetAt(selection.end) - document.offsetAt(selection.start));
        let originalLength = document.lineAt(selection.start.line).text.length;

        matchesPerSelection.set(thisSelectionNumber, {
          selectionNumber: thisSelectionNumber,
          // numMatches: matches.length,  // not used at present
          // matches: matches,
          isSelectionWithMatch: matches.length ? true : false,
          originalLength,
          cumulativeChangesInSelectionLength,
          selectionStartIndex,
          selectionStartAdjust
        });
      }
      thisSelectionNumber++;
    };

    let index2 = 0;

    for await (const match of foundMatches) {
      const lineIndex = document.offsetAt(new Position(lines[index2], 0));

      const startPos = document.positionAt(lineIndex + match.index);
      const endPos = document.positionAt(lineIndex + match.index + match[0].length);

      foundSelections.push(new Selection(startPos, endPos));
      index2++;
    };

    // do this so editBuilder will select the replacements, but have originalSelectons for later
    if (foundSelections.length) editor.selections = foundSelections;

    if (textEdits.length) {  
      await editor.edit(editBuilder => {
        textEdits.forEach(async textEdit => {
          await editBuilder.replace(textEdit.range, textEdit.newText);
        });
      });
    }

    if (args.preserveSelections && foundSelections.length) editor.selections = originalSelectons;

    if (args.cursorMoveSelect && !args.preserveSelections) {

      let index = 0;
      let combinedMatches;

      // remove empty entries
      lines = Object.values(lines);
      lineMatches = Object.values(lineMatches);
      // remove duplicates from lines[]
      let uniqueLines = [...new Set(lines)];

      if (foundMatches)
        combinedMatches = await transforms.combineMatches(Array.from(foundMatches));

      const iter = matchesPerSelection.values();

      for await (const line of uniqueLines) {

        let originalLength = 0, selectionStartIndex = 0, selectionStartAdjust = 0, cumulativeChangesInSelectionLength = 0;

        // works since Map items are added and retrieved in insertion order
        const item = iter.next();
        if (!item.done)
          ({ selectionStartIndex, originalLength, selectionStartAdjust, cumulativeChangesInSelectionLength } = item.value);  // the !item.done is not strictly necessary
        else break;

        let cursorMoveSelect = await resolve.resolveVariables(args, "cursorMoveSelect", combinedMatches, null, null, index);
        cursorMoveSelect = await resolve.adjustCMSValueForRegex(cursorMoveSelect, args.isRegex, args.matchWholeWord);
        index++;

        if (cursorMoveSelect.length) {

          const startPos = document.positionAt(selectionStartIndex + selectionStartAdjust);
          const endPos = document.positionAt(selectionStartIndex + originalLength + cumulativeChangesInSelectionLength);
          const currentLine = document.getText(new Range(startPos, endPos));

          let cmsMatches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

          // put cursor at the old start of the/each line          
          if (cursorMoveSelect === "^(?!\n)") cmsMatches = [cmsMatches[0]];
          // put cursor at the new end of the/each line
          else if (cursorMoveSelect === "$(?!\n)") cmsMatches = [cmsMatches.at(-1)];

          for (const match of cmsMatches) {
            const startPos = document.positionAt(selectionStartIndex + selectionStartAdjust + match.index);
            const endPos = document.positionAt(selectionStartIndex + selectionStartAdjust + match.index + match[0].length);

            foundCMSSelections.push(new Selection(startPos, endPos));
          }
        }
      }
      // reveal the first match on the line, if cms foundSelections
      if (foundCMSSelections.length) editor.revealRange(new Range(foundCMSSelections[0].start, foundCMSSelections[0].end), 2);
    }

    if (args.cursorMoveSelect && foundCMSSelections?.length && !args.preserveSelections) editor.selections = foundCMSSelections;

    if (foundSelections?.length && args.reveal && !args.cursorMoveSelect) {
      const selectionToReveal = await utilities.getSelectionToReveal(foundSelections, cursorPosition, args.reveal);
      editor.revealRange(new Range(selectionToReveal.start, selectionToReveal.end), 2);
    }
    else if (foundSelections?.length && !args.cursorMoveSelect) {
      editor.revealRange(new Range(foundSelections[0].start, foundSelections[0].end), 2);
    }
  }  // end of line

  else if (args.restrictFind?.startsWith("once")) {

    let fullLine = "";
    let subStringIndex;
    let lines = [];
    let subStringIndices = [];
    let matches = [];     // for cursorMoveSelect

    // array of indices to remove from uniqueSelections because there was no match therein
    const removeFromSelections = [];

    let index = 0;

    for await (const selection of sortedSelections) {

      changeInSelectionLength = 0;

      const currentWordRange = document.getWordRangeAtPosition(selection.active) || selection;

      // if (selection.isReversed) selectionStartIndex = document.offsetAt(selection.active);
      // else selectionStartIndex = document.offsetAt(selection.anchor);

      if (args.restrictFind === "onceIncludeCurrentWord") selectionStartIndex = document.offsetAt(currentWordRange.start);
      else selectionStartIndex = document.offsetAt(currentWordRange.end);

      args.find = findArg; // reset to the original args.find

      // call makeFind(selections, args) here with currentLine selections only
      if (!args.find) {   // TODO: should this be args.find !== undefined
        const lineSelections = editor.selections.filter(eachSelection => eachSelection.active.line === selection.active.line);
        const findObject = await resolve.makeFind(lineSelections, args);
        ({ find: args.find, emptyPointSelections: args.pointReplaces } = findObject);
        args.madeFind = true;
        args.isRegex ||= findObject.mustBeRegex;
      }
      // if (!args.find) return;
      if (args.find === undefined) return;  // fix for '' empty string

      // handle ignoreWhiteSpace heren excluded from parseCommands, because there
      // madeFind is not called for once..., thus args.madeFind is false
      if (args.madeFind && args.ignoreWhiteSpace) {
        args.find = args.find.trim();
        args.find = `\\n{0}` + args.find.replace(/\s+/g, '\\s*');
      }

      // because caller = find, no need to resolve.resolveFind, which is async
      let resolvedFind = await resolve.resolveVariables(args, "find", null, selection, null, index);
      const findObject = await resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.ignoreWhiteSpace, args.madeFind);
      resolvedFind = findObject.findValue;
      args.isRegex = findObject.isRegex;

      if (!resolvedFind && !args.replace) return;  // correct here or already handled in findAndSelect?

      const re = new RegExp(resolvedFind, args.regexOptions);
      fullLine = document.getText(document.lineAt(selection.active.line).rangeIncludingLineBreak);

      if (args.restrictFind === "onceIncludeCurrentWord") subStringIndex = currentWordRange.start.character;
      else subStringIndex = currentWordRange.end.character;

      if (args.restrictFind === "onceIncludeCurrentWord") currentLine = fullLine.substring(subStringIndex);
      else currentLine = fullLine.substring(subStringIndex);  // once/onceExcludeCurrentWord

      // use matchAll() to get index even though only using the first one
      matches = [...currentLine.matchAll(re)];

      // if no matches, remove from uniqueSelections
      // if (!matches.length) uniqueSelections.splice(index, 1);
      if (!matches.length) removeFromSelections.push(index);

      else if (matches.length) {  // just do once

        let selectionIndex;

        if (args.restrictFind === "onceIncludeCurrentWord") selectionIndex = document.offsetAt(currentWordRange.start);
        else selectionIndex = document.offsetAt(currentWordRange.end);

        const startPos = document.positionAt(selectionIndex + matches[0].index);
        const endPos = document.positionAt(selectionIndex + matches[0].index + matches[0][0].length);

        // TODO: add | selection
        let resolvedReplace = await resolve.resolveVariables(args, "replace", matches[0], foundSelections[index], null, index);

        const matchRange = new Range(startPos, endPos);
        textEdits.push(new TextEdit(matchRange, resolvedReplace));

        lines[index] = startPos.line;
        lineMatches[index] = matches;
        foundMatches.push(matches[0]);

        // so cursorMoveSelect is only **after** a once match
        subStringIndices[index] = subStringIndex + matches[0].index;

        if (args.cursorMoveSelect) {  // to be used in cursorMoveSelect below, also used in selections.js

          // if (?<!\\r)\\n in resolvedReplace add 1 to resolvedReplace.length for each
          // because vscode will "normalize" \n => \r\n, thus adding a character
          const re = /(?<!\r)\n/g;
          const numNewLInes = [...resolvedReplace.matchAll(re)].length;

          changeInSelectionLength += (resolvedReplace?.length - matches[0][0].length + numNewLInes);
        }
        selectionStartAdjust = cumulativeChangesInSelectionLength;
        cumulativeChangesInSelectionLength += changeInSelectionLength;

        // length of the whole line - cursorPosition/subStrinIndex
        let originalLength = document.lineAt(selection.start.line).text.length - subStringIndex;

        matchesPerSelection.set(thisSelectionNumber, {
          selectionNumber: thisSelectionNumber,
          numMatches: matches.length,
          matches: matches,
          isSelectionWithMatch: matches.length ? true : false,
          originalLength,
          replacementText: resolvedReplace.replaceAll(/(?!<\r)\n/g, '\r\n'),
          cumulativeChangesInSelectionLength,
          selectionStartIndex,
          selectionStartAdjust
        });
      }
      thisSelectionNumber++;
      index++;
    };

    let selectionIndex;
    let index2 = 0;

    // remove selections that had no matches
    uniqueSelections = uniqueSelections.filter((selection, thisIndex) => !removeFromSelections.includes(thisIndex));

    for await (const match of foundMatches) {


      // skip these, no matches in these selections/lines
      // if (!removeFromSelections.includes(index2)) {

      const currentWordRange = document.getWordRangeAtPosition(uniqueSelections[index2].active) || uniqueSelections[index2];

      if (args.restrictFind === "onceIncludeCurrentWord") selectionIndex = document.offsetAt(currentWordRange.start);
      else selectionIndex = document.offsetAt(currentWordRange.end);

      const startPos = document.positionAt(selectionIndex + match.index);
      const endPos = document.positionAt(selectionIndex + match.index + match[0].length);
      foundSelections.push(new Selection(startPos, endPos));
      index2++;
    };

    // do this so editBuilder will select the replacements, but have originalSelectons for later
    if (foundSelections.length) editor.selections = foundSelections;

    if (textEdits.length) {  
      await editor.edit(editBuilder => {
        textEdits.forEach(async textEdit => {
          await editBuilder.replace(textEdit.range, textEdit.newText);
        });
      });
    }
        
    if (args.preserveSelections && foundSelections.length) editor.selections = originalSelectons;

    if (args.cursorMoveSelect && !args.preserveSelections) {

      // remove empty entries
      lines = Object.values(lines);
      lineMatches = Object.values(lineMatches);

      let index = 0;
      const iter = matchesPerSelection.values();

      for await (const line of lines) {

        const combinedMatches = await transforms.combineMatches(Array.from(lineMatches[index]));

        let originalLength = 0, replacementText = '', selectionStartIndex = 0, selectionStartAdjust = 0, cumulativeChangesInSelectionLength = 0;

        // works since Map items are added and retrieved in insertion order
        const item = iter.next();
        if (!item.done)
          ({ selectionStartIndex, originalLength, replacementText, selectionStartAdjust, cumulativeChangesInSelectionLength } = item.value);  // the !item.done is not strictly necessary
        else break;

        let cursorMoveSelect = await resolve.resolveVariables(args, "cursorMoveSelect", combinedMatches, null, null, index);
        cursorMoveSelect = await resolve.adjustCMSValueForRegex(cursorMoveSelect, args.isRegex, args.matchWholeWord);

        subStringIndex = subStringIndices[index];

        if (cursorMoveSelect.length) {

          const startPos1 = document.positionAt(selectionStartIndex + selectionStartAdjust);
          const endPos1 = document.positionAt(selectionStartIndex + originalLength + cumulativeChangesInSelectionLength);
          const currentLine = document.getText(new Range(startPos1, endPos1));

          let cmsMatches;
          let startPos, endPos;

          if (cursorMoveSelect === "^(?!\n)" || cursorMoveSelect === "$(?!\n)") {
            cmsMatches = [...currentLine.matchAll(new RegExp(replacementText, args.regexOptions))];

            // put cursor at the old start of the first once... match
            if (cursorMoveSelect === "^(?!\n)") {
              startPos = document.positionAt(selectionStartIndex + selectionStartAdjust + cmsMatches[0].index);
              foundCMSSelections.push(new Selection(startPos, startPos));
            }
            // put cursor at the new end of the first once... match, which may be after any newlines have been added
            else if (cursorMoveSelect === "$(?!\n)") {
              endPos = document.positionAt(selectionStartIndex + selectionStartAdjust + cmsMatches[0].index + cmsMatches[0][0].length);
              foundCMSSelections.push(new Selection(endPos, endPos));
            }
          }
          else {
            cmsMatches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

            if (cmsMatches.length) {
              startPos = document.positionAt(selectionStartIndex + selectionStartAdjust + cmsMatches[0].index);
              endPos = document.positionAt(selectionStartIndex + selectionStartAdjust + cmsMatches[0].index + cmsMatches[0][0].length);
              foundCMSSelections.push(new Selection(startPos, endPos));
            }
          }
        }
        index++;
      }
    }  // end of if cursorMoveSelect

    if (args.cursorMoveSelect && foundCMSSelections?.length && !args.preserveSelections) {
      editor.selections = foundCMSSelections;
      // if cursorMoveSelect, always reveal the first cms foundSelection
      editor.revealRange(new Range(foundCMSSelections[0].start, foundCMSSelections[0].end), 2);
    }

    if (!args.cursorMoveSelect && foundSelections.length) {
      const selectionToReveal = await utilities.getSelectionToReveal(foundSelections, cursorPosition, "next");
      editor.revealRange(new Range(selectionToReveal.start, selectionToReveal.end), 2);
    }
    // }
  }  // end of "once"

  if (args.run) await transforms.runWhen(args, foundMatches, foundSelections, editor.selection);

  // TODO: test below, so original find/replace is still selected (after run)
  // if (foundSelections.length && args.run) Object.assign(foundSelections, editor.selections);

  if (args.postCommands) await prePostCommands.runPost(args, foundMatches, foundSelections, editor.selection);
};


