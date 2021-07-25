const vscode = require('vscode');
const variables = require('./variables');


/**
 * Find and transform any case identifiers with or without capture groups
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param { String[] | any[] } findReplaceArray - this setting
 */
exports.findTransform = async function (editor, edit, findReplaceArray) {

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
		findValue = await variables.resolveClipboardVariable(findValue, "find", loopKeys.isRegex);
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
			// replaceValue = await variables.resolveClipboardVariable(replaceValue, "replace", loopKeys.isRegex);
		}
		else {
			replaceValue = replaceItem[0][1].replace;
			// replaceValue = await variables.resolveClipboardVariable(replaceValue, "replace", loopKeys.isRegex);
		}
	}
	else if (!findItem.length) {  // no find and no replace, TODO check here late parse effect?
		replaceValue = "$1";
		loopKeys.isRegex = true;
		findValue = `(${ findValue })`;
	}

  let clipText = "";
  await vscode.env.clipboard.readText().then(string => {
    clipText = string;
  });


	let regexOptions = "gmi";
  if (loopKeys.matchCase) regexOptions = "gm";
  
  // const args = { findValue, replaceValue, regexOptions, madeFind };
  const args = { findValue, replaceValue, regexOptions, madeFind, clipText };
  Object.assign(args, loopKeys);

	// no find and no replace
	if (!findItem.length && !replaceItem.length &&
		args.restrictFind !== "nextMoveCursor" && args.restrictFind !== "nextSelect" && args.restrictFind !== "nextDontMoveCursor")
    _findAndSelect(editor, args); // find and select all even if restrictFind === selections

	// add all "empty selections" to editor.selections_replaceSelectionsLoop
	else if (args.restrictFind === "selections" && args.replaceValue !== null) {
		_addEmptySelectionMatches(editor, args.regexOptions);
		_replaceSelectionsLoop(editor, edit, args);
  }
    
	else if ((args.restrictFind === "line" || args.restrictFind === "once") && replaceValue !== null) {
		_replaceInLine(editor, edit, args);
  }
    
	// find and replace, restrictFind = nextSelect/nextMoveCursor/nextDontMoveCursor
  else if (args.restrictFind === "nextMoveCursor" || args.restrictFind === "nextSelect" || args.restrictFind === "nextDontMoveCursor") {
    const newArgs = _buildNewArgsArray(args);  // parse find and replace here, rather than in the next functions
		_replaceNextInWholeDocument(editor, edit, newArgs);
  }
    
	// find and replace, restrictFind = document/default
  else if (replaceValue !== null) {
    const newArgs = _buildNewArgsArray(args);  // parse find and replace here, rather than in the next functions
    _replaceWholeDocument(editor, edit, newArgs);
  }
	
  else _findAndSelect(editor, args);   // find but no replace
}


/**
 * Make a new args object using updated findValue and replaceValue
 * @param {Object} args - all the args like findValue, etc.
 * @returns {Object} newArgs
 */
