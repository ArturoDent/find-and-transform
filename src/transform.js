const vscode = require('vscode');
const variables = require('./variables');


/**
 * Add any empty/words at cursor position to the editor.selections.
 * Modifies existing selections.
 * @param {vscode.window.activeTextEditor} editor
 */
exports.addEmptySelectionMatches = function (editor) {

	editor.selections.forEach(selection => {

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
	});
}


/**
 * If find but no replace, just select all matches in entire document or pre-existing selections
 * while removing all the original selections. 
 * Also covers no find/no replace.
 *
 * @param {vscode.TextEditor} editor
 * @param {Object} args - keybinding/settings args
 */
exports.findAndSelect = function (editor, args) {

  const foundSelections = [];
  const document = vscode.window.activeTextEditor.document;

  if (args.restrictFind === "document") {
    
    let docRange;
    let fullText;
    let matches;

    // "ignoreLineNumbers" so lineNumber/Index are passed through unresolved
    let resolvedFind = variables.buildReplace(args, "ignoreLineNumbers", null, editor.selection, null, null);
    resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
    if (!resolvedFind) return;
    
    if (args.isRegex) {
      if (resolvedFind === "^") resolvedFind = "^(?!\n)";
      else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
    }
    
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

		matches?.forEach((match, index) => {
			const startPos = editor.document.positionAt(match.index);
			const endPos = editor.document.positionAt(match.index + match[0].length);
			foundSelections[index] = new vscode.Selection(startPos, endPos);
		});
    if (foundSelections.length) editor.selections = foundSelections; // this will not? remove all the original selections
    if (foundSelections.length) editor.revealRange(new vscode.Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
	}

	else {  // restrictFind === "selections/once/line"

    let selectedRange;
    let matches;

    editor.selections.forEach(selection => {
      
      // "ignoreLineNumbers" so lineNumber/Index are passed through unresolved
      // TODO selection arg = "" ?
      let resolvedFind = variables.buildReplace(args, "ignoreLineNumbers", null, selection, null, null);
      resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
      if (!resolvedFind) return;
      
      if (args.isRegex) {
        if (resolvedFind === "^") resolvedFind = "^(?!\n)";
        else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
      }     

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
          // searchText = fullLine.substring(selection.active.character);
          const wordRangeAtCursor = editor.document.getWordRangeAtPosition(selection.active);
          if (wordRangeAtCursor) searchText = fullLine.substring(wordRangeAtCursor?.start?.character);
          else searchText = fullLine.substring(selection?.start?.character);
          
          if (!searchText) return;
          
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
          lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
          // this starts at the beginning of the current word
          subStringIndex = editor.document.getWordRangeAtPosition(selection.active)?.start?.character;
          // if no curent word = empty line or at spaces between words or at end of a line with a space
          if (subStringIndex === undefined) subStringIndex = selection.active?.character;
        }

        if (matches?.length) {  // just do once
          const startPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index);
          const endPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
          foundSelections.push(new vscode.Selection(startPos, endPos));
        }
      }
		});
    if (foundSelections.length) editor.selections = foundSelections; // TODO this will not? remove all the original selections
	}
}

