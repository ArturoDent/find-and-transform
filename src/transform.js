const { window, Range, Position, Selection } = require('vscode');
const commands = require('./commands');
const resolve = require('./resolveVariables');
const utilities = require('./utilities');


/**
 * Add any empty/words at cursor position to the editor.selections.
 * Modifies existing selections.
 * @param {window.activeTextEditor} editor
 */
exports.addEmptySelectionMatches = async function (editor) {

  const { document } = window.activeTextEditor;

  await Promise.all(editor.selections.map(async (selection) => {

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
  }));
};


/**
 * If find but no replace, just select all matches in entire document or pre-existing selections
 * while removing all the original selections. 
 * Also covers no find/no replace, but not no find/replace b/c that is covered elsewhere.
 *
 * @param {import("vscode").TextEditor} editor
 * @param {Object} args - keybinding/settings args
 */
exports.findAndSelect = async function (editor, args) {

  const document = editor.document;
  let foundSelections = [];
  let matches;
  let foundMatches = [];
  
  if (args.restrictFind === "document") {

    let docRange;
    let fullText;

    // an undefined find will be converted to the empty string already, find = ''
    const findObject = await resolve.resolveFind(editor, args, null, null);
    const resolvedFind = findObject.findValue;
    args.isRegex = findObject.isRegex;

    if (resolvedFind) {

      if (resolvedFind?.search(/\$\{line(Number|Index)\}/) !== -1) {
        // lineCount is 1-based, so need to subtract 1 from it
        const lastLineRange = document?.lineAt(document.lineCount - 1).range;
        docRange = new Range(0, 0, document?.lineCount - 1, lastLineRange?.end?.character);
        matches = _buildLineNumberMatches(resolvedFind, docRange);
      }

      // else get all the matches in the document, resolvedFind !== lineNumber/lineIndex
      else if (resolvedFind.length) {
        fullText = document.getText();
        matches = [...fullText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
      }
      
      // Any way to designate a capture group to select, like '\\$1(\\d+)' ?
      matches?.forEach((match, index) => {
        const startPos = document?.positionAt(match.index);
        const endPos = document?.positionAt(match.index + match[0].length);
        const thisSelection = new Selection(startPos, endPos);
        foundSelections[index] = thisSelection;
        foundMatches.push(match);
      });
      
      
      // get cursor position first, before applying foundSelections to editor.Selections
      // if madeFind then there was no find, and editor.selection.active will always be less than that same foundSelection
      const cursorPosition = document?.getWordRangeAtPosition(editor.selection.active)?.end || editor.selection.end;

      // if (!args.preserveSelections && foundSelections.length) editor.selections = foundSelections;
      if (foundSelections.length) editor.selections = foundSelections;
      
      // what if multiple cursors?

      if (foundSelections.length && args.reveal) {
        const selectionToReveal = await utilities.getSelectionToReveal(foundSelections, cursorPosition, args.reveal);
        editor?.revealRange(new Range(selectionToReveal.start, selectionToReveal.end), 2);
      }
    }
  }

  else {  // restrictFind === "selections/once/onceIncludeCurrentWord/onceExcludeCurrentWord/line"

    let selectedRange;
    let lineMatches = []; // to keep track of which lines have been processed for once...
    
    await Promise.all(editor.selections.map(async (selection) => {
      
      if (!args.find && args.restrictFind !== "selections") {
        const lineSelections = editor.selections.filter(eachSelection => eachSelection.active.line === selection.active.line);
        const findObject = resolve.makeFind(lineSelections, args);
        ({ find: args.find, emptyPointSelections: args.pointReplaces } = findObject);
        args.madeFind = true;
        args.isRegex ||= findObject.mustBeRegex;
      }
      const findObject = await resolve.resolveFind(editor, args, null, selection);
      const resolvedFind = findObject.findValue;
      args.isRegex = findObject.isRegex;
      
      let searchText;

      if (args.restrictFind === "selections") {

        if (selection.isEmpty) {
          // pointSelections here?
          selectedRange = document.getWordRangeAtPosition(selection.start);
        }
        else selectedRange = new Range(selection.start, selection.end);
        if (!selectedRange) return;

        if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1)
          matches = _buildLineNumberMatches(resolvedFind, selectedRange);

        else if (resolvedFind?.length) {
          searchText = document.getText(selectedRange);
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
        }
        
        matches?.forEach((match) => {
          const selectionStartIndex = document.offsetAt(selectedRange.start);
          const startPos = document.positionAt(selectionStartIndex + match.index);
          const endPos = document.positionAt(selectionStartIndex + match.index + match[0].length);
          // reveal will use the **last** selection's foundSelections
          foundSelections.push(new Selection(startPos, endPos));
          foundMatches.push(match);
        });
        // if (foundSelections.length) editor.revealRange(new Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
      }
      
      else if (args.restrictFind === "matchAroundCursor") { 
        
        let [foundSelection, foundMatch] = _matchAroundCursor(args, resolvedFind, selection);
        if (foundSelection) foundSelections.push(foundSelection);
        if (foundMatch) foundMatches.push(foundMatch);
        
        // foundLineIndex (like in replaceInWholeDocument) not needed for findAndSelect since no replace
        // let [foundSelection, foundMatch, foundLineIndex] = _matchAroundCursor(args, resolvedFind, selection);
        // if (typeof foundLineIndex === 'number') lineIndices.push(foundLineIndex);   // so handles the 0 case
      }

      else if (args.restrictFind === "line") {

        let lineIndex = 0;

        if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
          let selectedLineRange = document.lineAt(selection.active.line).range;
          matches = _buildLineNumberMatches(resolvedFind, selectedLineRange);
        }
        else if (resolvedFind?.length) {
          searchText = document.lineAt(selection.active.line).text;
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
          lineIndex = document.offsetAt(new Position(selection.active.line, 0));
        }

        matches?.forEach((match) => {
          const startPos = document.positionAt(lineIndex + match.index);
          const endPos = document.positionAt(lineIndex + match.index + match[0].length);
          foundSelections.push(new Selection(startPos, endPos));
          foundMatches.push(match);
        });
      }

      else if (args.restrictFind?.startsWith("once")) {

        let lineIndex = 0;
        let subStringIndex;
        const currentWordRange = document.getWordRangeAtPosition(selection.active);

        if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
          
          let lineRange = document.lineAt(selection.active.line).range;
          let subLineRange = lineRange.with({ start: selection.active });
          
          if ((args.restrictFind === "onceIncludeCurrentWord") && currentWordRange)
            subLineRange = lineRange.with({ start: document.getWordRangeAtPosition(selection.active)?.start });
          // else 

          matches = _buildLineNumberMatches(resolvedFind, subLineRange);
        }

        else if (resolvedFind?.length) {
          const fullLine = document.lineAt(selection.active.line).text;
          const wordRangeAtCursor = document.getWordRangeAtPosition(selection.active);
          searchText = fullLine.substring(selection?.end?.character);  // once, onceExcludeCurrentWord
          
          if ((args.restrictFind === "onceIncludeCurrentWord") && wordRangeAtCursor?.start) {
            searchText = fullLine.substring(wordRangeAtCursor?.start?.character);
          }
          if (!searchText) return;
          
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
        }
        
        if (matches.length > 1) matches = [matches[0]];  // handles two+ matches in one line with one selection
          
        if (matches?.length) {
          
          const lineIndex = document.offsetAt(new Position(selection.active.line, 0));
          let subStringIndex = selection.active?.character;
          let doContinue = true;
          
          // TODO extract to a function?: doContinue = func(lineIndex, subStringIndex, lineMatches);  return {doContinue, foundIndex}?
          const sameLineFound = lineMatches.findIndex(lineMatch => lineMatch.lineIndex === lineIndex);
          
          if (sameLineFound !== -1) {
            const foundHigherIndex = lineMatches.findIndex(lineMatch => (lineMatch.lineIndex === lineIndex) && (lineMatch.subStringIndex > subStringIndex));
            if (foundHigherIndex !== -1) {
              lineMatches.splice(foundHigherIndex, 1);
              // TODO remove from foundSelections and foundMatches too
              foundSelections.splice(foundHigherIndex, 1);
              foundMatches.splice(foundHigherIndex, 1);
            }
            else {
              const foundLowerIndex = lineMatches.findIndex(lineMatch => (lineMatch.lineIndex === lineIndex) && (lineMatch.subStringIndex > subStringIndex));
              if (foundLowerIndex === -1)
                doContinue = false;
              // const foundLowerIndex = lineMatches.findIndex(lineMatch => (lineMatch.lineIndex === lineIndex) && (lineMatch.subStringIndex > subStringIndex));
              // lineMatches.push({ lineIndex, subStringIndex });
            }
            // else continue;// abort the loop, return/continue?
          }
          
          if (doContinue) {
            
            lineMatches.push({ lineIndex, subStringIndex });
        
            if ((args.restrictFind === "onceIncludeCurrentWord") && currentWordRange) {
              subStringIndex = currentWordRange?.start?.character;
            }

            const startPos = document.positionAt(lineIndex + subStringIndex + matches[0].index);
            const endPos = document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
            foundSelections.push(new Selection(startPos, endPos));
            foundMatches.push(matches[0]);
          }
        }
      }
    }));

    // get cursor position first, before applying foundSelections to editor.Selections
    // if madeFind then there was no find, and editor.selection.active will always be less than that same foundSelection
    
    const cursorPosition = args.madeFind ? document.getWordRangeAtPosition(editor.selection.active)?.end : editor.selection.active;

    if (foundSelections.length) editor.selections = foundSelections;

    if (foundSelections.length && args.reveal) {
      const selectionToReveal = await utilities.getSelectionToReveal(foundSelections, cursorPosition, args.reveal);
      editor.revealRange(new Range(selectionToReveal.start, selectionToReveal.end), 2);
    }
  }
  
  _runWhen(args, foundMatches, foundSelections, editor.selection);
  
  // sendSequence will resolve certain vars automatically
  // if sendSequence or type commands, loop here through multiple commands?
  // insertSnippet has args.name or args.snippet, not args.text
  
  if (args.postCommands) await _runPostCommands(args, foundMatches, foundSelections, editor.selection);
  // if ((foundSelections.length || args.run) && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands");
};

