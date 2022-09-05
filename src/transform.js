const vscode = require('vscode');
const commands = require('./commands');
const resolve = require('./resolveVariables');


/**
 * Add any empty/words at cursor position to the editor.selections.
 * Modifies existing selections.
 * @param {vscode.window.activeTextEditor} editor
 */
exports.addEmptySelectionMatches = async function (editor) {
  
  await Promise.all(editor.selections.map(async (selection) => {
	// editor.selections.forEach(selection => {

		const emptySelections = [];

		// if selection start = end then just a cursor no actual selected text
		if (selection.isEmpty) {

			const wordRange = editor.document.getWordRangeAtPosition(selection.start);
			if (!wordRange) return;

			emptySelections.push(new vscode.Selection(wordRange.start, wordRange.end));

			// filter out the original empty selection
			editor.selections = editor.selections.filter(oldSelection => oldSelection !== selection);
			editor.selections = emptySelections.concat(editor.selections);
		}
	// });
	}));
}


/**
 * If find but no replace, just select all matches in entire document or pre-existing selections
 * while removing all the original selections. 
 * Also covers no find/no replace.
 *
 * @param {vscode.TextEditor} editor
 * @param {Object} args - keybinding/settings args
 */
exports.findAndSelect = async function (editor, args) {

  const foundSelections = [];
  const document = vscode.window.activeTextEditor.document;
  
  if (args.restrictFind === "document") {
    
    let docRange;
    let fullText;
    let matches;

    const resolvedFind = await resolve.resolveFind(editor, args, null, null);
    
    if (!resolvedFind) return;
    
    // if (args.isRegex) {
    //   if (resolvedFind === "^") resolvedFind = "^(?!\n)";
    //   else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
    // }
    
    if (resolvedFind?.search(/\$\{line(Number|Index)\}/) !== -1) {
      // lineCount is 1-based, so need to subtract 1 from it
      const lastLineRange = document.lineAt(document.lineCount - 1).range;
      docRange = new vscode.Range(0, 0, document.lineCount - 1, lastLineRange.end.character);
      matches = _buildLineNumberMatches(resolvedFind, docRange);
    }

    // else get all the matches in the document, resolvedFind !== lineNumber/lineIndex
    else if (resolvedFind.length) {
      fullText = editor.document.getText();
      matches = [...fullText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
    }

    // Any way to designate a capture group to select, like '\\$1(\\d+)' ?
    matches?.forEach((match, index) => {
      const startPos = editor.document.positionAt(match.index);
      const endPos = editor.document.positionAt(match.index + match[0].length);
			foundSelections[index] = new vscode.Selection(startPos, endPos);
		});
    if (foundSelections.length) editor.selections = foundSelections; // this will not? remove all the original selections
    // if (foundSelections.length) editor.revealRange(new vscode.Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
	}

	else {  // restrictFind === "selections/once/line"

    let selectedRange;
    let matches;

    // make this async TODO
    await Promise.all(editor.selections.map(async (selection) => {
      
      // TODO selection arg = "" ?
      const resolvedFind = await resolve.resolveFind(editor, args, null, selection);
      
      if (!resolvedFind) return;
      
      // if (args.isRegex) {
      //   if (resolvedFind === "^") resolvedFind = "^(?!\n)";
      //   else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
      // }     

      let searchText;

      if (args.restrictFind === "selections") {
          
        if (selection.isEmpty) {
          // pointSelections here TODO
          selectedRange = editor.document.getWordRangeAtPosition(selection.start);
        }
        else selectedRange = new vscode.Range(selection.start, selection.end);
        if (!selectedRange) return;
        
        if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1)
          matches = _buildLineNumberMatches(resolvedFind, selectedRange);

        else if (resolvedFind?.length) {
          searchText = editor.document.getText(selectedRange);
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
        }

        matches?.forEach((match) => {
          const selectionStartIndex = editor.document.offsetAt(selectedRange.start);
          const startPos = editor.document.positionAt(selectionStartIndex + match.index);
          const endPos = editor.document.positionAt(selectionStartIndex + match.index + match[0].length);
          foundSelections.push(new vscode.Selection(startPos, endPos));
        });
        // a very long off-screen selection?
        if (foundSelections.length) editor.revealRange(new vscode.Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
      }

      else if (args.restrictFind === "line") {

        let lineIndex = 0;

        if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
          let selectedLineRange = document.lineAt(selection.active.line).range;
          matches = _buildLineNumberMatches(resolvedFind, selectedLineRange);
        }
        else if (resolvedFind?.length) {
          searchText = editor.document.lineAt(selection.active.line).text;
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
          lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
        }

        matches?.forEach((match) => {
          const startPos = editor.document.positionAt(lineIndex + match.index);
          const endPos = editor.document.positionAt(lineIndex + match.index + match[0].length);
          foundSelections.push(new vscode.Selection(startPos, endPos));
        });
      }
        
      else if (args.restrictFind === "once") {

        let lineIndex = 0;
        let subStringIndex;

        if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
          let lineRange = document.lineAt(selection.active.line).range;
          
          // TODO: change this
          // let subLineRange = lineRange.with({ start: selection.active });
          let subLineRange = lineRange.with({ start: editor.document.getWordRangeAtPosition(selection.active).start });
          
          matches = _buildLineNumberMatches(resolvedFind, subLineRange);
        }

        else  if (resolvedFind?.length) {
          const fullLine = editor.document.lineAt(selection.active.line).text;
          // to not include the word under cursor TODO?
          // const wordRangeAtCursor = editor.document.getWordRangeAtPosition(selection.end);
          // if (wordRangeAtCursor) searchText = fullLine.substring(wordRangeAtCursor?.end?.character);
          // else searchText = fullLine.substring(selection?.end?.character);
          searchText = fullLine.substring(selection?.end?.character);
          
          if (!searchText) return;
          
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
          lineIndex = editor.document.offsetAt(new vscode.Position(selection.end.line, 0));
          // this starts at the beginning of the current word
          // subStringIndex = editor.document.getWordRangeAtPosition(selection.end)?.start?.character;
          // // if no curent word = empty line or at spaces between words or at end of a line with a space
          // if (subStringIndex === undefined) subStringIndex = selection.end?.character;
          subStringIndex = selection.end?.character;
        }

        if (matches?.length) {  // just do once
          const startPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index);
          const endPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
          foundSelections.push(new vscode.Selection(startPos, endPos));
        }
      }
		// });
    }));
    
    if (foundSelections.length) editor.selections = foundSelections; // TODO this will not? remove all the original selections
  }
  if (foundSelections.length && args.postCommands) await commands.runPrePostCommands(args.postCommands); 
}