/**
 * Replace find matches on the current line.
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replaceInLine = function (editor, edit, args) {

	let currentLine = "";
  let foundSelections = [];

	if (args.restrictFind === "line") {

		// get all the matches on the line
    let lineIndex;
    let lines = [];
    let index = 0;

    // handle 'Error: Overlapping ranges are not allowed!` 2 cursors on the same line
    editor.edit(function (edit) {

      editor.selections.forEach(selection => {
        
        let matches = [];

        let resolvedFind = variables.buildReplace(args, "find", null, selection, null, index);
        resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
        if (!resolvedFind && !args.replace) return;
        
        if (args.isRegex) {
          if (resolvedFind === "^") resolvedFind = "^(?!\n)";
          else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
        }

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
		        
        matches?.forEach((match) => {

          lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));

          let resolvedReplace = variables.buildReplace(args, "replace", match, selection, null, index);
					
          const startPos = editor.document.positionAt(lineIndex + match.index);
          const endPos = editor.document.positionAt(lineIndex + match.index + match[0].length);
          const matchRange = new vscode.Range(startPos, endPos);
          edit.replace(matchRange, resolvedReplace); // 'Error: Overlapping ranges are not allowed!`
          lines[index++] = startPos.line;
          // should these select? or clear all selections?
        });
      })
    }).then(success => {
      if (!success) {
        return;
      }

      if (args.cursorMoveSelect) {

        let index = 0;

        for (const line of lines) {

          let cursorMoveSelect = variables.buildReplace(args, "cursorMoveSelect", line, editor.selection, null, index);
          index++;
          
          if (args.isRegex) {
            if (cursorMoveSelect === "^") cursorMoveSelect = "^(?!\n)";
            else if (cursorMoveSelect === "$") cursorMoveSelect = "$(?!\n)";
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
    });
	}

  // change to: from beginning of current word to end of line
	else if (args.restrictFind === "once") {  // from cursor to end of line

		let fullLine = "";
		let lineIndex;
    let subStringIndex;
    let lines = [];
    let subStringIndices = [];
    
    editor.edit(function (edit) {

      let index = 0;
      editor.selections.forEach(selection => {

        let resolvedFind = variables.buildReplace(args, "find", null, selection, null, index);
        resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
        if (!resolvedFind && !args.replace) return;  // correct here or already handled in findAndSelect?
        
        if (args.isRegex) {
          if (resolvedFind === "^") resolvedFind = "^(?!\n)";
          else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
        }        

        const re = new RegExp(resolvedFind, args.regexOptions);
        // get first match on line from cursor forward
        fullLine = editor.document.getText(editor.document.lineAt(selection.active.line).rangeIncludingLineBreak);
        // currentLine = fullLine.substring(selection.active.character);
        const currentWordRange = editor.document.getWordRangeAtPosition(selection.active);
        if (resolvedFind && !currentWordRange) return;
        
        subStringIndex = currentWordRange.start.character;        
        // currentLine = fullLine.substring(selection.active.character);
        currentLine = fullLine.substring(subStringIndex);        
        
        // use matchAll() to get index even though only using the first one
        const matches = [...currentLine.matchAll(re)];

        if (matches.length) {  // just do once
          
          lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
          // subStringIndex = selection.active.character;

          let resolvedReplace = variables.buildReplace(args, "replace", matches[0], selection, null, index);

          const startPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index);
          const endPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
          const matchRange = new vscode.Range(startPos, endPos);

          edit.replace(matchRange, resolvedReplace);
          lines[index] = startPos.line;
          subStringIndices[index++] = subStringIndex + matches[0].index; // so cursorMoveSelect is only after a once match
          // should these select? else get weird effect where vscode tries to maintain the selection size if a wordAtCursor
        }
      });
    }).then(success => {
      if (!success) {
        return;
      }

      if (args.cursorMoveSelect) {
            
        let index = 0;
        for (const line of lines) {

          let cursorMoveSelect = variables.buildReplace(args, "cursorMoveSelect", line, editor.selection, null, index);

          if (args.isRegex) {
            if (cursorMoveSelect === "^") cursorMoveSelect = "^(?!\n)";
            else if (cursorMoveSelect === "$") cursorMoveSelect = "$(?!\n)";
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
    });
	}
}

/**
 * Replace the next find match in the entire document
 * Select or not
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {Object} args - keybinding/settings args
 */