/**
 * Run the args.run and args.runWhen, no return
 * 
 * @param {Object} args
 * @param {string} resolvedFind
 * @param {Selection} selection - the editor.selection
 * 
 */
function _matchAroundCursor (args, resolvedFind, selection) {

  const document = window.activeTextEditor.document;
  let lineIndex = 0;
  let matches = [];
  let foundSelection;
  let foundMatch;

  if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
    let selectedLineRange = document.lineAt(selection.active.line).range;
    matches = _buildLineNumberMatches(resolvedFind, selectedLineRange);
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
      // foundSelections.push(thisSelection);
      // foundMatches.push(match);
      foundSelection = thisSelection;
      foundMatch = match;
      return true;
    }
  });
  // if (foundMatch.length) return { foundSelections, foundMatches };
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
function _runWhen (args, foundMatches, foundSelections, selection) {

  if (args.run && foundMatches.length) {
    if (args.runWhen === "onEveryMatch") {
      foundSelections.map((foundSelection, index) => {
        resolve.resolveVariables(args, "run", foundMatches[index], foundSelection, null, null);
      });
    }
    else if (!args.runWhen || args.runWhen === "onceIfAMatch")  // uses first match and first selection = editor.selection
      resolve.resolveVariables(args, "run", foundMatches[0], foundSelections[0], null, null);
  }
  else if (args.run && args.runWhen === "onceOnNoMatches")
    resolve.resolveVariables(args, "run", null, selection, null, null);  // no matches, run once
}