/**
 * Replace find matches on the current line.
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInLine = async function (editor, edit, args) {

	let currentLine = "";
  let foundSelections = [];

	if (args.restrictFind === "line") {

		// get all the matches on the line
    let lineIndex;
    let lines = [];
    let lineMatches = [];  // for cursorMoveSelect
    let index = 0;

    // handle 'Error: Overlapping ranges are not allowed!` 2 cursors on the same line
    editor.edit(function (edit) {

      editor.selections.forEach(selection => {
        
        let matches = [];

        // TODO comment here because caller = find, no need to resolve.resolveFind
        let resolvedFind = resolve.resolveVariables(args, "find", null, selection, null, index);
        resolvedFind = resolve.adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
        if (!resolvedFind && !args.replace) return;

        const re = new RegExp(resolvedFind, args.regexOptions);
        currentLine = editor.document.getText(editor.document.lineAt(selection.active.line).rangeIncludingLineBreak);
        currentLine = currentLine.replace(/\r?\n/g, ''); // probably handled below
        
        if (resolvedFind)
          matches = [...currentLine.matchAll(re)];
        else {
            const match = { index: selection.active.character };
            match[0] = "";
            matches.push(match);
        }
		        
        matches?.forEach(match => {

          lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));

          let resolvedReplace = resolve.resolveVariables(args, "replace", match, selection, null, index);
					
          const startPos = editor.document.positionAt(lineIndex + match.index);
          const endPos = editor.document.positionAt(lineIndex + match.index + match[0].length);
          const matchRange = new vscode.Range(startPos, endPos);
          edit.replace(matchRange, resolvedReplace); // 'Error: Overlapping ranges are not allowed!`
          lineMatches[index] = match;
          lines[index++] = startPos.line;
          // should these select? or clear all selections?
        });
      })
    }).then(async success => {
      if (!success) {
        return;
      }

      if (args.cursorMoveSelect) {

        let index = 0;

        for (const line of lines) {

          let cursorMoveSelect = resolve.resolveVariables(args, "cursorMoveSelect", lineMatches[index], editor.selection, null, index);
          index++;
          
          if (args.isRegex) {
            if (cursorMoveSelect === "^") cursorMoveSelect = "^(?!\n)";
            else if (cursorMoveSelect === "$") cursorMoveSelect = "(?<!\n)$";
          }
 
          if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
          if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

          currentLine = editor.document.lineAt(line).text;
          lineIndex = editor.document.offsetAt(editor.document.lineAt(line).range.start);
          
          const cmsMatches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

          for (const match of cmsMatches) {
            const startPos = editor.document.positionAt(lineIndex + match.index);
            const endPos = editor.document.positionAt(lineIndex + match.index + match[0].length);
            foundSelections.push(new vscode.Selection(startPos, endPos));
          }
        }
      }
      if (foundSelections.length) editor.selections = foundSelections;
      if (foundSelections.length && args.postCommands) await commands.runPrePostCommands(args.postCommands); 
    });
	}

  // change to: from beginning of current word to end of line
	else if (args.restrictFind === "once") {  // from cursor to end of line

		let fullLine = "";
		let lineIndex;
    let subStringIndex;
    let lines = [];
    let subStringIndices = [];
    let lineMatches = [];      // for cursorMoveSelect
    
    editor.edit(function (edit) {

      let index = 0;
      editor.selections.forEach(selection => {

        // because caller = find, no need to resolve.resolveFind, which is async
        let resolvedFind = resolve.resolveVariables(args, "find", null, selection, null, index);
        resolvedFind = resolve.adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
        if (!resolvedFind && !args.replace) return;  // correct here or already handled in findAndSelect?

        const re = new RegExp(resolvedFind, args.regexOptions);
        // get first match on line from cursor forward
        fullLine = editor.document.getText(editor.document.lineAt(selection.active.line).rangeIncludingLineBreak);
        
        // const currentWordRange = editor.document.getWordRangeAtPosition(selection.active);
        // what did the below solve?  TODO
        // if (resolvedFind && !currentWordRange) return;
        
        // subStringIndex = currentWordRange.start.character;        
        // currentLine = fullLine.substring(subStringIndex);  
        subStringIndex = selection.end?.character;
        // subStringIndex = currentWordRange.end.character; 
        currentLine = fullLine.substring(selection.end.character);
        
        // use matchAll() to get index even though only using the first one
        const matches = [...currentLine.matchAll(re)];

        if (matches.length) {  // just do once
          
          lineIndex = editor.document.offsetAt(new vscode.Position(selection.end.line, 0));
          // subStringIndex = selection.active.character;

          let resolvedReplace = resolve.resolveVariables(args, "replace", matches[0], selection, null, index);

          const startPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index);
          const endPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
          const matchRange = new vscode.Range(startPos, endPos);

          edit.replace(matchRange, resolvedReplace);
          lines[index] = startPos.line;
          lineMatches[index] = matches[0];
          subStringIndices[index++] = subStringIndex + matches[0].index; // so cursorMoveSelect is only **after** a once match
          // should these select? else get weird effect where vscode tries to maintain the selection size if a wordAtCursor
        }
      });
    }).then(async success => {
      if (!success) {
        return;
      }

      if (args.cursorMoveSelect) {
            
        let index = 0;
        for (const line of lines) {

          let cursorMoveSelect = resolve.resolveVariables(args, "cursorMoveSelect", lineMatches[index], editor.selection, null, index);
          
          // TODO check this
          if (args.isRegex) {
            if (cursorMoveSelect === "^") cursorMoveSelect = "^(?!\n)";
            else if (cursorMoveSelect === "$") cursorMoveSelect = "(?<!\n)$";
          }

          if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
          if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

          if (cursorMoveSelect !== "^(?!\n)") subStringIndex = subStringIndices[index++];
          else {
            subStringIndex = 0;
            index++;
          }

          currentLine = editor.document.lineAt(line).text.substring(subStringIndex);
          lineIndex = editor.document.offsetAt(editor.document.lineAt(line).range.start);
          const cmsMatches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];
            
          if (cmsMatches.length) {  // just select the first/once cursorMoveSelect match
            const startPos = editor.document.positionAt(lineIndex + subStringIndex + cmsMatches[0].index);
            const endPos = editor.document.positionAt(lineIndex + subStringIndex + cmsMatches[0].index + cmsMatches[0][0].length);
            foundSelections.push(new vscode.Selection(startPos, endPos));
          }
        }
      }
      if (foundSelections.length) editor.selections = foundSelections;
      if (foundSelections.length && args.postCommands) await commands.runPrePostCommands(args.postCommands);
    });
	}
}

/**
//  * Replace the next find match in the entire document
 * Replace the previous or next find match in the entire document
 * Select or not
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replacePreviousOrNextInWholeDocument = async function (editor, edit, args) {

  // make work for multiple selections ?? TODO
  const document = editor.document;
  let resolvedReplace;
  let matchEndPos;
  // let documentBeforeCursor;
  
  let previous = args.restrictFind.startsWith('previous') || false;
  let next = args.restrictFind.startsWith('next') || false;
  
  // let matches;
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
    const restOfDocRange = new vscode.Range(editor.selection.active.line, editor.selection.active.character, document.lineCount - 1, lastLineRange.end.character);
    nextMatches = _buildLineNumberMatches(resolvedFind, restOfDocRange);
    
    const docRangeBeforeCursor = new vscode.Range(0,0, editor.selection.active.line, editor.selection.active.character);
    previousMatches = _buildLineNumberMatches(resolvedFind, docRangeBeforeCursor);
  }
  else {
    const re = new RegExp(resolvedFind, args.regexOptions);
    let restOfDocument = docString.substring(cursorIndex);  // text after cursor
    nextMatches = [...restOfDocument.matchAll(re)];
    
    const documentBeforeCursor = docString.substring(0, cursorIndex);
    previousMatches = [...documentBeforeCursor.matchAll(re)];
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

  editor.edit(function (edit) {
    
    let index = 0;

    if (args.replace) {
      resolvedReplace = resolve.resolveVariables(args, "replace", match, editor.selection, cursorIndex + match.index, index);
      index++;
      
      if (args.isRegex) resolvedReplace = resolvedReplace.replace(/(?<!\r)\n/g, "\r\n");

			const startPos = document.positionAt(cursorIndex + match.index);
			const endPos = document.positionAt(cursorIndex + match.index + match[0].length);
			const matchRange = new vscode.Range(startPos, endPos)
      edit.replace(matchRange, resolvedReplace);
		}
	}).then(async success => {
		if (!success) {
			return;
		}
    // if previous, put cursor at beginning of word = reverse selection
    // if next, put cursor at end of word = forward selection
    if (args.restrictFind !== "nextDontMoveCursor" && args.restrictFind !== "previousDontMoveCursor") {
			const matchStartPos = document.positionAt(cursorIndex + match.index);
			if (args.replace) {
				matchEndPos = document.positionAt(cursorIndex + match.index + resolvedReplace.length);
			}
      else matchEndPos = document.positionAt(cursorIndex + match.index + match[0].length);
      
      if (args.restrictFind === "nextSelect") editor.selections = [new vscode.Selection(matchStartPos, matchEndPos)];
      else if (args.restrictFind === "previousSelect") editor.selections = [new vscode.Selection(matchEndPos, matchStartPos)];
      else if (args.restrictFind === "nextMoveCursor") editor.selections = [new vscode.Selection(matchEndPos, matchEndPos)];
      else if (args.restrictFind === "previousMoveCursor") editor.selections = [new vscode.Selection(matchStartPos, matchStartPos)];
      
      editor.revealRange(new vscode.Range(matchStartPos, matchEndPos), 2);  // InCenterIfOutsideViewport
    }
    
    // else if (args.restrictFind === "nextDontMoveCursor" || args.restrictFind === "previousDontMoveCursor") { }   // do nothing, edit already made
    if ((nextMatches.length || previousMatches.length) && args.postCommands) await commands.runPrePostCommands(args.postCommands);  // TODO
	});
}


/**
 * If find has ${lineNumber} or ${lineIndex} check match ** on each line **
 * 
 * @param {string} find - value to match
 * @param {vscode.Range} range - line or selection range within which to search
 * @returns {Array} of matches
 */