exports.replaceNextInWholeDocument = function (editor, edit, args) {

  // make work for multiple selections ?? TODO
  const document = editor.document;
  let resolvedReplace;
  let matchEndPos;
  let documentBeforeCursor;
  
  let matches;
  let match;
  const foundSelections = [];

  let cursorIndex = document.offsetAt(editor.selection.active);
  const docString = document.getText();
  
  let resolvedFind = variables.buildReplace(args, "ignoreLineNumbers", null, editor.selection, cursorIndex, null);
  resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
  if (!resolvedFind) return;

  if (args.isRegex) {
    if (resolvedFind === "^") resolvedFind = "^(?!\n)";
    else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
  }

  if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
    // lineCount is 1-based, so need to subtract 1 from it
    const lastLineRange = document.lineAt(document.lineCount - 1).range;
    const restOfDocRange = new vscode.Range(editor.selection.active.line, editor.selection.active.character, document.lineCount - 1, lastLineRange.end.character);
    matches = _buildLineNumberMatches(resolvedFind, restOfDocRange);
    cursorIndex = 0;
  }

  else {
    const re = new RegExp(resolvedFind, args.regexOptions);
    let restOfDocument = docString.substring(cursorIndex);  // text after cursor
    matches = [...restOfDocument.matchAll(re)];
  }

  if (matches?.length) {
    match = matches[0];
    if (resolvedFind === "^(?!\n)") {
      if (matches.length > 1) match = matches[1];
      else matches = [];
    }
    else if (resolvedFind === "$(?!\n)") {
      if (matches.length > 1 && match.index === 0) match = matches[1];
      else if (matches.length === 1 && match.index === 0) matches = [];
    }
  }

  if (!matches.length) {                // check text before the cursor, so it will wrap
    
    if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
      const docRangeBeforeCursor = new vscode.Range(0,0, editor.selection.active.line, editor.selection.active.character);
      cursorIndex = 0;
      matches = _buildLineNumberMatches(resolvedFind, docRangeBeforeCursor);
    }
    else {
      const re = new RegExp(resolvedFind, args.regexOptions);
      documentBeforeCursor = docString.substring(0, cursorIndex);
      cursorIndex = 0;
      matches = [...documentBeforeCursor.matchAll(re)];
    }
    match = matches[0];
  }
  
	if (!matches.length) return;  // no match before or after cursor

  editor.edit(function (edit) {
    
    let index = 0;

    if (args.replace) {
      resolvedReplace = variables.buildReplace(args, "replace", match, editor.selection, cursorIndex + match.index, index);
      index++;
      
      if (args.isRegex) resolvedReplace = resolvedReplace.replace(/(?<!\r)\n/g, "\r\n");

			const startPos = document.positionAt(cursorIndex + match.index);
			const endPos = document.positionAt(cursorIndex + match.index + match[0].length);
			const matchRange = new vscode.Range(startPos, endPos)
      edit.replace(matchRange, resolvedReplace);
		}
	}).then(success => {
		if (!success) {
			return;
		}
		if (args.restrictFind === "nextSelect") {
			const matchStartPos = document.positionAt(cursorIndex + match.index);
			if (args.replace) {
				matchEndPos = document.positionAt(cursorIndex + match.index + resolvedReplace.length);
			}
			else matchEndPos = document.positionAt(cursorIndex + match.index + match[0].length);
			foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
      editor.selections = foundSelections;
      if (foundSelections.length) editor.revealRange(new vscode.Range(matchStartPos, matchEndPos), 2);  // InCenterIfOutsideViewport
    }
    
    else if (args.restrictFind === "nextMoveCursor") {
			if (args.replace) {
				matchEndPos = document.positionAt(cursorIndex + match.index + resolvedReplace.length);
			}
			else matchEndPos = document.positionAt(cursorIndex + match.index + match[0].length);
			foundSelections.push(new vscode.Selection(matchEndPos, matchEndPos));
      editor.selections = foundSelections;
      if (foundSelections.length) editor.revealRange(new vscode.Range(matchEndPos, matchEndPos), 2);  // InCenterIfOutsideViewport
    }
      
    else if (args.restrictFind === "nextDontMoveCursor") { }   // do nothing, edit already made
	});
}