/**
 * Resolve any variables in the args.postCommands
 * 
 * @param {Object} args
 * @param {Array} foundMatches
 * @param {Array<Selection>} foundSelections
 * @param {Selection} selection - the editor.selection
 * @param {Number} index
 * @returns {Object} args - with any variables resolved in each postCommand
 */
function _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, index) {
  
  const editor = window.activeTextEditor;
  
  // for multiple commands within a single args.postCommands
  function _loopPostCommands(args,  foundMatch, foundSelection, selection, index) {
    if (Array.isArray(args.postCommands)) {
      // let index = 0;
      // args.postCommands.forEach((command, index) => {
      args.postCommands.forEach((command) => {
        if (command?.args?.text)
          // use foundMatches[index]?
          command.args.text = resolve.resolveVariables(args, "postCommands", foundMatch, selection, null, index);
      });
    }
    // TODO if not an array
    else args.postCommands.args.text = resolve.resolveVariables(args, "postCommands", foundMatch, selection, null, index);
  };
  
  _loopPostCommands(args, foundMatches[index], foundSelections[index], selection, index);
  
  // if (foundMatches.length) {
  //   if (args.runPostCommands === "onEveryMatch") {
  //     // foundSelections.map((foundSelection, index) => {
  //       _loopPostCommands(args, foundMatches[index], foundSelections[index], selection);
  //     // });
  //   }
  //   else if (!args.runPostCommands || args.runPostCommands === "onceIfAMatch") {// uses first match and first selection = editor.selection
  //     _loopPostCommands(args, foundMatches[0], foundSelections[0], selection);
  //   }
  // }
  // else if (args.runPostCommands === "onceOnNoMatches") {
  //   _loopPostCommands(args, foundMatches[0], foundSelections[0], selection);
  // }
  
  return args.postCommands;
}

/**
 * Run the args.postCommands and args.runPostCommands, no return
 * 
 * @param {Object} args
 * @param {Array} foundMatches
 * @param {Array<Selection>} foundSelections
 * @param {Selection} selection - editor.selection
 * 
 */