function _buildNewArgsArray(args) {
  
  const replaceValue = variables.resolvePathVariables(args.replaceValue, "replace", false, vscode.window.activeTextEditor.selections[0], args.clipText);
  let findValue = variables.resolvePathVariables(args.findValue, "find", args.isRegex, vscode.window.activeTextEditor.selections[0], args.clipText);
  findValue = _adjustFindValue(findValue, args.isRegex, args.matchWholeWord, args.madeFind);
  const newArgs = {};
  Object.assign(newArgs, args);
  newArgs.replaceValue = replaceValue;
  newArgs.findValue = findValue;
  return newArgs;
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
 * while removing all the original selections
 *
 * @param {vscode.TextEditor} editor
 * @param {Object} args
 */
function _findAndSelect(editor, args) {


	const foundSelections = [];

	if (args.restrictFind === "document") {

    const findValue = _adjustFindValue(args.findValue, args.isRegex, args.matchWholeWord, args.madeFind);

		// get all the matches in the document
		const fullText = editor.document.getText();
		const matches = [...fullText.matchAll(new RegExp(findValue, args.regexOptions))];

		matches.forEach((match, index) => {
			const startPos = editor.document.positionAt(match.index);
			const endPos = editor.document.positionAt(match.index + match[0].length);
			foundSelections[index] = new vscode.Selection(startPos, endPos);
		});
		editor.selections = foundSelections; // this will remove all the original selections
	}

	else {  // restrictFind === "selections"  TODO other options now

		let selectedRange;

    editor.selections.forEach(selection => {
      
      let resolvedFind = variables.resolvePathVariables(args.findValue, "find", args.isRegex, selection, args.clipText);
      resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

			if (selection.isEmpty) {
				selectedRange = editor.document.getWordRangeAtPosition(selection.start);
			}
			else selectedRange = new vscode.Range(selection.start, selection.end);

			const selectedText = editor.document.getText(selectedRange);
			// const matches = [...selectedText.matchAll(new RegExp(findValue, regexOptions))];
      const matches = [...selectedText.matchAll(new RegExp(resolvedFind, args.regexOptions))];

			matches.forEach((match) => {

				let selectionStart = 0;

				if (selection.isEmpty && (match.index + editor.document.offsetAt(selection.start) === editor.document.offsetAt(selection.start))) {
					selectionStart = editor.document.offsetAt(selectedRange.start);
				}
				else selectionStart = editor.document.offsetAt(selection.start);

				const startPos = editor.document.positionAt(match.index + selectionStart);
				const endPos = editor.document.positionAt(match.index + match[0].length + selectionStart);
				foundSelections.push(new vscode.Selection(startPos, endPos));
			});
		});
		editor.selections = foundSelections; // this will remove all the original selections
	}
}

/**
 * Replace find matches on the current line
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {Object} args
 */
async function _replaceInLine(editor, edit, args) {

	// const re = new RegExp(findValue, regexOptions);
	let currentLine = "";
  let foundSelections = [];
  // let clipText;

  // if (args.replaceValue.includes("${CLIPBOARD}")) {
  //   await vscode.env.clipboard.readText().then(string => {
  //     clipText = string;
  //   });
  // }

	if (args.restrictFind === "line") {

		// get all the matches on the line
		let lineIndex;

		editor.edit(function (edit) {

			editor.selections.forEach(selection => {

				let resolvedReplace = variables.resolvePathVariables(args.replaceValue, "replace", false, selection, args.clipText);
				let resolvedFind = variables.resolvePathVariables(args.findValue, "find", args.isRegex, selection, args.clipText);
				resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

				const re = new RegExp(resolvedFind, args.regexOptions);
				currentLine = editor.document.lineAt(selection.active.line).text;
				const matches = [...currentLine.matchAll(re)];
		
				for (const match of matches) {
					let replacement;

          if (!args.isRegex) replacement = resolvedReplace;
					else replacement = variables.buildReplace(resolvedReplace, match);
					
					lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
					const matchStartPos = editor.document.positionAt(lineIndex + match.index);
					const matchEndPos = editor.document.positionAt(lineIndex + match.index + match[0].length);
					const matchRange = new vscode.Range(matchStartPos, matchEndPos);
					edit.replace(matchRange, replacement);
				}
			})
		}).then(success => {
			if (!success) {
				return;
			}
			editor.selections.forEach(selection => {

				if (args.cursorMoveSelect) {

          let cursorMoveSelect = args.cursorMoveSelect;

					lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
					currentLine = editor.document.lineAt(selection.active.line).text;  // ??

          if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
					if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

          const matches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

					for (const match of matches) {
						const matchStartPos = editor.document.positionAt(lineIndex + match.index);
						const matchEndPos = editor.document.positionAt(lineIndex + match.index + match[0].length);
						foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
					}
				}
			});
			editor.selections = foundSelections;
		});
	}

	else if (args.restrictFind === "once") {  // from cursor to end of line

		let fullLine = "";
		let lineIndex;
		let subStringIndex;
		let matchObj;

		// replaceValue = await variables.parseClipboardVariable(replaceValue, "replace", isRegex);

		editor.edit(function (edit) {

			editor.selections.forEach(selection => {

				let resolvedReplace = variables.resolvePathVariables(args.replaceValue, "replace", false, selection, args.clipText);
				let resolvedFind = variables.resolvePathVariables(args.findValue, "find", args.isRegex, selection, args.clipText);
        resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);
        
				const re = new RegExp(resolvedFind, args.regexOptions);
				// get first match on line from cursor forward
				fullLine = editor.document.lineAt(selection.active.line).text;
				currentLine = fullLine.substring(selection.active.character);

				// use matchAll() to get index even though only using the first one
				const matches = [...currentLine.matchAll(re)];
				let replacement;
				if (!args.isRegex) replacement = resolvedReplace;
				else if (matches.length) replacement = variables.buildReplace(resolvedReplace, matches[0]);
				
				if (matches.length) {  // just do once
				
					matchObj = matches[0];
					lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
					subStringIndex = selection.active.character;

					const matchStartPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index);
					const matchEndPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
					const matchRange = new vscode.Range(matchStartPos, matchEndPos);

					edit.replace(matchRange, replacement);
				}
			})
		}).then(async success => {
				if (!success) {
					return;
			}
			
			if (args.cursorMoveSelect) {

				let cursorMoveSelect = variables.buildReplace(args.cursorMoveSelect, matchObj);

				editor.selections.forEach(selection => {

					lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
					// subStringIndex = selection.active.character;
					subStringIndex = matchObj.index + selection.active.character;
					fullLine = editor.document.lineAt(selection.active.line).text;
					// currentLine = fullLine.substring(selection.active.character);
					currentLine = fullLine.substring(subStringIndex);

					if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
					if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

					const matches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

					if (matches.length) {
						const matchStartPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index);
						const matchEndPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
						foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
					}
				});
				editor.selections = foundSelections;
			}
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

	// make work for multiple selections ??

	let replacement;
	let matchEndPos;
	let documentBeforeCursor;
	const foundSelections = [];

  let cursorIndex = editor.document.offsetAt(editor.selection.end);
  
	const re = new RegExp(args.findValue, args.regexOptions);
	const docString = editor.document.getText();
	let restOfDocument = docString.substring(cursorIndex);  // text after cursor

  let matches = [...restOfDocument.matchAll(re)];

	if (!matches.length) {                                 // check text before the cursor, so it will wrap
		documentBeforeCursor = docString.substring(0, cursorIndex);
		cursorIndex = 0;
		matches = [...documentBeforeCursor.matchAll(re)];
	}
	if (!matches.length) return;  // no match before or after cursor
	
	editor.edit(function (edit) {

		if (args.replaceValue) {
      let replaceValue = variables.resolvePathVariables(args.replaceValue, "replace", false, vscode.window.activeTextEditor.selections[0], args.clipText);

			if (!args.isRegex) replacement = replaceValue;
			else replacement = variables.buildReplace(replaceValue, matches[0]);

			const matchStartPos = editor.document.positionAt(cursorIndex + matches[0].index);
			const matchEndPos = editor.document.positionAt(cursorIndex + matches[0].index + matches[0][0].length);
			const matchRange = new vscode.Range(matchStartPos, matchEndPos)
			edit.replace(matchRange, replacement);
		}
	}).then(success => {
		if (!success) {
			return;
		}
		if (args.restrictFind === "nextSelect") {
			const matchStartPos = editor.document.positionAt(cursorIndex + matches[0].index);
			if (args.replaceValue) {
				matchEndPos = editor.document.positionAt(cursorIndex + matches[0].index + replacement.length);
			}
			else matchEndPos = editor.document.positionAt(cursorIndex + matches[0].index + matches[0][0].length);

			foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
			editor.selections = foundSelections;
		}
    else if (args.restrictFind === "nextMoveCursor") {
			if (args.replaceValue) {
				matchEndPos = editor.document.positionAt(cursorIndex + matches[0].index + replacement.length);
			}
			else matchEndPos = editor.document.positionAt(cursorIndex + matches[0].index + matches[0][0].length);

			foundSelections.push(new vscode.Selection(matchEndPos, matchEndPos));
			editor.selections = foundSelections;
		}
		else if (args.restrictFind === "nextDontMoveCursor") {}   // do nothing, edit already made
	});
}

/**
 * Replace all find matches in the entire document
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {Object} args
 */
async function _replaceWholeDocument(editor, edit, args) {

	const re = new RegExp(args.findValue, args.regexOptions);
	const docString = editor.document.getText();
	const matches = [...docString.matchAll(re)];
	let replacement;

	// replaceValue = variables.parseVariables(replaceValue, "replace", false, vscode.window.activeTextEditor.selections[0]);

	editor.edit(function (edit) {

		for (const match of matches) {

			// if not a regex, replace with the string even if it has conditionals, \\U, $n, etc.
			// parseVariables has already been done
			if (!args.isRegex)	replacement = args.replaceValue;
			else replacement = variables.buildReplace(args.replaceValue, match);

			const matchStartPos = editor.document.positionAt(match.index);
			const matchEndPos = editor.document.positionAt(match.index + match[0].length);
			const matchRange = new vscode.Range(matchStartPos, matchEndPos)
			edit.replace(matchRange, replacement);
		}
	}).then(success => {
		if (!success) {
			return;
		}
		if (args.cursorMoveSelect) {
      if (args.cursorMoveSelect === "^") return;
      
      let cursorMoveSelect = args.cursorMoveSelect;

			const foundSelections = [];
			if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
			if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

			const re = new RegExp(cursorMoveSelect, args.regexOptions);
			let docString = editor.document.getText();
			const matches = [...docString.matchAll(re)];

			for (const match of matches) {
				const matchStartPos = editor.document.positionAt(match.index);
				const matchEndPos = editor.document.positionAt(match.index + match[0].length);
				foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
			}
			editor.selections = foundSelections;
		}
	});
}

/**
 * Replace matches within each selection range
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {Object} args
 */
function _replaceSelectionsLoop(editor, edit, args) {

	const originalSelections = editor.selections;
	const foundSelections = [];

  editor.edit(function (edit) {

    editor.selections.forEach(selection => {

      let resolvedReplace = variables.resolvePathVariables(args.replaceValue, "replace", false, selection, args.clipText);
      let resolvedFind = variables.resolvePathVariables(args.findValue, "find", args.isRegex, selection, args.clipText);
      resolvedFind = _adjustFindValue(resolvedFind, args.isRegex, args.matchWholeWord, args.madeFind);

      const re = new RegExp(resolvedFind, args.regexOptions);
     
      const selectedRange = new vscode.Range(selection.start, selection.end);
      const selectionStartIndex = editor.document.offsetAt(selection.start);
      const selectedText = editor.document.getText(selectedRange);
      const matches = [...selectedText.matchAll(re)];

      for (const match of matches) {
        let replacement;
        if (!args.isRegex) replacement = resolvedReplace;
        else replacement = variables.buildReplace(resolvedReplace, match);

        const matchStartPos = editor.document.positionAt(selectionStartIndex + match.index);
        const matchEndPos = editor.document.positionAt(selectionStartIndex + match.index + match[0].length);
        const matchRange = new vscode.Range(matchStartPos, matchEndPos);

        if (resolvedReplace !== null) edit.replace(matchRange, replacement);
        else editor.selections = editor.selections.filter(otherSelection => otherSelection !== selection);
      }
    })
	}).then(success => {
		if (!success) {
			return;
		}
		if (args.cursorMoveSelect) {

      let cursorMoveSelect = args.cursorMoveSelect;

			let lineEndStart = false;
			if (cursorMoveSelect.search(/^[^$]$/m) !== -1) lineEndStart = true;

			if (!args.isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
			// don't do below if cursorMoveSelect is only ^ or $
			if (!lineEndStart) {
				if (args.matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;
			}

			originalSelections.forEach(selection => {

				const selectionIndex = editor.document.offsetAt(new vscode.Position(selection.start.line, selection.start.character));

				if (cursorMoveSelect === "^") {
					foundSelections.push(new vscode.Selection(selection.start, selection.start));
				}
				else if (cursorMoveSelect === "$") {
					foundSelections.push(new vscode.Selection(selection.end, selection.end));
				}
				else {
					const selectedRange = new vscode.Range(selection.start, selection.end);
					const docString = editor.document.getText(selectedRange);
					const matches = [...docString.matchAll(new RegExp(cursorMoveSelect, args.regexOptions))];

					for (const match of matches) {
						const matchStartPos = editor.document.positionAt(selectionIndex + match.index);
						const matchEndPos = editor.document.positionAt(selectionIndex + match.index + match[0].length);
						foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
					}
				}
			});
			editor.selections = foundSelections;
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
	if (!isRegex && madeFind) findValue = findValue.replace(/([?$^.\\*\{\}\[\]\(\)])/g, "\\$1");
	else if (!isRegex) findValue = findValue.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
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