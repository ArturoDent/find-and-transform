const vscode = require('vscode');
const variables = require('./variables');


/**
 * Find and transform any case identifiers with or without capture groups
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param { String[] | any[] } findReplaceArray - this setting
 */
exports.findTransform = async function (editor, edit, findReplaceArray) {

  let clipText = "";
  await vscode.env.clipboard.readText().then(string => {
    clipText = string;
  });

  let madeFind = false;
  const loopKeys = { restrictFind: "document", isRegex: false, cursorMoveSelect: "", matchWholeWord: false, matchCase: false };

  Object.keys(loopKeys).forEach((key, index) => {
    const item = Object.entries(findReplaceArray).filter(item => (typeof item[1][key] === 'boolean' || item[1][key] || item[0] === key));
    if (item.length) loopKeys[Object.keys(loopKeys)[index]] = item[0][1][key] ?? item[0][1];
  });

	let findValue = "";
	  // returns an empty [] if no 'find'
	const findItem = Object.entries(findReplaceArray).filter(item => (item[1].find || item[0] === 'find'));
	if (findItem.length) {
		findValue = findItem[0][1].find ?? findItem[0][1];
	}
	// no 'find' key generate a findValue using the selected words/wordsAtCursors as the 'find' value
	// TODO  what if find === "" empty string?
	else {
		findValue = _makeFind(editor.selections, loopKeys.restrictFind, loopKeys.matchWholeWord, loopKeys.isRegex);
		madeFind = true;
	}

	let replaceValue = null;
	// lots of extra work because string.replace is a function and so true
	// not the case for 'find' or 'restrictFind'
	// possible to change to 'replace' in registerCommand?
	const replaceItem = Object.entries(findReplaceArray).filter(item => {
		if (typeof item[1] === 'string') return item[0] === 'replace';  // keybinding from a setting
		else if (item[1].replace === '') return item;
		else return item[1].replace;   // from keybinding not from a setting
	});
	if (replaceItem.length) {
		if (typeof replaceItem[0][1] === 'string') {
			replaceValue = replaceItem[0][1];
		}
		else {
			replaceValue = replaceItem[0][1].replace;
		}
	}
	else if (!findItem.length) {  // no find and no replace, TODO check here late parse effect?
		replaceValue = "$1";
		loopKeys.isRegex = true;
		findValue = `(${ findValue })`;
	}

	let regexOptions = "gmi";
  if (loopKeys.matchCase) regexOptions = "gm";
  
  const args = { findValue, replaceValue, regexOptions, madeFind, clipText };
  Object.assign(args, loopKeys);

	// no find and no replace
  if (!findItem.length && !replaceItem.length && !args.restrictFind.startsWith("next"))
    _findAndSelect(editor, args); // find and select all even if restrictFind === selections

	// add all "empty selections" to editor.selections_replaceInSelections
	else if (args.restrictFind === "selections" && args.replaceValue !== null) {
		_addEmptySelectionMatches(editor, args.regexOptions);
		_replaceInSelections(editor, edit, args);
  }
    
	else if ((args.restrictFind === "line" || args.restrictFind === "once") && replaceValue !== null) {
		_replaceInLine(editor, edit, args);
  }
    
	// find/noFind and replace/noReplace, restrictFind = nextSelect/nextMoveCursor/nextDontMoveCursor
  else if (args.restrictFind === "nextMoveCursor" || args.restrictFind === "nextSelect" || args.restrictFind === "nextDontMoveCursor") {
		_replaceNextInWholeDocument(editor, edit, args);
  }
    
	// find and replace, restrictFind = document/default
  else if (replaceValue !== null) {
    _replaceInWholeDocument(editor, edit, args);
  }
	
  else _findAndSelect(editor, args);   // find but no replace
}


/**
 * When no 'find' key in command: make a find value for use as a regexp
 * from all selected words or words at cursor positions wrapped by word boundaries \b
 *
 * @param {Array<vscode.Selection>} selections
 * @param {String} restrictFind
 * @param {Boolean} matchWholeWord
 * @param {Boolean} isRegex
 * @returns {String} - selected text '(\\ba\\b|\\bb c\\b|\\bd\\b)'
 */