async function _runPostCommands(args, foundMatches, foundSelections, selection) {
  
  let postCommands;
  const argHasText = (command) => command.args.text;

  if ((Array.isArray(args.postCommands) && args.postCommands?.some(argHasText)) || args.postCommands?.args?.text) {

    if (foundMatches.length) {
      if (args.runPostCommands === "onEveryMatch") {
        foundSelections.map(async (foundSelection, index) => {
        // foundMatches.map(async (foundMatch, index) => {
          // _resolvePostCommandVariables calls the async resolveVariables() so this doesn't work for
          //    multiple selections
          postCommands = _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, index);
          await commands.runPrePostCommands(postCommands, "postCommands");
        });
      }
      else if (!args.runPostCommands || args.runPostCommands === "onceIfAMatch") { // uses first match and first selection = editor.selection
        postCommands = _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, 0);
        await commands.runPrePostCommands(postCommands, "postCommands");
      }
    }
    else if (args.runPostCommands === "onceOnNoMatches") {
      postCommands = _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, 0);
      await commands.runPrePostCommands(postCommands, "postCommands");  // no matches, run once
    }
  }
}


/**
 * Replace find matches on the current line.
 *
 * @param {window.activeTextEditor} editor
 * @param {import("vscode").TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInLine = async function (editor, edit, args) {

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
  
  
  uniqueSelections.push(editor.selections[0]);
  lines.push(uniqueSelections[0].active.line);
  
  editor.selections.forEach(selection => {
    if (!lines.includes(selection.active.line)) {
      uniqueSelections.push(selection);
      lines.push(selection.active.line);
    }
  });

  lines = [];

  if (args.restrictFind === "line") {

    // get all the matches on the line
    let lineIndex;
    let index = 0;
      
    await editor.edit(async function (edit) {

      let index = 0;
      
      await Promise.all(uniqueSelections.map(async (selection) => {

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
          
        resolvedFind = resolve.resolveVariables(args, "find", null, selection, null, index);
        // resolvedFind = resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.madeFind);
        const findObject = resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.madeFind);
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

        matches?.forEach(match => {
            
          lineIndex = document.offsetAt(new Position(selection.active.line, 0));
          let resolvedReplace = resolve.resolveVariables(args, "replace", match, foundSelections[index], null, index);

          const startPos = document.positionAt(lineIndex + match.index);
          const endPos = document.positionAt(lineIndex + match.index + match[0].length);
          const matchRange = new Range(startPos, endPos);
          edit.replace(matchRange, resolvedReplace); // 'Error: Overlapping ranges are not allowed!`
          lineMatches[index] = match;
          lines[index++] = startPos.line;
        });
      }));
    })
    .then(async success => {
      if (!success) {
        return;
      }

      if (args.cursorMoveSelect) {
    
        // foundSelections = [];
        let index = 0;
        const combinedMatches = await _combineMatches(Array.from(matches));

        for (const line of lines) {

          let cursorMoveSelect = await resolve.resolveCursorMoveSelect(args.cursorMoveSelect, matches.length, combinedMatches, null, index);
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
    });
  }  // end of line

  else if (args.restrictFind?.startsWith("once")) {

    let fullLine = "";
    let lineIndex;
    let subStringIndex;
    let lines = [];
    let subStringIndices = [];
    let matches = [];     // for cursorMoveSelect

    await editor.edit(async function (edit) {

      let index = 0;
      await Promise.all(uniqueSelections.map(async (selection) => {
        
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
        let resolvedFind = resolve.resolveVariables(args, "find", null, selection, null, index);
        const findObject = resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.madeFind);
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
          let resolvedReplace = resolve.resolveVariables(args, "replace", matches[0], foundSelections[index], null, index);

          const matchRange = new Range(startPos, endPos);

          edit.replace(matchRange, resolvedReplace);
          lines[index] = startPos.line;
          lineMatches[index] = matches;
          foundMatches.push(matches[0]);
          
          // so cursorMoveSelect is only **after** a once match
          subStringIndices[index] = subStringIndex + matches[0].index;
        }
        index++;
      }));
      
    }).then(async success => {
      if (!success) {
        return;
      }

      if (args.cursorMoveSelect) {

        let index = 0;
        
        for (const line of lines) {
          
          const combinedMatches = await _combineMatches(Array.from(lineMatches[index]));
          
          let cursorMoveSelect = await resolve.resolveCursorMoveSelect(args.cursorMoveSelect, matches.length, combinedMatches, null, index);
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
      }
    });
    
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
  
  _runWhen(args, foundMatches, foundSelections, editor.selection);
  if ((lineMatches.length || args.run) && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands");
};

/**
 * Replace the previous or next find match in the entire document
 * Select or not
 *
 * @param {window.activeTextEditor} editor
 * @param {import("vscode").TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replacePreviousOrNextInWholeDocument = async function (editor, edit, args) {

  // make work for multiple selections ?? TODO
  const document = editor.document;
  let resolvedReplace;
  let matchEndPos;

  let previous = args.restrictFind?.startsWith('previous') || false;
  let next = args.restrictFind?.startsWith('next') || false;

  let nextMatches;
  let previousMatches;
  let match;

  const docString = document.getText();
  let cursorIndex = document.offsetAt(editor.selection.active);

  // const resolvedFind = await resolve.resolveFind(editor, args, null, null);
  const findObject = await resolve.resolveFind(editor, args, null, null);
  const resolvedFind = findObject.findValue;
  args.isRegex = findObject.isRegex;

  if (!resolvedFind) return;

  if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
    // lineCount is 1-based, so need to subtract 1 from it
    const lastLineRange = document.lineAt(document.lineCount - 1).range;
    const restOfDocRange = new Range(editor.selection.active.line, editor.selection.active.character, document.lineCount - 1, lastLineRange.end.character);
    nextMatches = _buildLineNumberMatches(resolvedFind, restOfDocRange);

    const docRangeBeforeCursor = new Range(0, 0, editor.selection.active.line, editor.selection.active.character);
    previousMatches = _buildLineNumberMatches(resolvedFind, docRangeBeforeCursor);
  }
  else {
    const re = new RegExp(resolvedFind, args.regexOptions);
    let restOfDocument = docString.substring(cursorIndex);  // text after cursor
    nextMatches = [...restOfDocument.matchAll(re)];
    
    // TODO test: skip first match if it is the current find location
    if (nextMatches[0]?.index === 0) nextMatches.shift();

    const documentBeforeCursor = docString.substring(0, cursorIndex);
    previousMatches = [...documentBeforeCursor.matchAll(re)];
    
    // TODO test: skip last match if it is the current find location
    const { selection } = window.activeTextEditor;
    if (previousMatches.at(-1)?.index === document.offsetAt(selection.active)) previousMatches.pop();
  }

  // refactor to a function
  if (resolvedFind === "^(?!\n)" || resolvedFind === "$(?!\n)") {
    if (next) {
      if (nextMatches.length > 1) match = nextMatches[1];
      else if (previousMatches.length) {
        match = previousMatches[0];
        cursorIndex = 0;
      }
      else {
        nextMatches = [];
        previousMatches = [];
      }
    }
    else if (previous) {
      if (previousMatches.length > 1) {
        match = previousMatches.at(-2);
        cursorIndex = 0;
      }
      else if (nextMatches.length) {
        match = nextMatches.at(-1);
      }
      else {
        previousMatches = [];
        nextMatches = [];
      }
    }
  }
  else if (previous && previousMatches?.length) {
    match = previousMatches.at(-1);  // the last array item
    cursorIndex = 0;
  }
  else if (previous && !previousMatches?.length && nextMatches.length) {
    match = nextMatches.at(-1);   // the last array item
  }
  else if (next && nextMatches?.length) {
    match = nextMatches[0];
  }
  else if (next && !nextMatches?.length && previousMatches.length) {
    match = previousMatches[0];
    cursorIndex = 0;
  }
  else {
    if (args.run && args.runWhen === "onceOnNoMatches")
      resolve.resolveVariables(args, "run", null, editor.selection, null, null);
    return;
  }

  if (!previousMatches.length && !nextMatches.length) {
    // TODO: is the following necessary after the above resolve.resolveVariables() ?
    if (args.run && args.runWhen === "onceOnNoMatches")
      resolve.resolveVariables(args, "run", null, editor.selection, null, null);
    return;  // no match before or after cursor
  }

  await editor.edit(async function (edit) {

    let index = 0;

    if (args.replace) {
      resolvedReplace = resolve.resolveVariables(args, "replace", match, editor.selection, cursorIndex + match.index, index);
      index++;

      if (args.isRegex) resolvedReplace = resolvedReplace?.replace(/(?<!\r)\n/g, "\r\n");

      const startPos = document.positionAt(cursorIndex + match.index);
      const endPos = document.positionAt(cursorIndex + match.index + match[0].length);
      const matchRange = new Range(startPos, endPos);
      edit.replace(matchRange, resolvedReplace);
    }
  }).then(async success => {
    if (!success) {
      return;
    }

    const matchStartPos = document.positionAt(cursorIndex + match.index);
    if (args.replace) {
      matchEndPos = document.positionAt(cursorIndex + match.index + resolvedReplace?.length);
    }
    else matchEndPos = document.positionAt(cursorIndex + match.index + match[0].length);

    // if previous, put cursor at beginning of word = reverse selection
    // if next, put cursor at end of word = forward selection
    if (args.restrictFind !== "nextDontMoveCursor" && args.restrictFind !== "previousDontMoveCursor") {

      if (args.restrictFind === "nextSelect") editor.selections = [new Selection(matchStartPos, matchEndPos)];
      else if (args.restrictFind === "previousSelect") editor.selections = [new Selection(matchEndPos, matchStartPos)];
      else if (args.restrictFind === "nextMoveCursor") editor.selections = [new Selection(matchEndPos, matchEndPos)];
      else if (args.restrictFind === "previousMoveCursor") editor.selections = [new Selection(matchStartPos, matchStartPos)];

      editor.revealRange(new Range(matchStartPos, matchEndPos), 2);           // InCenterIfOutsideViewport
    }

    else if (args.restrictFind === "nextDontMoveCursor" || args.restrictFind === "previousDontMoveCursor") {
      // 2 = vscode.TextEditorRevealType.InCenterIfOutsideViewport
      editor.revealRange(new Range(matchStartPos, matchEndPos), 2); // why reveal if nextDontMoveCursor
    }   // do nothing, edit already made

    if (args.run && args.runWhen !== "onceOnNoMatches" && match.length)    // so args.run only runs if there is a match
      resolve.resolveVariables(args, "run", match, editor.selection, null, null);
    else if (args.run  && args.runWhen === "onceOnNoMatches" && !match.length)
      resolve.resolveVariables(args, "run", null, editor.selection, null, null);
    
    if ((nextMatches.length || previousMatches.length) && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands");
  });
};


/**
 * If find has ${lineNumber} or ${lineIndex} check match ** on each line **
 * 
 * @param {string} find - value to match
 * @param {Range} range - line or selection range within which to search
 * @returns {Array} of matches
 */
