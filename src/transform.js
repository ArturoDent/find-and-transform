const { window, Range, Position, Selection } = require('vscode');
const commands = require('./commands');
const resolve = require('./resolveVariables');


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

      const wordRange = document.getWordRangeAtPosition(selection.start);
      if (!wordRange) return;

      emptySelections.push(new Selection(wordRange.start, wordRange.end));

      // filter out the original empty selection
      editor.selections = editor.selections.filter(oldSelection => oldSelection !== selection);
      editor.selections = emptySelections.concat(editor.selections);
    }
  }));
};


/**
 * If find but no replace, just select all matches in entire document or pre-existing selections
 * while removing all the original selections. 
 * Also covers no find/no replace.
 *
 * @param {import("vscode").TextEditor} editor
 * @param {Object} args - keybinding/settings args
 */
exports.findAndSelect = async function (editor, args) {

  const document = editor.document;
  const foundSelections = [];

  if (args.restrictFind === "document") {

    let docRange;
    let fullText;
    let matches;

    // an undefined find will be converted to the empty string already, find = ''
    const resolvedFind = await resolve.resolveFind(editor, args, null, null);

    if (resolvedFind) {

      if (resolvedFind?.search(/\$\{line(Number|Index)\}/) !== -1) {
        // lineCount is 1-based, so need to subtract 1 from it
        const lastLineRange = document.lineAt(document.lineCount - 1).range;
        docRange = new Range(0, 0, document.lineCount - 1, lastLineRange.end.character);
        matches = _buildLineNumberMatches(resolvedFind, docRange);
      }

      // else get all the matches in the document, resolvedFind !== lineNumber/lineIndex
      else if (resolvedFind.length) {
        fullText = document.getText();
        matches = [...fullText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
      }

      // Any way to designate a capture group to select, like '\\$1(\\d+)' ?
      matches?.forEach((match, index) => {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        foundSelections[index] = new Selection(startPos, endPos);
      });
      if (foundSelections.length) editor.selections = foundSelections;
    }// this will not? remove all the original selections
  }

  else {  // restrictFind === "selections/once/line"

    let selectedRange;
    let matches;

    await Promise.all(editor.selections.map(async (selection) => {

      
      if (!args.find && args.restrictFind !== "selections") {
        const lineSelections = editor.selections.filter(eachSelection => eachSelection.active.line === selection.active.line);
        const findObject = resolve.makeFind(lineSelections, args);
        ({ find: args.find, emptyPointSelections: args.pointReplaces } = findObject);
        args.madeFind = true;
        args.isRegex ||= findObject.mustBeRegex;
      }
      const resolvedFind = await resolve.resolveFind(editor, args, null, selection);
      if (!resolvedFind) return;

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
          foundSelections.push(new Selection(startPos, endPos));
        });
        // a very long off-screen selection?
        if (foundSelections.length) editor.revealRange(new Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
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
        });
      }

      else if (args.restrictFind === "once") {

        let lineIndex = 0;
        let subStringIndex;

        if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
          let lineRange = document.lineAt(selection.active.line).range;

          let subLineRange = lineRange.with({ start: document.getWordRangeAtPosition(selection.active).start });

          matches = _buildLineNumberMatches(resolvedFind, subLineRange);
        }

        else if (resolvedFind?.length) {
          const fullLine = document.lineAt(selection.active.line).text;
          // to not include the word under cursor:
          // const wordRangeAtCursor = document.getWordRangeAtPosition(selection.end);
          // if (wordRangeAtCursor) searchText = fullLine.substring(wordRangeAtCursor?.end?.character);
          // else searchText = fullLine.substring(selection?.end?.character);
          searchText = fullLine.substring(selection?.end?.character);

          if (!searchText) return;

          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
          lineIndex = document.offsetAt(new Position(selection.end.line, 0));
          // this starts at the beginning of the current word:
          // subStringIndex = document.getWordRangeAtPosition(selection.end)?.start?.character;
          // // if no curent word = empty line or at spaces between words or at end of a line with a space
          // if (subStringIndex === undefined) subStringIndex = selection.end?.character;
          subStringIndex = selection.end?.character;
        }

        if (matches?.length) {  // just do once
          const startPos = document.positionAt(lineIndex + subStringIndex + matches[0].index);
          const endPos = document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
          foundSelections.push(new Selection(startPos, endPos));
        }
      }
    }));

    if (foundSelections.length) editor.selections = foundSelections; // TODO this will not? remove all the original selections
  }
  if (args.run) resolve.resolveVariables(args, "run", null, editor.selection, null, null);
  if ((foundSelections.length || args.run) && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands", null, editor.selection);
};