function _buildLineNumberMatches(find, range) {
  
  let matches = [];
  const document = vscode.window.activeTextEditor.document;
  const startLineNumber = range.start.line;
  const endLineNumber = range.end.line;

  for (let line = startLineNumber; line <= endLineNumber; line++)  {

    const lineIndex = document.offsetAt(new vscode.Position(line, 0));
    let lineText = document.lineAt(line).text;

    // for selections/once
    // TODO: change lineText to start of wordAtCursor?
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
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInWholeDocument = async function (editor, edit, args) {

  const document = editor.document;
  let docRange;
  let fullText;
  let matches = [];
  let resolvedFind = "";
  let resolvedReplace;

  if (args.find) resolvedFind = await resolve.resolveFind(editor, args, null, null);

  if (resolvedFind?.search(/\$\{\s*line(Number|Index)\s*\}/) !== -1) {
    // lineCount is 1-based, so need to subtract 1 from it
    const lastLineRange = document.lineAt(document.lineCount - 1).range;
    docRange = new vscode.Range(0, 0, document.lineCount - 1, lastLineRange.end.character);
    matches = _buildLineNumberMatches(resolvedFind, docRange);
  }

  // get all the matches in the document, resolvedFind !== lineNumber/lineIndex
  else if (resolvedFind?.length) {
    fullText = document.getText();
    matches = [...fullText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
  }
  
  args?.pointReplaces?.forEach(point => {
    const match = {index : document.offsetAt(point.active)};
    match[0] = "";
    matches.push(match);
  });
  
	editor.edit( (editBuilder) => {

    let index = 0;

    for (const match of matches) {
      resolvedReplace = resolve.resolveVariables(args, "replace", match, editor.selection, null, index);
      if (args.isRegex) resolvedReplace = resolvedReplace.replace(/(?<!\r)\n/g, "\r\n");  // might be unnecessary

			const matchStartPos = document.positionAt(match.index);
			const matchEndPos = document.positionAt(match.index + match[0].length);
      const matchRange = new vscode.Range(matchStartPos, matchEndPos);
      editBuilder.replace(matchRange, resolvedReplace);
      matches[index++].range = matchRange;
		}
	}).then(async success => {
		if (!success) {
			return;
    }
    // select the replacement if no cursorMoveSelect? TODO
    // if (!args.cursorMoveSelect) args.cursorMoveSelect = args.replace;
    if (args.cursorMoveSelect) {
      
      const foundSelections = [];

      let index = 0;

      for (const match of matches) {

        let cursorMoveSelect = resolve.resolveVariables(args, "cursorMoveSelect", match, editor.selection, match.index, index);
        if (cursorMoveSelect === "") return;
        // index++;
        
        if (args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/(?<!\r)\n/g, "\r\n");

        // TODO check this
        if (args.isRegex) {
          if (cursorMoveSelect === "^") cursorMoveSelect = "^(?!\n)";
          // else if (cursorMoveSelect === "$") cursorMoveSelect = "$(?!\n)";
          else if (cursorMoveSelect === "$") cursorMoveSelect = "(?<!\n)$";
        }

        if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
        if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

        const re = new RegExp(cursorMoveSelect, args.regexOptions);
        // since the match can extend over different lines
        const textOfMatch = document.getText(match.range);  

        const cmsMatches = [...textOfMatch.matchAll(re)];

        for (const cmsMatch of cmsMatches) {
          const startPos = document.positionAt(document.offsetAt(match.range.start) + cmsMatch.index);
          const endPos = document.positionAt(document.offsetAt(match.range.start) + cmsMatch.index + cmsMatch[0].length);
          foundSelections.push(new vscode.Selection(startPos, endPos));
        }
      }
      if (foundSelections.length) editor.selections = foundSelections;
      if (foundSelections.length) editor.revealRange(new vscode.Range(foundSelections[0].start, foundSelections[0].end), 2);
      index++; 
    }
    // TODO run for each snippet/match of matches?
    if (matches.length && args.postCommands) await commands.runPrePostCommands(args.postCommands);
    
    // if no cursorMoveSelect match and first match is not in viewport, then reveal?
    // if (foundSelections.length) editor.revealRange(new vscode.Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
    // else vscode.commands.executeCommand('revealLine', { lineNumber: document.positionAt(matches[0].index).line, at: "bottom" });
  });
}

/**
 * Replace matches within each selection range
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInSelections = async function (editor, edit, args) {

  const document = vscode.window.activeTextEditor.document;
  let selectionsWithMatches = [];
  let resolvedFind;
  let resolvedReplace;
  let matches;
  let allMatches = [];
  let matchesPerSelection = [];

  // editor.edit(function (async edit) {
  editor.edit(function (edit) {

    let index = 0;

    // await Promise.all(editor.selections.map(async (selection) => {
    editor.selections.forEach(selection => {

      // empty selections, pointReplacements TODO
      // could filter out empty selections first
      const selectedRange = new vscode.Range(selection.start, selection.end);
      let selectionStartIndex = document.offsetAt(selection.start);

      // below instead of resolveVariables.resolveFind because it is async and editor.edit??
      const lineIndexNumberRE = /\$\{getTextLines:[^}]*\$\{line(Index|Number)\}.*?\}/;
      
      if (args.find.search(lineIndexNumberRE) !== -1)
        resolvedFind = resolve.resolveVariables(args, "find", null, selection, null, index);
      else
        resolvedFind = resolve.resolveVariables(args, "ignoreLineNumbers", null, selection, null, index);

      resolvedFind = resolve.adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
      
      if (!resolvedFind && !args.replace) return;
      
      // if (args.isRegex) {
      //   if (resolvedFind === "^") resolvedFind = "^(?!\n)";
      //   else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
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

        resolvedReplace = resolve.resolveVariables(args, "replace", match, selection, selectionStartIndex, index);
        index++;

        const startPos = editor.document.positionAt(selectionStartIndex + match.index);
        const endPos = editor.document.positionAt(selectionStartIndex + match.index + match[0].length);
        const matchRange = new vscode.Range(startPos, endPos);

        if (resolvedReplace !== null) edit.replace(matchRange, resolvedReplace);
        else editor.selections = editor.selections.filter(otherSelection => otherSelection !== selection);

        selectionsWithMatches.push(selection);
        allMatches.push(match);
      }
      if (matches.length) matchesPerSelection.push(matches.length);
    })
    // }))
	}).then( async success => {
		if (!success) {
			return;
		}
    if (args.cursorMoveSelect) {
      let index = 0;
      const foundSelections = [];

      // make this async TODO
      selectionsWithMatches.forEach(selection => {
        
        // variables.resolveVariables(args, caller, groups, selection, selectionStartIndex, matchIndex)
        // let cursorMoveSelect = variables.resolveVariables(args, "cursorMoveSelect", selection.active.line, selection, null, index);
        let cursorMoveSelect = resolve.resolveVariables(args, "cursorMoveSelect", allMatches[index], selection, null, index);
        
        // line/match variables? resolve

        if (cursorMoveSelect.length) {  // don't if cursorMoveSelect === ""

          let lineEndStart = false;
          if (cursorMoveSelect.search(/^[^$]$/m) !== -1) lineEndStart = true;

          if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
          // don't do below if cursorMoveSelect is only ^ or $
          if (!lineEndStart) {
            if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;
          }
          if (args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/(?<!\r)\n/g, "\r\n");

          const selectionIndex = editor.document.offsetAt(selection.start);

          if (cursorMoveSelect === "^") {
            foundSelections.push(new vscode.Selection(selection.start, selection.start));
          }
          else if (cursorMoveSelect === "$") { // if multiple matches in the selection adjust the selection.end
            const diff = resolvedFind.length - resolvedReplace.length;
            const selPos = new vscode.Position(selection.end.line, Math.abs(selection.end.character - (matchesPerSelection[index] * diff)));
            foundSelections.push(new vscode.Selection(selPos, selPos));
          }
          else {
            const selectedRange = new vscode.Range(selection.start, selection.end);
            const selectionText = editor.document.getText(selectedRange);
            const cmsMatches = [...selectionText.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

            for (const match of cmsMatches) {
              const startPos = editor.document.positionAt(selectionIndex + match.index);
              const endPos = editor.document.positionAt(selectionIndex + match.index + match[0].length);
              foundSelections.push(new vscode.Selection(startPos, endPos));
            }
          }
        }
        index++;
			});
      if (foundSelections.length) editor.selections = foundSelections;
      if (foundSelections.length) editor.revealRange(new vscode.Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
    }
    if (args.postCommands && selectionsWithMatches.length) await commands.runPrePostCommands(args.postCommands);
	})
}


/**
 * Get just the findInCurrentFile args keys, like "title", "find", etc.
 * @returns {Array}
 */
exports.getKeys = function () {
	// preserveCase ?
  return ["title", "description", "preCommands", "find", "replace", "isRegex", "postCommands",
    "matchCase", "matchWholeWord", "restrictFind", "cursorMoveSelect"];
}


/**
 * Get just the findInCurrentFile args values, like true/false, "selections", etc.
 * @returns {Object}
 */
exports.getValues = function () {
	// preserveCase support
	return {
    title: "string", description: "string", find: "string", replace: "string",
    preCommands: "string", postCommands: "string",
		isRegex: "boolean", matchCase: "boolean", matchWholeWord: "boolean",
    restrictFind: ["document", "selections", "line", "once", "nextSelect", "nextMoveCursor", "nextDontMoveCursor",
                    "previousSelect", "previousMoveCursor", "previousDontMoveCursor"],
		cursorMoveSelect: "string"
	};
}


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
}