function _makeFind(selections, restrictFind, matchWholeWord, isRegex) {

	const document = vscode.window.activeTextEditor.document;
	let selectedText = "";
	let find = "";

	// only use the first selection for these options
	if (restrictFind.substring(0,4) === "next") {
		selections = [selections[0]];
	}

	selections.forEach((selection, index) => {

		if (selection.isEmpty) {
			const wordRange = document.getWordRangeAtPosition(selection.start);
			selectedText = document.getText(wordRange);
		}
		else {
			const selectedRange = new vscode.Range(selection.start, selection.end);
			selectedText = document.getText(selectedRange);
		}

		let boundary = "";
		if (matchWholeWord) boundary = "\\b";

		// wrap with word boundaries \b must be escaped to \\b
		if (index < selections.length-1) find += `${ boundary }${ selectedText }${ boundary }|`;  // add an | or pipe to end
		else find += `${boundary }${ selectedText }${ boundary }`;
	});

	if (isRegex) find = `(${ find })`;  // e.g. "(\\bword\\b|\\bsome words\\b|\\bmore\\b)"
	return find;
}

/**
 * Add any empty/words at cursor position to the selections
 * @param {vscode.window.activeTextEditor} editor
 * @param {String} regexOptions
 */
function _addEmptySelectionMatches(editor, regexOptions) {

	editor.selections.forEach(selection => {

		const emptySelections = [];

		// if selection start = end then just a cursor no actual selected text
		if (selection.isEmpty) {

			const wordRange = editor.document.getWordRangeAtPosition(selection.start);
			let word;
			if (wordRange) word = editor.document.getText(wordRange);
				// TODO can word include regex characters, if the selection is empty?
			else return;

			// get all the matches in the document
			const fullText = editor.document.getText();
			const matches = [...fullText.matchAll(new RegExp(word, regexOptions))];

			matches.forEach((match, index) => {
				const startPos = editor.document.positionAt(match.index);
				const endPos = editor.document.positionAt(match.index + match[0].length);

				// don't add match of empty selection if it is already contained in another selection
				const found = editor.selections.find(selection => selection.contains(new vscode.Range(startPos, endPos)));
				if (!found) emptySelections[index] = new vscode.Selection(startPos, endPos);
			});

			// filter out the original empty selection
			editor.selections = editor.selections.filter(oldSelection => oldSelection !== selection);
			editor.selections = emptySelections.concat(editor.selections);
		}
	});
}


/**
 * If find but no replace, just select all matches in entire docuemnt or pre-existing selections
 * while removing all the original selections. 
 * Also covers no find/no replace.
 *
 * @param {vscode.TextEditor} editor
 * @param {Object} args
 */