/**
 * Replace find matches on the current line.
 *
 * @param {window.activeTextEditor} editor
 * @param {import("vscode").TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInLine = async function (editor, edit, args) {

  const document = editor.document;
  const findArg = args.find;
  
  let currentLine = "";
  let matches = [];
  let foundSelections = [];
  let emptySelections = [];
  let lines = [];  
  let uniqueSelections = [];
  
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
    let lineMatches = [];  // for cursorMoveSelect

    // TODO: handle 'Error: Overlapping ranges are not allowed!` 2 cursors on the same line
    await editor.edit(async function (edit) {

      await Promise.all(uniqueSelections.map(async (selection) => {

        args.find = findArg; // reset to the original args.find
        let index = 0;        
        foundSelections = [];
        let resolvedFind;
        
        // call makeFind(selections, args) here with currentLine selections only
        // const lineSelections = editor.selections.filter(eachSelection => eachSelection.active.line === selection.active.line);
        if (!args.find) {
          const lineSelections = editor.selections.filter(eachSelection => eachSelection.active.line === selection.active.line);
          const findObject = resolve.makeFind(lineSelections, args);
          ({ find: args.find, emptyPointSelections: args.pointReplaces } = findObject);
          args.madeFind = true;
          args.isRegex ||= findObject.mustBeRegex;
        }
        
        if (!args.find) return;
        
        // because caller = find, no need to resolve.resolveFind
        resolvedFind = resolve.resolveVariables(args, "find", null, selection, null, index);
        resolvedFind = resolve.adjustValueForRegex(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
        if (!resolvedFind && !args.replace) return;

        const re = new RegExp(resolvedFind, args.regexOptions);
        currentLine = document.getText(document.lineAt(selection.active.line).rangeIncludingLineBreak);
        currentLine = currentLine.replace(/\r?\n/g, ''); // probably handled below

        if (resolvedFind)
          matches = [...currentLine.matchAll(re)];
        else {
          const match = { index: selection.active.character };
          match[0] = "";
          matches.push(match);
        }
        
        // inaccurate? 
        matches?.forEach((match, index) => {
          
          lineIndex = document.offsetAt(new Position(selection.active.line, 0));
          const startPos = document.positionAt(lineIndex + match.index);
          const endPos = document.positionAt(lineIndex + match.index + match[0].length);
          foundSelections[index] = new Selection(startPos, endPos);
        });
        
        // only works for one line at a time
        if (foundSelections.length) editor.selections = foundSelections;
        if (args.run) resolve.resolveVariables(args, "run", null, foundSelections[index], null, null);

        matches?.forEach(async match => {
          
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
    }).then(async success => {
      if (!success) {
        return;
      }

      if (args.cursorMoveSelect) {
        
        foundSelections = [];
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
              foundSelections.push(new Selection(startPos, endPos));
            }
          }
          if (!foundSelections.length) emptySelections.push(new Selection(new Position(line, 0), new Position(line, 0)));
        }
      }
      // these are inaccurate TODO
      if (args.cursorMoveSelect && foundSelections.length) editor.selections = foundSelections;
      else editor.selections = emptySelections;  // clear all selections
      
      if (args.run) resolve.resolveVariables(args, "run", null, editor.selection, null, null);
      if (lineMatches.length && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands", null, null);
    });
  }

  // change to: from beginning of current word to end of line?
  else if (args.restrictFind === "once") {  // from cursor to end of line

    let fullLine = "";
    let lineIndex;
    let subStringIndex;
    let lines = [];
    let subStringIndices = [];
    let lineMatches = [];
    let matches = [];     // for cursorMoveSelect

    await editor.edit(async function (edit) {

      let index = 0;
      await Promise.all(uniqueSelections.map(async (selection) => {
        
        args.find = findArg; // reset to the original args.find
        foundSelections = [];
        
        // call makeFind(selections, args) here with currentLine selections only
        // const lineSelections = editor.selections.filter(eachSelection => eachSelection.active.line === selection.active.line);
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
        resolvedFind = resolve.adjustValueForRegex(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
        if (!resolvedFind && !args.replace) return;  // correct here or already handled in findAndSelect?

        const re = new RegExp(resolvedFind, args.regexOptions);
        // get first match on line from cursor forward
        fullLine = document.getText(document.lineAt(selection.active.line).rangeIncludingLineBreak);

        subStringIndex = selection.end?.character;
        currentLine = fullLine.substring(selection.end.character);

        // use matchAll() to get index even though only using the first one
        matches = [...currentLine.matchAll(re)];
        
        if (matches.length) {  // just do once
          
          let selectionIndex = document.offsetAt(selection.end);
          
          const startPos = document.positionAt(selectionIndex + matches[0].index);
          const endPos = document.positionAt(selectionIndex + matches[0].index + matches[0][0].length);
          foundSelections[0] = new Selection(startPos, endPos);
          
          // only works for one line
          if (foundSelections.length) editor.selections = foundSelections;
          if (args.run) resolve.resolveVariables(args, "run", null, foundSelections[index], null, null);

          lineIndex = document.offsetAt(new Position(selection.end.line, 0));
          let resolvedReplace = resolve.resolveVariables(args, "replace", matches[0], foundSelections[0], null, index);

          const matchRange = new Range(startPos, endPos);

          edit.replace(matchRange, resolvedReplace);
          lines[index] = startPos.line;
          lineMatches[index] = matches;
          
          // so cursorMoveSelect is only **after** a once match
          subStringIndices[index++] = subStringIndex + matches[0].index;
        }
        
        if (foundSelections.length) editor.selections = foundSelections;
        
      }));
    }).then(async success => {
      if (!success) {
        return;
      }

      if (args.cursorMoveSelect) {

        foundSelections = [];
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
            foundSelections.push(new Selection(startPos, endPos));
          }
        }
      }
      if (args.cursorMoveSelect && foundSelections.length) editor.selections = foundSelections;
      // takes only one selection from the editor
      if (args.run) resolve.resolveVariables(args, "run", null, editor.selection, null, null);
      if (lineMatches.length && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands", null, editor.selection);
    });
  }
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

  let previous = args.restrictFind.startsWith('previous') || false;
  let next = args.restrictFind.startsWith('next') || false;

  let nextMatches;
  let previousMatches;
  let match;

  const docString = document.getText();
  let cursorIndex = document.offsetAt(editor.selection.active);

  const resolvedFind = await resolve.resolveFind(editor, args, null, null);

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
    if (nextMatches[0].index === 0) nextMatches.shift();

    const documentBeforeCursor = docString.substring(0, cursorIndex);
    previousMatches = [...documentBeforeCursor.matchAll(re)];
    
    // TODO test: skip last match if it is the current find location
    const { selection } = window.activeTextEditor;
    if (previousMatches.at(-1).index === document.offsetAt(selection.active)) previousMatches.pop();
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
  else return;

  if (!previousMatches.length && !nextMatches.length) return;  // no match before or after cursor

  await editor.edit(async function (edit) {

    let index = 0;

    if (args.replace) {
      resolvedReplace = resolve.resolveVariables(args, "replace", match, editor.selection, cursorIndex + match.index, index);
      index++;

      if (args.isRegex) resolvedReplace = resolvedReplace.replace(/(?<!\r)\n/g, "\r\n");

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
      matchEndPos = document.positionAt(cursorIndex + match.index + resolvedReplace.length);
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
      editor.revealRange(new Range(matchStartPos, matchEndPos), 2);
    }   // do nothing, edit already made

    if ((nextMatches.length || previousMatches.length) && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands", null, null);  // TODO
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

    // for selections/once
    // change lineText to start of wordAtCursor?
    if (range.start.line === line) lineText = lineText.substring(range.start.character);
    else if (range.end.line === line) lineText = lineText.substring(0, range.end.character);

    let resolved = find.replaceAll("${lineNumber}", String(line + 1)).replaceAll("${lineIndex}", String(line));
    // resolved = await resolve.resolveExtensionDefinedVariables(resolved, {}, "find");  // TODO
    const lineMatches = [...lineText.matchAll(new RegExp(resolved, "g"))];

    for (const match of lineMatches) {
      match["line"] = line;
      if (range.start.line === line) match["index"] = lineIndex + match.index + range.start.character;
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

  let docRange;
  let fullText;
  let foundSelections = [];
  let matches = [];
  let resolvedFind = "";
  let resolvedReplace;
  
  if (args.find) resolvedFind = await resolve.resolveFind(editor, args, null, null);
  if (resolvedFind === "Error: jsOPError") return;  // abort

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
    foundSelections[index] = new Selection(startPos, endPos);
  });
    
  if (foundSelections.length) editor.selections = foundSelections;  // and so postCommands work on selections
  if (args.run) resolve.resolveVariables(args, "run", null, editor.selection, null, null);
  
  let lastMatchLengthDiff = 0;

  editor.edit(editBuilder => {

    let index = 0;

    for (const match of matches) {

      // this works when using ${selectedText} in a replace
      // resolvedReplace = resolve.resolveVariables(args, "replace", match, foundSelections[index], null, index);
      // below selects all replacements
      resolvedReplace = resolve.resolveVariables(args, "replace", match, editor.selections[index], null, index);

      if (resolvedReplace === "Error: jsOPError") return;    // abort

      if (args.isRegex) resolvedReplace = resolvedReplace.replace(/(?<!\r)\n/g, "\r\n");  // might be unnecessary

      const matchStartPos = document.positionAt(match.index);
      const matchEndPos = document.positionAt(match.index + match[0].length);
      const matchRange = new Range(matchStartPos, matchEndPos);
      editBuilder.replace(matchRange, resolvedReplace);

      if (args.cursorMoveSelect) {  // to be useed in cursorMoveSelect below to build matching text
        matches[index].range = new Range(matchStartPos, new Position(matchStartPos.line, matchStartPos.character + resolvedReplace.length));
        matches[index].lastMatchLengthDiff = lastMatchLengthDiff;
        lastMatchLengthDiff += (resolvedReplace.length - match[0].length);
        matches[index].replaceLength = resolvedReplace.length;
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
            const startPos = document.positionAt(document.offsetAt(matchRangeAfterReplacement.start) + cmsMatch.index);
            const endPos = document.positionAt(document.offsetAt(matchRangeAfterReplacement.start) + cmsMatch.index + cmsMatch[0].length);
            foundSelections.push(new Selection(startPos, endPos));
          }
        }
      }
      if (foundSelections.length) editor.selections = foundSelections;
      if (foundSelections.length) editor.revealRange(new Range(foundSelections[0].start, foundSelections[0].end), 2);
      index++;
    }
    if (matches.length && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands", matches[0], editor.selection);
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

  const document = editor.document;

  let isSelectionWithMatch = false;
  let resolvedFind;
  let resolvedReplace;
  let matches;
  let matchesPerSelection = new Set();

  editor.edit(async function (edit) {

    let index = 0;

    await Promise.all(editor.selections.map(async (selection, thisSelectionNumber) => {

      // empty selections, pointReplacements?
      // could filter out empty selections first
      const selectedRange = new Range(selection.start, selection.end);
      let selectionStartIndex = document.offsetAt(selection.start);

      // below instead of resolveVariables.resolveFind because it is async and editor.edit??
      const lineIndexNumberRE = /\$\{getTextLines:[^}]*\$\{line(Index|Number)\}.*?\}/;

      if (args.find.search(lineIndexNumberRE) !== -1)
        resolvedFind = resolve.resolveVariables(args, "find", null, selection, null, index);
      else
        resolvedFind = resolve.resolveVariables(args, "ignoreLineNumbers", null, selection, null, index);

      resolvedFind = resolve.adjustValueForRegex(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

      if (!resolvedFind && !args.replace) return;

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

        resolvedReplace = resolve.resolveVariables(args, "replace", match, selection, selectionStartIndex, index);
        index++;

        const startPos = document.positionAt(selectionStartIndex + match.index);
        const endPos = document.positionAt(selectionStartIndex + match.index + match[0].length);
        const matchRange = new Range(startPos, endPos);

        if (resolvedReplace !== null) edit.replace(matchRange, resolvedReplace);
        else editor.selections = editor.selections.filter(otherSelection => otherSelection !== selection);
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
              const diff = resolvedFind.length - resolvedReplace.length;
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
      if (foundSelections.length) editor.selections = foundSelections;
      if (foundSelections.length) editor.revealRange(new Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
    }
    // runs after all finds in all selections, and uses only the first selection
    if (args.run) resolve.resolveVariables(args, "run", null, editor.selection, null, null);
    if (args.postCommands && isSelectionWithMatch) await commands.runPrePostCommands(args.postCommands, "postCommands", null, null);
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
  // return ["title", "description", "preCommands", "find", "replace", "run\": [\n\t\"$${\",\n\t\t\"operation;\",\n\t\"}$$\",\n],", "isRegex", "postCommands",
  return ["title", "description", "preCommands", "find", "replace", "run", "isRegex", "postCommands",
    "matchCase", "matchWholeWord", "restrictFind", "cursorMoveSelect"];
};


/**
 * Get just the findInCurrentFile args values, like true/false, "selections", etc.
 * @returns {Object}
 */
exports.getValues = function () {
  // preserveCase support
  return {
    title: "string", description: "string", find: "string", replace: "string", run: "string",
    preCommands: ["string", "object"], postCommands: ["string", "object"],
    isRegex: "boolean", matchCase: "boolean", matchWholeWord: "boolean",
    restrictFind: ["document", "selections", "line", "once", "nextSelect", "nextMoveCursor", "nextDontMoveCursor",
      "previousSelect", "previousMoveCursor", "previousDontMoveCursor"],
    cursorMoveSelect: "string"
  };
};


/**
 * Get the default values for all findInCurrentFile keys
 * @returns {Object} - {"title": "", "find": ""}
 */
exports.getDefaults = function () {
  return {
    "title": "",
    "preCommands": "",
    "find": "",
    "replace": "",
    "postCommands": "",
    "isRegex": "false",
    "matchCase": "false",
    "matchWholeWord": "false",
    "restrictFind": "document",
    "cursorMoveSelect": ""
  };
  // "preserveCase": "false" ?
};