function _buildLineNumberMatches(find, range) {

  const document = window.activeTextEditor.document;

  let matches = [];
  const startLineNumber = range.start.line;
  const endLineNumber = range.end.line;

  for (let line = startLineNumber; line <= endLineNumber; line++) {

    const lineIndex = document.offsetAt(new Position(line, 0));
    let lineText = document.lineAt(line).text;

    // for selections/once/onceIncludeCurrentWord/onceExcludeCurrentWord
    // change lineText to start of wordAtCursor?
    
    if (range.start.line === line) lineText = lineText.substring(range.start.character);
    else if (range.end.line === line) lineText = lineText.substring(0, range.end.character);

    let resolved = find?.replaceAll("${lineNumber}", String(line + 1))?.replaceAll("${lineIndex}", String(line));
    // resolved = await resolve.resolveExtensionDefinedVariables(resolved, {}, "find");  // TODO
    const lineMatches = [...lineText.matchAll(new RegExp(resolved, "g"))];

    for (const match of lineMatches) {
      match["line"] = line;
      if (range.start.line === line) match["index"] = lineIndex + match.index + range.start.character;
      // else match["index"] = lineIndex + match.index;  // don't add range.start.character to non-first line of selections
      else match["index"] = lineIndex + match.index;  // don't add range.start.character to non-first line of selections
      matches.push(match);
    }
  }
  return matches;
}