function _findAndSelect(editor, args) {

  const foundSelections = [];
  const document = vscode.window.activeTextEditor.document;

  if (args.restrictFind === "document") {
    
    let docRange;
    let fullText;
    let matches;

    // "ignoreLineNumbers" so lineNumber/Index are passed through unresolved
    let resolvedFind = variables.buildReplace(args.findValue, null, "ignoreLineNumbers", args.isRegex, editor.selections[0], args.clipText, "document");
    resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

    if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
      // lineCount is 1-based, so need to subtract 1 from it
      const lastLineRange = document.lineAt(document.lineCount - 1).range;
      docRange = new vscode.Range(0, 0, document.lineCount - 1, lastLineRange.end.character);
      matches = buildLineNumberMatches(resolvedFind, docRange);
    }

    // else get all the matches in the document, resolvedFind !== lineNumber/lineIndex
    else {
      fullText = editor.document.getText();
      matches = [...fullText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
    }

		matches.forEach((match, index) => {
			const startPos = editor.document.positionAt(match.index);
			const endPos = editor.document.positionAt(match.index + match[0].length);
			foundSelections[index] = new vscode.Selection(startPos, endPos);
		});
    if (foundSelections.length) editor.selections = foundSelections; // TODO this will not? remove all the original selections
    if (foundSelections.length) vscode.commands.executeCommand('revealLine', { lineNumber: foundSelections[0].start.line, at: "bottom" });
	}

	else {  // restrictFind === "selections/once/line"

    let selectedRange;
    let matches;

    editor.selections.forEach(selection => {
      
      // "ignoreLineNumbers" so lineNumber/Index are passed through unresolved
      let resolvedFind = variables.buildReplace(args.findValue, null, "ignoreLineNumbers", args.isRegex, selection, args.clipText, "");
      resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

      let searchText;

      if (args.restrictFind === "selections") {
          
        if (selection.isEmpty) {
          selectedRange = editor.document.getWordRangeAtPosition(selection.start);
        }
        else selectedRange = new vscode.Range(selection.start, selection.end);

        if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1)
          matches = buildLineNumberMatches(resolvedFind, selectedRange);

        else {
          searchText = editor.document.getText(selectedRange);
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
        }

        matches.forEach((match) => {
          const startPos = editor.document.positionAt(match.index);
          const endPos = editor.document.positionAt(match.index + match[0].length);
          foundSelections.push(new vscode.Selection(startPos, endPos));
        });
        // a very long off-screen selection?
        // vscode.commands.executeCommand('revealLine', { lineNumber: document.positionAt(matches[0].index).line, at: "bottom" });
      }

      else if (args.restrictFind === "line") {

        let lineIndex = 0;

        if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
          let selectedLineRange = document.lineAt(selection.active.line).range;
          matches = buildLineNumberMatches(resolvedFind, selectedLineRange);
        }
        else {
          searchText = editor.document.lineAt(selection.active.line).text;
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
          lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
        }

        for (const match of matches) {
          const startPos = editor.document.positionAt(lineIndex + match.index);
          const endPos = editor.document.positionAt(lineIndex + match.index + match[0].length);
          foundSelections.push(new vscode.Selection(startPos, endPos));
        }
      }
        
      else if (args.restrictFind === "once") {

        let lineIndex = 0;
        let subStringIndex = 0;

        if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
          let lineRange = document.lineAt(selection.active.line).range;
          let subLineRange = lineRange.with({ start: selection.active });
          matches = buildLineNumberMatches(resolvedFind, subLineRange);
        }

        else {
          const fullLine = editor.document.lineAt(selection.active.line).text;
          searchText = fullLine.substring(selection.active.character);
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
          lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
          subStringIndex = selection.active.character;
        }

        if (matches.length) {  // just do once
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
 * @param {Object} args
 */
async function _replaceInLine(editor, edit, args) {

	let currentLine = "";
  let foundSelections = [];

	if (args.restrictFind === "line") {

		// get all the matches on the line
    let lineIndex;
    let matches;
    let lines = [];
    let index = 0;

    editor.edit(function (edit) {

      editor.selections.forEach(selection => {

        let resolvedFind = variables.buildReplace(args.findValue, null, "find", args.isRegex, selection, args.clipText, "line");
        resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

        const re = new RegExp(resolvedFind, args.regexOptions);
        currentLine = editor.document.lineAt(selection.active.line).text;
        matches = [...currentLine.matchAll(re)];
		        
        for (const match of matches) {

          lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));

          let resolvedReplace = variables.buildReplace(args.replaceValue, match, "replace", args.isRegex, selection, args.clipText, "line");
          resolvedReplace = variables.resolveMatchVariable(resolvedReplace, index);
					
          const matchStartPos = editor.document.positionAt(lineIndex + match.index);
          const matchEndPos = editor.document.positionAt(lineIndex + match.index + match[0].length);
          const matchRange = new vscode.Range(matchStartPos, matchEndPos);
          edit.replace(matchRange, resolvedReplace);
          lines[index++] = matchStartPos.line;
        }
      })
    }).then(success => {
      if (!success) {
        return;
      }

      if (args.cursorMoveSelect) {

        let index = 0;

        for (const line of lines) {

          let cursorMoveSelect = variables.buildReplace(args.cursorMoveSelect, line, "cursorMoveSelect", args.isRegex, null, args.clipText, "line");
          cursorMoveSelect = variables.resolveMatchVariable(cursorMoveSelect, index++);

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
            const matchStartPos = editor.document.positionAt(lineIndex + match.index);
            const matchEndPos = editor.document.positionAt(lineIndex + match.index + match[0].length);
            foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
          }
        }
      }
      if (foundSelections.length) editor.selections = foundSelections;
    });
	}

	else if (args.restrictFind === "once") {  // from cursor to end of line

		let fullLine = "";
		let lineIndex;
    let subStringIndex;
    let lines = [];
    let subStringIndices = [];
    
    editor.edit(function (edit) {

      let index = 0;
      editor.selections.forEach(selection => {

        let resolvedFind = variables.buildReplace(args.findValue, null, "find", args.isRegex, selection, args.clipText, "once");
        resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

        const re = new RegExp(resolvedFind, args.regexOptions);
        // get first match on line from cursor forward
        fullLine = editor.document.lineAt(selection.active.line).text;
        currentLine = fullLine.substring(selection.active.character);

        // use matchAll() to get index even though only using the first one
        const matches = [...currentLine.matchAll(re)];

        if (matches.length) {  // just do once
          
          lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
          subStringIndex = selection.active.character;

          let resolvedReplace = variables.buildReplace(args.replaceValue, matches[0], "replace", args.isRegex, selection, args.clipText, "once");
          resolvedReplace = variables.resolveMatchVariable(resolvedReplace, index);

          const matchStartPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index);
          const matchEndPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
          const matchRange = new vscode.Range(matchStartPos, matchEndPos);

          edit.replace(matchRange, resolvedReplace);
          lines[index] = matchStartPos.line;
          subStringIndices[index++] = subStringIndex + matches[0].index; // so cursorMoveSelect is only after a once match
        }
      });
    }).then(success => {
      if (!success) {
        return;
      }

      if (args.cursorMoveSelect) {
            
        let index = 0;
        for (const line of lines) {

          let cursorMoveSelect = variables.buildReplace(args.cursorMoveSelect, line, "cursorMoveSelect", args.isRegex, null, args.clipText, "once");
          cursorMoveSelect = variables.resolveMatchVariable(cursorMoveSelect, index);

          if (args.isRegex) {
            if (cursorMoveSelect === "^") cursorMoveSelect = "^(?!\n)";
            else if (cursorMoveSelect === "$") cursorMoveSelect = "$(?!\n)";
          }

          if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
          if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

          // subStringIndex = subStringIndices[index++];
          if (cursorMoveSelect !== "^(?!\n)") subStringIndex = subStringIndices[index++];
          else {
            subStringIndex = 0;
            index++;
          }

          currentLine = editor.document.lineAt(line).text.substring(subStringIndex);
          lineIndex = editor.document.offsetAt(editor.document.lineAt(line).range.start);
          const cmsMatches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];
            
          if (cmsMatches.length) {  // just select the first/once cursorMoveSelect match
            const matchStartPos = editor.document.positionAt(lineIndex + subStringIndex + cmsMatches[0].index);
            const matchEndPos = editor.document.positionAt(lineIndex + subStringIndex + cmsMatches[0].index + cmsMatches[0][0].length);
            foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
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
 * @param {Object} args
 */
async function _replaceNextInWholeDocument(editor, edit, args) {

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
  
  let resolvedFind = variables.buildReplace(args.findValue, null, "ignoreLineNumbers", args.isRegex, editor.selection, args.clipText, "next", cursorIndex);
  resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

  if (args.isRegex) {
    if (resolvedFind === "^") resolvedFind = "^(?!\n)";
    else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
  }

  if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
    // lineCount is 1-based, so need to subtract 1 from it
    const lastLineRange = document.lineAt(document.lineCount - 1).range;
    const restOfDocRange = new vscode.Range(editor.selection.active.line, editor.selection.active.character, document.lineCount - 1, lastLineRange.end.character);
    matches = buildLineNumberMatches(resolvedFind, restOfDocRange);
    cursorIndex = 0;
  }

  else {
    const re = new RegExp(resolvedFind, args.regexOptions);
    let restOfDocument = docString.substring(cursorIndex);  // text after cursor
    matches = [...restOfDocument.matchAll(re)];
  }

  if (matches.length) {
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
      matches = buildLineNumberMatches(resolvedFind, docRangeBeforeCursor);
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

    if (args.replaceValue) {
      resolvedReplace = variables.buildReplace(args.replaceValue, match, "replace", args.isRegex, editor.selection, args.clipText, "next", cursorIndex + match.index);
      resolvedReplace = variables.resolveMatchVariable(resolvedReplace, index++);
      resolvedReplace = variables.resolveLineVariable(resolvedReplace, cursorIndex + match.index);

			const matchStartPos = document.positionAt(cursorIndex + match.index);
			const matchEndPos = document.positionAt(cursorIndex + match.index + match[0].length);
			const matchRange = new vscode.Range(matchStartPos, matchEndPos)
      edit.replace(matchRange, resolvedReplace);
		}
	}).then(success => {
		if (!success) {
			return;
		}
		if (args.restrictFind === "nextSelect") {
			const matchStartPos = document.positionAt(cursorIndex + match.index);
			if (args.replaceValue) {
				matchEndPos = document.positionAt(cursorIndex + match.index + resolvedReplace.length);
			}
			else matchEndPos = document.positionAt(cursorIndex + match.index + match[0].length);
			foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
      editor.selections = foundSelections;
      if (foundSelections.length) vscode.commands.executeCommand('revealLine', { lineNumber: foundSelections[0].start.line, at: "bottom" });
    }
    
    else if (args.restrictFind === "nextMoveCursor") {
			if (args.replaceValue) {
				matchEndPos = document.positionAt(cursorIndex + match.index + resolvedReplace.length);
			}
			else matchEndPos = document.positionAt(cursorIndex + match.index + match[0].length);
			foundSelections.push(new vscode.Selection(matchEndPos, matchEndPos));
      editor.selections = foundSelections;
      if (foundSelections.length) vscode.commands.executeCommand('revealLine', { lineNumber: foundSelections[0].start.line, at: "bottom" });
    }
      
    else if (args.restrictFind === "nextDontMoveCursor") { }   // do nothing, edit already made
	});
}


/**
 * If find has ${lineNumber} or ${lineIndex} match each line 
 * 
 * @param {String} find - value to match
 * @param {vscode.Range} range - line or selection range within which to search
 * @returns {Array} of matches
 */
function buildLineNumberMatches(find, range) {
  
  let matches = [];
  const document = vscode.window.activeTextEditor.document;
  const startLineNumber = range.start.line;
  const endLineNumber = range.end.line;

  for (let line = startLineNumber; line <= endLineNumber; line++)  {

    const lineIndex = document.offsetAt(new vscode.Position(line, 0));
    let lineText = document.lineAt(line).text;

    // for selections/once
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
 * @param {Object} args
 */


async function _replaceInWholeDocument(editor, edit, args) {

  const document = editor.document;
  let docRange;
  let fullText;
  let matches;
  let resolvedReplace;

  let resolvedFind = variables.buildReplace(args.findValue, null, "ignoreLineNumbers", args.isRegex, editor.selection, args.clipText, "document");
  resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

  if (args.isRegex) {
    if (resolvedFind === "^") resolvedFind = "^(?!\n)";
    else if (resolvedFind === "$") resolvedFind = "$(?!\n)";
  }

  if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
    // lineCount is 1-based, so need to subtract 1 from it
    const lastLineRange = document.lineAt(document.lineCount - 1).range;
    docRange = new vscode.Range(0, 0, document.lineCount - 1, lastLineRange.end.character);
    matches = buildLineNumberMatches(resolvedFind, docRange);
  }

  // get all the matches in the document, resolvedFind !== lineNumber/lineIndex
  else {
    fullText = document.getText();
    matches = [...fullText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
  }

	editor.edit(function (edit) {

    let index = 0;

		for (const match of matches) {
      resolvedReplace = variables.buildReplace(args.replaceValue, match, "ignoreLineNumbers", args.isRegex, editor.selection, args.clipText, "document");
      resolvedReplace = variables.resolveMatchVariable(resolvedReplace, index);
      resolvedReplace = variables.resolveLineVariable(resolvedReplace, match.index);

			const matchStartPos = document.positionAt(match.index);
			const matchEndPos = document.positionAt(match.index + match[0].length);
      const matchRange = new vscode.Range(matchStartPos, matchEndPos);
      edit.replace(matchRange, resolvedReplace);
      // TODO should these all be selected?  easy to see?
      matches[index++].line = matchStartPos.line;
		}
	}).then(success => {
		if (!success) {
			return;
		}
    if (args.cursorMoveSelect) {
      
      // if (args.cursorMoveSelect === "^") return;

      const foundSelections = [];

      let index = 0;

      for (const match of matches) {

        let cursorMoveSelect = variables.buildReplace(args.cursorMoveSelect, match, "cursorMoveSelect", args.isRegex, null, args.clipText, "document", match.index);
        if (cursorMoveSelect === "") return;

        cursorMoveSelect = variables.resolveMatchVariable(cursorMoveSelect, index++);
        cursorMoveSelect = variables.resolveLineVariable(cursorMoveSelect, match.index);

        if (args.isRegex) {
          if (cursorMoveSelect === "^") cursorMoveSelect = "^(?!\n)";
          else if (cursorMoveSelect === "$") cursorMoveSelect = "$(?!\n)";
        }

        if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
        if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

        const re = new RegExp(cursorMoveSelect, args.regexOptions);
        const line = document.lineAt(match.line);
        const lineText = line.text;
        const lineIndex = document.offsetAt(line.range.start);
        
        const cmsMatches = [...lineText.matchAll(re)];

        for (const match of cmsMatches) {
          const matchStartPos = document.positionAt(lineIndex + match.index);
          const matchEndPos = document.positionAt(lineIndex + match.index + match[0].length);
          foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
        }
      }
      if (foundSelections.length) editor.selections = foundSelections;
      if (foundSelections.length) vscode.commands.executeCommand('revealLine', { lineNumber: foundSelections[0].start.line, at: "bottom" });
    }
    else vscode.commands.executeCommand('revealLine', { lineNumber: document.positionAt(matches[0].index).line, at: "bottom" });
	});
}

/**
 * Replace matches within each selection range
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {Object} args
 */
function _replaceInSelections(editor, edit, args) {

  const document = vscode.window.activeTextEditor.document;
  const originalSelections = editor.selections;
  let resolvedFind;
  let resolvedReplace;
  let matches;
  let matchesPerSelection = [];

  editor.edit(function (edit) {

    let index = 0;

    editor.selections.forEach(selection => {

      const selectedRange = new vscode.Range(selection.start, selection.end);
      let selectionStartIndex = document.offsetAt(selection.start);

      resolvedFind = variables.buildReplace(args.findValue, null, "ignoreLineNumbers", args.isRegex, selection, args.clipText, "selections");
      resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

      if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
        matches = buildLineNumberMatches(resolvedFind, selectedRange);
        selectionStartIndex = 0;
      }

      else {
        const re = new RegExp(resolvedFind, args.regexOptions);
        const selectedText = document.getText(selectedRange);
        matches = [...selectedText.matchAll(re)];
      }

      for (const match of matches) {

        resolvedReplace = variables.buildReplace(args.replaceValue, match, "replace", args.isRegex, selection, args.clipText, "selections", selectionStartIndex);
        resolvedReplace = variables.resolveMatchVariable(resolvedReplace, index++);
        resolvedReplace = variables.resolveLineVariable(resolvedReplace, selectionStartIndex + match.index);

        const matchStartPos = editor.document.positionAt(selectionStartIndex + match.index);
        const matchEndPos = editor.document.positionAt(selectionStartIndex + match.index + match[0].length);
        const matchRange = new vscode.Range(matchStartPos, matchEndPos);

        if (resolvedReplace !== null) edit.replace(matchRange, resolvedReplace);
        else editor.selections = editor.selections.filter(otherSelection => otherSelection !== selection);
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

      originalSelections.forEach(selection => {
        
        let cursorMoveSelect = variables.buildReplace(args.cursorMoveSelect, selection.active.line, "cursorMoveSelect", args.isRegex, selection, args.clipText, "selections");

        if (cursorMoveSelect.length) {  // don't if cursorMoveSelect === ""

          let lineEndStart = false;
          if (cursorMoveSelect.search(/^[^$]$/m) !== -1) lineEndStart = true;

          if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
          // don't do below if cursorMoveSelect is only ^ or $
          if (!lineEndStart) {
            if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;
          }

          const selectionIndex = editor.document.offsetAt(new vscode.Position(selection.start.line, selection.start.character));

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
              const matchStartPos = editor.document.positionAt(selectionIndex + match.index);
              const matchEndPos = editor.document.positionAt(selectionIndex + match.index + match[0].length);
              foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
            }
          }
        }
        index++;
			});
      if (foundSelections.length) editor.selections = foundSelections;
      // if (foundSelections.length) vscode.commands.executeCommand('revealLine', { lineNumber: foundSelections[0].start.line, at: "bottom" });
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
  // TODO + test
	if (!isRegex && madeFind) findValue = findValue.replace(/([+?$^.\\*\{\}\[\]\(\)])/g, "\\$1");
  else if (!isRegex) findValue = findValue.replace(/([+?^.\\*\[\]\(\)]|\$(?!{line(Number|Index)})|\{(?!line(Number|Index)})|(?<!\$\{lineNumber)(?<!\$\{lineIndex)\})/g, "\\$1");
  
	if (matchWholeWord) findValue = findValue.replace(/@%@/g, "\\b");
	if (matchWholeWord && !madeFind) findValue = `\\b${ findValue }\\b`;

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