/**
 * If find has ${lineNumber} or ${lineIndex} check match on each line 
 * 
 * @param {String} find - value to match
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

    const resolved = find.replaceAll("${lineNumber}", String(line + 1)).replaceAll("${lineIndex}", String(line));
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
exports.replaceInWholeDocument = function (editor, edit, args) {

  const document = editor.document;
  let docRange;
  let fullText;
  let matches = [];
  let resolvedFind = "";
  let resolvedReplace;

  if (args.find) {
    resolvedFind = variables.buildReplace(args, "ignoreLineNumbers", null, editor.selection, null, null);
    resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
  }

  if (args.isRegex) {
    if (resolvedFind === "^") resolvedFind = "^(?!\n)";
    else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
  }

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
      resolvedReplace = variables.buildReplace(args, "replace", match, editor.selection, null, index);
      if (args.isRegex) resolvedReplace = resolvedReplace.replace(/(?<!\r)\n/g, "\r\n");  // might be unnecessary

			const matchStartPos = document.positionAt(match.index);
			const matchEndPos = document.positionAt(match.index + match[0].length);
      const matchRange = new vscode.Range(matchStartPos, matchEndPos);
      editBuilder.replace(matchRange, resolvedReplace);
      matches[index++].line = matchStartPos.line;
		}
	}).then(success => {
		if (!success) {
			return;
		}
    if (args.cursorMoveSelect) {
      
      const foundSelections = [];

      let index = 0;

      for (const match of matches) {

        let cursorMoveSelect = variables.buildReplace(args, "cursorMoveSelect", match, editor.selection, match.index, index);
        if (cursorMoveSelect === "") return;
        index++;
        
        if (args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/(?<!\r)\n/g, "\r\n");

        if (args.isRegex) {
          if (cursorMoveSelect === "^") cursorMoveSelect = "^(?!\n)";
          else if (cursorMoveSelect === "$") cursorMoveSelect = "$(?!\n)";
        }

        if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
        if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

        const re = new RegExp(cursorMoveSelect, args.regexOptions);
        const line = document.lineAt(match.line);
        const lineText = document.getText(line.rangeIncludingLineBreak);
        const lineIndex = document.offsetAt(line.range.start);
        
        const cmsMatches = [...lineText.matchAll(re)];

        for (const match of cmsMatches) {
          const startPos = document.positionAt(lineIndex + match.index);
          const endPos = document.positionAt(lineIndex + match.index + match[0].length);
          foundSelections.push(new vscode.Selection(startPos, endPos));
        }
      }
      if (foundSelections.length) editor.selections = foundSelections;
      if (foundSelections.length) editor.revealRange(new vscode.Range(foundSelections[0].start, foundSelections[0].end), 2);  // InCenterIfOutsideViewport
    }
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
exports.replaceInSelections = function (editor, edit, args) {

  const document = vscode.window.activeTextEditor.document;
  let selectionsWithMatches = [];
  let resolvedFind;
  let resolvedReplace;
  let matches;
  let matchesPerSelection = [];

  editor.edit(function (edit) {

    let index = 0;

    editor.selections.forEach(selection => {

      // empty selections, pointReplacements TODO
      // could filter out empty selections first
      const selectedRange = new vscode.Range(selection.start, selection.end);
      let selectionStartIndex = document.offsetAt(selection.start);

      resolvedFind = variables.buildReplace(args,  "ignoreLineNumbers", null, selection, null, index);
      resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
      if (!resolvedFind && !args.replace) return;
      
      if (args.isRegex) {
        if (resolvedFind === "^") resolvedFind = "^(?!\n)";
        else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
      }
  
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

        resolvedReplace = variables.buildReplace(args, "replace", match, selection, selectionStartIndex, index);
        index++;

        const startPos = editor.document.positionAt(selectionStartIndex + match.index);
        const endPos = editor.document.positionAt(selectionStartIndex + match.index + match[0].length);
        const matchRange = new vscode.Range(startPos, endPos);

        if (resolvedReplace !== null) edit.replace(matchRange, resolvedReplace);
        else editor.selections = editor.selections.filter(otherSelection => otherSelection !== selection);

        selectionsWithMatches.push(selection);
      }
      if (matches.length) matchesPerSelection.push(matches.length);
    })
	}).then(success => {
		if (!success) {
			return;
		}
    if (args.cursorMoveSelect) {
      let index = 0;
      const foundSelections = [];

      selectionsWithMatches.forEach(selection => {
        
        let cursorMoveSelect = variables.buildReplace(args, "cursorMoveSelect", selection.active.line, selection, null, index);
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
            const selPos = new vscode.Position(selection.end.line, selection.end.character - (matchesPerSelection[index] * diff));
            foundSelections.push(new vscode.Selection(selPos, selPos));
          }
          else {
            const selectedRange = new vscode.Range(selection.start, selection.end);
            const selectionText = editor.document.getText(selectedRange);
            const matches = [...selectionText.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

            for (const match of matches) {
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
	})
}


/**
 * Wrap or escape the findValue if matchWholeWord or not a regexp.
 * @param {String} findValue 
 * @param {Boolean} isRegex 
 * @param {Boolean} matchWholeWord 
 * @param {Boolean} madeFind 
 * @returns {String} findValue escaped or wrapped
 */
function _adjustFindValue(findValue, isRegex, matchWholeWord, madeFind) {

	if (matchWholeWord) findValue = findValue.replace(/\\b/g, "@%@");

	// removed escaping the or | if madeFind
	if (!isRegex && madeFind) findValue = findValue.replace(/([+?$^.\\*\{\}\[\]\(\)])/g, "\\$1");
  else if (!isRegex) findValue = findValue.replace(/([+?^.\\*\[\]\(\)]|\$(?!{line(Number|Index)})|\{(?!line(Number|Index)})|(?<!\$\{lineNumber)(?<!\$\{lineIndex)\})/g, "\\$1");
  
	if (matchWholeWord) findValue = findValue.replace(/@%@/g, "\\b");
	if (matchWholeWord && !madeFind) findValue = `\\b${ findValue }\\b`;

  // since all \n are replaced by \r?\n by vscode
  if (isRegex) findValue = findValue.replace(/\n/g, "\r?\n");

	return findValue;
}


/**
 * Get just the findInCurrentFile args keys, like "title", "find", etc.
 * @returns {Array}
 */
exports.getKeys = function () {
	// preserveCase ?
	return ["title", "find", "replace", "isRegex", "matchCase", "matchWholeWord", "restrictFind", "cursorMoveSelect"];
}


/**
 * Get just the findInCurrentFile args values, like true/false, "selections", etc.
 * @returns {Object}
 */
exports.getValues = function () {
	// preserveCase ?
	return {
		title: "string", find: "string", replace: "string", isRegex: [true, false], matchCase: [true, false],
		matchWholeWord: [true, false],
		restrictFind: ["document", "selections", "line", "once", "nextSelect", "nextMoveCursor", "nextDontMoveCursor"],
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
		"find": "",
		"replace": "",
		"isRegex": "false",
		"matchCase": "false",
		"matchWholeWord": "false",
		"restrictFind": "document",
		"cursorMoveSelect": ""
	};
	// "preserveCase": "false" ?
}