/**
 * Replace all find matches in the entire document
 *
 * @param {window.activeTextEditor} editor
 * @param {import("vscode").TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInWholeDocument = async function (editor, edit, args) {

  const document = editor.document;
  const cursorPosition = document.getWordRangeAtPosition(editor.selection.active)?.end || editor.selection.end;
  
  let   docRange;
  let   fullText;
  let   matches = [];
  let   resolvedFind = "";
  let   resolvedReplace;
  
  const foundSelections = [];
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
      
      let [foundSelection, foundMatch, foundLineIndex] = _matchAroundCursor(args, resolvedFind, selection);
      if (foundSelection) foundSelections.push(foundSelection);
      if (foundMatch) foundMatches.push(foundMatch);
      if (typeof foundLineIndex === 'number') lineIndices.push(foundLineIndex); // so handles the 0 case
    }));
  }
  
  else {

    if (resolvedFind?.search(/\$\{\s*line(Number|Index)\s*\}/) !== -1) {
      // lineCount is 1-based, so need to subtract 1 from it
      const lastLineRange = document.lineAt(document.lineCount - 1).range;
      docRange = new Range(0, 0, document.lineCount - 1, lastLineRange.end.character);
      matches = _buildLineNumberMatches(resolvedFind, docRange);
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
      // foundSelections[index] = new Selection(startPos, endPos);
      foundSelections.push(new Selection(startPos, endPos));
      foundMatches.push(match);
    });
  }
  
  // TODO to preserve pre-existing selections, don't use below
  if (!args.preserveSelections && foundSelections.length) editor.selections = foundSelections;
  // if (foundSelections.length) editor.selections = foundSelections;  // and so postCommands work on selections

  let lastMatchLengthDiff = 0;

  editor.edit(editBuilder => {

    let index = 0;

    // for (const match of matches) {
    for (const match of foundMatches) {

      resolvedReplace = resolve.resolveVariables(args, "replace", match, editor.selections[index], null, index);

      if (resolvedReplace === "Error: jsOPError") return;    // abort

      if (args.isRegex) resolvedReplace = resolvedReplace?.replace(/(?<!\r)\n/g, "\r\n");  // might be unnecessary

      if (args.restrictFind === 'matchAroundCursor')  lineIndex = lineIndices[index];
      
      const startPos = document.positionAt(match.index + lineIndex);
      const endPos = document.positionAt(match.index + match[0].length + lineIndex);
      
      const matchRange = new Range(startPos, endPos);
      editBuilder.replace(matchRange, resolvedReplace);

      if (args.cursorMoveSelect) {  // to be useed in cursorMoveSelect below to build matching text
        matches[index].range = new Range(startPos, new Position(startPos.line, startPos.character + resolvedReplace?.length));
        matches[index].lastMatchLengthDiff = lastMatchLengthDiff;
        lastMatchLengthDiff += (resolvedReplace?.length - match[0].length);
        matches[index].replaceLength = resolvedReplace?.length;
      }
      
      index++;
    }
  }).then(async (resolved) => {
    if (!resolved) {
      return;
    }
    if (args.cursorMoveSelect) {

      const foundSelections = [];
      let index = 0;
      
      const combinedMatches = await _combineMatches(Array.from(matches));

      for (const match of matches) {

        let cursorMoveSelect = await resolve.resolveCursorMoveSelect(args.cursorMoveSelect, matches.length, combinedMatches, null, index);
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
            foundSelections.push(new Selection(startPos, endPos));
          }
        }
      }
      if (foundSelections.length) editor.revealRange(new Range(foundSelections[0].start, foundSelections[0].end), 2);
      index++;
    }
    
    if (foundSelections.length && args.reveal && !args.cursorMoveSelect) {
      const selectionToReveal = await utilities.getSelectionToReveal(foundSelections, cursorPosition, args.reveal);
      editor.revealRange(new Range(selectionToReveal.start, selectionToReveal.end), 2);
    }
    
    _runWhen(args, foundMatches, foundSelections, editor.selection);
    if (foundMatches.length && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands");
  });
};

/**
 * Replace matches within each selection range
 *
 * @param {window.activeTextEditor} editor - the active editor
 * @param {import("vscode").TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInSelections = async function (editor, edit, args) {

  const originalFindArg = args.find;
  const originalisRegexArg = args.isRegex;
  
  const document = editor.document;

  let   isSelectionWithMatch = false;  // at least one
  let   resolvedFind;
  let   resolvedReplace;
  let   matches;
  let   matchesPerSelection = new Set();
  const foundMatches = [];
  const foundSelections = [];

  // editor.edit(async function (edit) {
  editor.edit(function (edit) {

    let index = 0;

    // await Promise.all(editor.selections.map(async (selection, thisSelectionNumber) => {
    Promise.all(editor.selections.map(async (selection, thisSelectionNumber) => {

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
        resolvedFind = resolve.resolveVariables(args, "find", null, selection, null, index);
      else
        resolvedFind = resolve.resolveVariables(args, "ignoreLineNumbers", null, selection, null, index);

      // resolvedFind = resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.madeFind);
      const obj = resolve.adjustValueForRegex(resolvedFind, args.replace, args.isRegex, args.matchWholeWord, args.madeFind);
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
        matches = _buildLineNumberMatches(resolvedFind, selectedRange);
        selectionStartIndex = 0;
      }

      else {
        const re = new RegExp(resolvedFind, args.regexOptions);
        const selectedText = document.getText(selectedRange);
        matches = [...selectedText.matchAll(re)];
      }
      
      for (const match of matches) {

        resolvedReplace = resolve?.resolveVariables(args, "replace", match, selection, selectionStartIndex, index);
        index++;

        const startPos = document.positionAt(selectionStartIndex + match.index);
        const endPos = document.positionAt(selectionStartIndex + match.index + match[0].length);
        const matchRange = new Range(startPos, endPos);

        if (resolvedReplace !== null) edit.replace(matchRange, resolvedReplace);
          // TODO: might not need the below at all?
        else editor.selections = editor.selections.filter(otherSelection => otherSelection !== selection);
        
        foundMatches.push(match);
        foundSelections.push(selection);
      }

      if (matches.length) {
        matchesPerSelection.add({
          selectionNumber: thisSelectionNumber,
          numMatches: matches.length,
          matches: matches
        });
      }
      if (matchesPerSelection.size) isSelectionWithMatch = true;
    }));
  }).then(async success => {
    if (!success) {
      return;
    }
    if (args.cursorMoveSelect) {
      let index = 0;

      const foundSelections = [];
      let cursorMoveSelect;

      await Promise.all(editor.selections.map(async (selection, thisSelection) => {

        let numMatches = 0, matches = null;

        for (const item of matchesPerSelection) {
          if (item.selectionNumber === thisSelection) {
            ({ numMatches, matches } = item);
            matchesPerSelection.delete(item);
            break;
          }
        }

        if (numMatches) {

          const combinedMatch = await _combineMatches(Array.from(matches));

          cursorMoveSelect = await resolve.resolveCursorMoveSelect(args.cursorMoveSelect, numMatches, combinedMatch, selection, index);
          cursorMoveSelect = await resolve.adjustCMSValueForRegex(cursorMoveSelect, args.isRegex, args.matchWholeWord);

          if (cursorMoveSelect.length) {  // don't if cursorMoveSelect === ""

            const selectionIndex = document.offsetAt(selection.start);

            if (cursorMoveSelect === "^(?!\n)") {  // args.cursorMoveSelect === "^"
              foundSelections.push(new Selection(selection.start, selection.start));
            }
            else if (cursorMoveSelect === "$(?!\n)") {  // args.cursorMoveSelect === "$"
              const diff = resolvedFind.length - resolvedReplace?.length;
              const selPos = new Position(selection.end.line, Math.abs(selection.end.character - (matchesPerSelection[index] * diff)));
              foundSelections.push(new Selection(selPos, selPos));
            }
            else {
              const selectedRange = new Range(selection.start, selection.end);
              const selectionText = document.getText(selectedRange);
              const cmsMatches = [...selectionText.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

              for (const match of cmsMatches) {
                const startPos = document.positionAt(selectionIndex + match.index);
                const endPos = document.positionAt(selectionIndex + match.index + match[0].length);
                foundSelections.push(new Selection(startPos, endPos));
              }
            }
          }
          index++;
        }
      }));
      // TODO: utilities.getSelectionToReveal() if no cms or it fails
      // if (foundSelections.length) editor.selections = foundSelections;
      // below doesn't seem to add anything
      if (!args.preserveSelections && foundSelections.length) editor.selections = foundSelections;
      if (foundSelections.length) editor.revealRange(new Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
    }
    // runs after all find/replaces in all selections, but uses only the first selection
    if (args.run) resolve.resolveVariables(args, "run", null, editor.selection, null, null);
    // _replaceInLine(args, foundMatches, foundSelections, editor.selection);
    
    if (args.postCommands && isSelectionWithMatch) await commands.runPrePostCommands(args.postCommands, "postCommands");
  });
};

/**
 * 
 * @param {Array} matches 
 * @returns {Promise<array>}
 */
