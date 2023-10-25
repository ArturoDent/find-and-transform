const { window, WorkspaceEdit, TextEdit, Range, Position, Selection, workspace } = require('vscode');

const commands = require('../commands');
const resolve = require('../resolveVariables');
const utilities = require('../utilities');
const transforms = require('../transform');


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
  
  let currentLine = "";
  let matches = [];
  let foundMatches = [];
  let foundSelections = [];
  let emptySelections = [];
  let lines = []; 
  let lineMatches = [];
  let uniqueSelections = [];
  let foundCMSSelections = [];  // cursorMoveSelect matches
  
  const wsEdit = new WorkspaceEdit();
  const textEdits = [];  // TextEdit[]
  
  
  uniqueSelections.push(editor.selections[0]);
  lines.push(uniqueSelections[0].active.line);
  
  editor.selections.forEach(selection => {
    if (!lines.includes(selection.active.line)) {
      uniqueSelections.push(selection);
      lines.push(selection.active.line);
    }
  });

  lines = [];  // reused, OK to clear

  if (args.restrictFind === "line") {

    // get all the matches on the line
    let lineIndex;
      
  // await editor.edit(async function (edit) {

    let index = 0;
    
    for await (const selection of uniqueSelections) {

      args.find = findArg; // reset to the original args.find
      let resolvedFind;
        
      // call makeFind(selections, args) here with currentLine selections only
      if (!args.find) {
        const lineSelections = editor.selections.filter(eachSelection => eachSelection.active.line === selection.active.line);
        const findObject = resolve.makeFind(lineSelections, args);
        ({ find: args.find, emptyPointSelections: args.pointReplaces } = findObject);
        args.madeFind = true;
        args.isRegex ||= findObject.mustBeRegex;
      }
      
      if (!args.find) return;
        
      resolvedFind = await resolve.resolveVariables(args, "find", null, selection, null, index);
      // resolvedFind = resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.madeFind);
      const findObject = await resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.madeFind);
      resolvedFind = findObject.findValue;
      args.isRegex = findObject.isRegex;
      
      if (!resolvedFind && !args.replace) return;

      const re = new RegExp(resolvedFind, args.regexOptions);
      currentLine = document.getText(document.lineAt(selection.active.line).rangeIncludingLineBreak);
      currentLine = currentLine?.replace(/\r?\n/g, ''); // probably handled below

      if (resolvedFind)
        matches = [...currentLine.matchAll(re)];
      else {
        const match = { index: selection.active.character };
        match[0] = "";
        matches.push(match);
      }
        
      matches?.forEach(match => {
          
        lineIndex = document.offsetAt(new Position(selection.active.line, 0));
        const startPos = document.positionAt(lineIndex + match.index);
        const endPos = document.positionAt(lineIndex + match.index + match[0].length);
        foundSelections.push(new Selection(startPos, endPos));
        foundMatches.push(match);
      });

      // TODO?: utilities.getSelectionToReveal() after, get cursor here
      // only works for one line at a time
      if (!args.preserveSelections && foundSelections.length) editor.selections = foundSelections;  // do this later?

      matches?.forEach(async match => {
          
        lineIndex = document.offsetAt(new Position(selection.active.line, 0));
        let resolvedReplace = await resolve.resolveVariables(args, "replace", match, foundSelections[index], null, index);

        const startPos = document.positionAt(lineIndex + match.index);
        const endPos = document.positionAt(lineIndex + match.index + match[0].length);
        const matchRange = new Range(startPos, endPos);
        
        // edit.replace(matchRange, resolvedReplace); // 'Error: Overlapping ranges are not allowed!`
        textEdits.push(new TextEdit(matchRange, resolvedReplace));
        
        lineMatches[index] = match;
        lines[index++] = startPos.line;
      });
    };
  
    wsEdit.set(editor.document.uri, textEdits);
    await workspace.applyEdit(wsEdit);
    
    // textEdits.map(edit => {
    //   const endPos = new Position(edit.range.end.line, edit.range.start.character + edit.newText.length);
    //   foundSelections.push(new Selection(edit.range.start, endPos));
    // })
    
    // editor.selections = foundSelections; 
    
    if (args.cursorMoveSelect) {
  
      // foundSelections = [];
      let index = 0;
      let combinedMatches;
      
      if (foundMatches) 
        combinedMatches = await transforms.combineMatches(Array.from(foundMatches));
      // else 

      for (const line of lines) {

        let cursorMoveSelect = await resolve.resolveVariables(args, "cursorMoveSelect", combinedMatches, null, null, index);
        
        // let cursorMoveSelect = await resolve.resolveCursorMoveSelect(args.cursorMoveSelect, matches.length, combinedMatches, null, index);
        cursorMoveSelect = await resolve.adjustCMSValueForRegex(cursorMoveSelect, args.isRegex, args.matchWholeWord);
        index++;

        if (cursorMoveSelect.length) {

          currentLine = document.lineAt(line).text;
          lineIndex = document.offsetAt(document.lineAt(line).range.start);

          const cmsMatches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

          for (const match of cmsMatches) {
            const startPos = document.positionAt(lineIndex + match.index);
            const endPos = document.positionAt(lineIndex + match.index + match[0].length);
            foundCMSSelections.push(new Selection(startPos, endPos));
          }
        }
        if (!foundCMSSelections.length) emptySelections.push(new Selection(new Position(line, 0), new Position(line, 0)));
      }
      // reveal the first match on the line, if cms foundSelections
      if (foundCMSSelections.length) editor.revealRange(new Range(foundCMSSelections[0].start, foundCMSSelections[0].end), 2);
    }

    if (args.cursorMoveSelect && foundCMSSelections?.length) editor.selections = foundCMSSelections;
    else editor.selections = emptySelections;  // clear all selections

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
    let lineIndex;
    let subStringIndex;
    let lines = [];
    let subStringIndices = [];
    let matches = [];     // for cursorMoveSelect

    let index = 0;
    for await (const selection of uniqueSelections) {
      
      args.find = findArg; // reset to the original args.find
      // foundSelections = [];
      
      // call makeFind(selections, args) here with currentLine selections only
      if (!args.find) {
        const lineSelections = editor.selections.filter(eachSelection => eachSelection.active.line === selection.active.line);
        const findObject = resolve.makeFind(lineSelections, args);
        ({ find: args.find, emptyPointSelections: args.pointReplaces } = findObject);
        args.madeFind = true;
        args.isRegex ||= findObject.mustBeRegex;
      }
      if (!args.find) return;
      
      // because caller = find, no need to resolve.resolveFind, which is async
      let resolvedFind = await resolve.resolveVariables(args, "find", null, selection, null, index);
      const findObject = await resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.madeFind);
      resolvedFind = findObject.findValue;
      args.isRegex = findObject.isRegex;
      
      if (!resolvedFind && !args.replace) return;  // correct here or already handled in findAndSelect?

      const re = new RegExp(resolvedFind, args.regexOptions);
      fullLine = document.getText(document.lineAt(selection.active.line).rangeIncludingLineBreak);

      const currentWordRange = document.getWordRangeAtPosition(selection.active) || selection;
      
      if (args.restrictFind === "onceIncludeCurrentWord") subStringIndex = currentWordRange.start.character;
      else subStringIndex = currentWordRange.end.character;
      
      if (args.restrictFind === "onceIncludeCurrentWord") currentLine = fullLine.substring(subStringIndex);
      else currentLine = fullLine.substring(subStringIndex);  // once/onceExcludeCurrentWord

      // use matchAll() to get index even though only using the first one
      matches = [...currentLine.matchAll(re)];
      
      if (matches.length) {  // just do once

        let selectionIndex;
        if (args.restrictFind === "onceIncludeCurrentWord") selectionIndex = document.offsetAt(currentWordRange.start);
        else selectionIndex = document.offsetAt(currentWordRange.end);
        
        const startPos = document.positionAt(selectionIndex + matches[0].index);
        const endPos = document.positionAt(selectionIndex + matches[0].index + matches[0][0].length);
        foundSelections[index] = new Selection(startPos, endPos);
        
        if (!args.preserveSelections && foundSelections.length) editor.selections = foundSelections;

        lineIndex = document.offsetAt(new Position(selection.end.line, 0));
        let resolvedReplace = await resolve.resolveVariables(args, "replace", matches[0], foundSelections[index], null, index);

        const matchRange = new Range(startPos, endPos);

        // edit.replace(matchRange, resolvedReplace);
        textEdits.push(new TextEdit(matchRange, resolvedReplace));
        
        lines[index] = startPos.line;
        lineMatches[index] = matches;
        foundMatches.push(matches[0]);
        
        // so cursorMoveSelect is only **after** a once match
        subStringIndices[index] = subStringIndex + matches[0].index;
      }
      index++;
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
      
      for (const line of lines) {
        
        const combinedMatches = await transforms.combineMatches(Array.from(lineMatches[index]));
        
        let cursorMoveSelect = await resolve.resolveVariables(args, "cursorMoveSelect", combinedMatches, null, null, index);
        // let cursorMoveSelect = await resolve.resolveCursorMoveSelect(args.cursorMoveSelect, matches.length, combinedMatches, null, index);
        cursorMoveSelect = await resolve.adjustCMSValueForRegex(cursorMoveSelect, args.isRegex, args.matchWholeWord);

        if (cursorMoveSelect !== "^(?!\n)") subStringIndex = subStringIndices[index];
          // is the below accurate? check
        else subStringIndex = 0;
        index++;

        currentLine = document.lineAt(line).text.substring(subStringIndex);
        lineIndex = document.offsetAt(document.lineAt(line).range.start);
        const cmsMatches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

        if (cmsMatches.length) {  // just select the first/once cursorMoveSelect match
          const startPos = document.positionAt(lineIndex + subStringIndex + cmsMatches[0].index);
          const endPos = document.positionAt(lineIndex + subStringIndex + cmsMatches[0].index + cmsMatches[0][0].length);
          foundCMSSelections.push(new Selection(startPos, endPos));
        }
      }
    }  // end of if cursorMoveSelect
    
    if (args.cursorMoveSelect && foundCMSSelections?.length) {
      editor.selections = foundCMSSelections;
      // if cursorMoveSelect, always reveal the first cms foundSelection
      editor.revealRange(new Range(foundCMSSelections[0].start, foundCMSSelections[0].end), 2);
    }
    
    if (!args.cursorMoveSelect && foundSelections.length) {
      const selectionToReveal = await utilities.getSelectionToReveal(foundSelections, cursorPosition, "next");
      editor.revealRange(new Range(selectionToReveal.start, selectionToReveal.end), 2);
    }
  }  // end of "once"
  
  await transforms.runWhen(args, foundMatches, foundSelections, editor.selection);
  
  // TODO: test below, so original find/replace is still selected (after run)
  if (foundSelections.length && args.run) Object.assign(foundSelections, editor.selections);
  
  // if ((lineMatches.length || args.run) && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands");
  if ((lineMatches.length || args.run) && args.postCommands) await transforms.runPostCommands(args, foundMatches, foundSelections, editor.selection);
};