async function _combineMatches(matches) {

  let firstMatch = matches.shift();

  return firstMatch.map((value, index) => {
    if (!value) {
      let foundMatch = matches.find(match => {
        if (match[index]) return match[index];
      });
      if (foundMatch) return foundMatch[index];
    }
    return value;
  });
}


/**
 * Get just the findInCurrentFile args keys, like "title", "find", etc.
 * @returns {Array}
 */
exports.getKeys = function () {
  // preserveCase ?
  return ["title", "description", "preCommands", "find", "replace", "run", "runWhen", "isRegex", "postCommands", "preserveSelections", 
  "runPostCommands", "ignoreWhiteSpace", "matchCase", "matchWholeWord", "restrictFind", "reveal", "cursorMoveSelect"];
};


/**
 * Get just the findInCurrentFile args values, like true/false, "selections", etc.
 * @returns {Object}
 */
exports.getValues = function () {
  // preserveCase support
  return {
    title: "string", description: "string", find: "string", replace: "string", run: "string", preserveSelections: "boolean",  
    runWhen: ["onceIfAMatch", "onEveryMatch", "onceOnNoMatches"], preCommands: ["string", "object"], postCommands: ["string", "object"],
    runPostCommands: ["onceIfAMatch", "onEveryMatch", "onceOnNoMatches"], isRegex: "boolean", matchCase: "boolean", matchWholeWord: "boolean", ignoreWhiteSpace: "boolean",
    restrictFind: ["document", "selections", "line", "once", "onceIncludeCurrentWord", "onceExcludeCurrentWord", "nextSelect", "nextMoveCursor", "nextDontMoveCursor",
      "previousSelect", "previousMoveCursor", "previousDontMoveCursor", "matchAroundCursor"],
    reveal: ["first", "next", "last"], cursorMoveSelect: "string"
  };
};


/**
 * Get the default values for all findInCurrentFile keys
 * @returns {Object} - {"title": "", "find": ""}
 */
exports.getDefaults = function () {
  return {
    "title": "",
    "description": "",
    "preCommands": "",
    "find": "",
    "ignoreWhiteSpace": false,
    "replace": "",
    "run": "",
    "preserveSelections": false,
    "runWhen": "onceIfAMatch",
    "postCommands": "",
    "runPostCommands": "onceIfAMatch",
    "isRegex": false,
    "matchCase": false,
    "matchWholeWord": false,
    "restrictFind": "document",
    "reveal": "next",
    "cursorMoveSelect": ""
  };
  // "preserveCase": "false" ?
};
