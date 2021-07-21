const vscode = require('vscode');
const variables = require('./variables');



/**
 * Find and transform any case identifiers with or without capture groups
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {String[] | any[]} findReplaceArray - this setting
 */
exports.findTransform = async function (editor, edit, findReplaceArray) {

	let madeFind = false;

	let restrictFind = "document";  // effectively making "document" the default
	const restrictItem = Object.entries(findReplaceArray).filter(item => (item[1].restrictFind || item[0] === 'restrictFind'));
	if (restrictItem.length) restrictFind = restrictItem[0][1].restrictFind ?? restrictItem[0][1];

	let isRegex = false;  // effectively making "false" the default
	const isRegexItem = Object.entries(findReplaceArray).filter(item =>
		(typeof item[1].isRegex === 'boolean' || item[0] === 'isRegex'));
	if (isRegexItem.length) isRegex = isRegexItem[0][1].isRegex ?? isRegexItem[0][1];

	let matchWholeWord = false;  // effectively making "false" the default
	const matchWholeWordItem = Object.entries(findReplaceArray).filter(item =>
		(typeof item[1].matchWholeWord === 'boolean' || item[0] === 'matchWholeWord'));
	if (matchWholeWordItem.length) matchWholeWord = matchWholeWordItem[0][1].matchWholeWord ?? matchWholeWordItem[0][1];

	let matchCase = false;  // effectively making "false" the default
	const matchCaseItem = Object.entries(findReplaceArray).filter(item =>
		(typeof item[1].matchCase === 'boolean' || item[0] === 'matchCase'));
	if (matchCaseItem.length) matchCase = matchCaseItem[0][1].matchCase ?? matchCaseItem[0][1];

	let findValue = "";
	  // returns an empty [] if no 'find'
	const findItem = Object.entries(findReplaceArray).filter(item => (item[1].find || item[0] === 'find'));
	if (findItem.length) {
		findValue = findItem[0][1].find ?? findItem[0][1];
		// true in parseVariables(..., true) will escape resolved variables for use in a regex
		findValue = await variables.parseClipboardVariable(findValue, "find", isRegex);
		// findValue = await variables.parseVariables(findValue, "find", isRegex);
	}
	// no 'find' key generate a findValue using the selected words/wordsAtCursors as the 'find' value
	// TODO  what if find === "" empty string?
	else {
		findValue = _makeFind(editor.selections, restrictFind, matchWholeWord, isRegex);
		madeFind = true;
	}

	let cursorMoveSelect = "";  // effectively making "" the default
	const cursorMoveSelectItem = Object.entries(findReplaceArray).filter(item => (item[1].cursorMoveSelect || item[0] === 'cursorMoveSelect'));
	if (cursorMoveSelectItem.length)	cursorMoveSelect = cursorMoveSelectItem[0][1].cursorMoveSelect ?? cursorMoveSelectItem[0][1];  // from keybinding or setting

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
			// if (restrictFind === "selections" && replaceValue !== null) don't parse here, parse later 
			replaceValue = await variables.parseClipboardVariable(replaceValue, "replace", isRegex);
		}
		else {
			replaceValue = replaceItem[0][1].replace;
			// if (restrictFind === "selections" && replaceValue !== null) don't parse here, parse later
			replaceValue = await variables.parseClipboardVariable(replaceValue, "replace", isRegex);
		}
	}
	else if (!findItem.length) {  // no find and no replace, TODO check here late parse effect?
		replaceValue = "$1";
		isRegex = true;
		findValue = `(${ findValue })`;
	}

	// make adjustments to find value for matchWholeWord, matchCase and is isRegex
	let regexOptions = "gmi";
	if (matchCase) regexOptions = "gm";

	// findValue = _adjustFindValue(findValue, isRegex, madeFind);

	// if (matchWholeWord) findValue = findValue.replace(/\\b/g, "@%@");

	// // removed escaping the or | if madeFind
	// if (!isRegex && madeFind) findValue = findValue.replace(/([?$^.\\*\{\}\[\]\(\)])/g, "\\$1");
	// // else if (!isRegex) findValue = findValue.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");  // TODO move to functions?
	// if (matchWholeWord) findValue = findValue.replace(/@%@/g, "\\b");
	// if (matchWholeWord && !madeFind) findValue = `\\b${ findValue }\\b`;

	// no find and no replace
	if (!findItem.length && !replaceItem.length &&
		restrictFind !== "nextMoveCursor" && restrictFind !== "nextSelect" && restrictFind !== "nextDontMoveCursor")
			_findAndSelect(editor, findValue, restrictFind, regexOptions); // find and select all even if restrictFind === selections

	// add all "empty selections" to editor.selections_replaceSelectionsLoop
	else if (restrictFind === "selections" && replaceValue !== null) {
		_addEmptySelectionMatches(editor, regexOptions);
		_replaceSelectionsLoop(editor, edit, findValue, replaceValue, cursorMoveSelect, isRegex, regexOptions, matchWholeWord);
	}
	else if ((restrictFind === "line" || restrictFind === "once") && replaceValue !== null) {
		_replaceInLine(editor, edit, findValue, replaceValue, restrictFind, cursorMoveSelect, isRegex, regexOptions, matchWholeWord, madeFind);
	}
	// find and replace, restrictFind = nextSelect/nextMoveCursor/nextDontMoveCursor
	else if (restrictFind === "nextMoveCursor" || restrictFind === "nextSelect" || restrictFind === "nextDontMoveCursor") {
		_replaceNextInWholeDocument(editor, edit, findValue, replaceValue, restrictFind, isRegex, regexOptions);
	}
	// find and replace, restrictFind = document/default
	else if (replaceValue !== null)
		_replaceWholeDocument(editor, edit, findValue, replaceValue, cursorMoveSelect, isRegex, regexOptions, matchWholeWord);
	
	else _findAndSelect(editor, findValue, restrictFind, regexOptions);   // find but no replace
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
			// const wordRange = document.getWordRangeAtPosition(selection.start);
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

	// find = `(${ find })`;  // e.g. "(\\bword\\b|\\bsome words\\b|\\bmore\\b)"
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
			// TODO use regexOptions here?
			// const matches = [...fullText.matchAll(new RegExp(word, "g"))];
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
 * @param {String} findValue
 * @param {String} restrictFind
 * @param {String} regexOptions
 */
function _findAndSelect(editor, findValue, restrictFind, regexOptions) {

	const foundSelections = [];

	if (restrictFind === "document") {

		// get all the matches in the document
		const fullText = editor.document.getText();
		const matches = [...fullText.matchAll(new RegExp(findValue, regexOptions))];

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

			if (selection.isEmpty) {
				selectedRange = editor.document.getWordRangeAtPosition(selection.start);
			}
			else selectedRange = new vscode.Range(selection.start, selection.end);

			const selectedText = editor.document.getText(selectedRange);
			const matches = [...selectedText.matchAll(new RegExp(findValue, regexOptions))];

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
 * @param {String} findValue
 * @param {String} replaceValue
 * @param {String} restrictFind : 'line' or 'once'
 * @param {String} cursorMoveSelect
 * @param {Boolean} isRegex
 * @param {String} regexOptions
 * @param {Boolean} matchWholeWord
 */
async function _replaceInLine(editor, edit, findValue, replaceValue, restrictFind, cursorMoveSelect, isRegex, regexOptions, matchWholeWord, madeFind) {

	// const re = new RegExp(findValue, regexOptions);
	let currentLine = "";
	let foundSelections = [];

	if (restrictFind === "line") {

		// get all the matches on the line
		let lineIndex;

		editor.edit(function (edit) {

			editor.selections.forEach(selection => {

				let resolvedReplace = variables.parseVariables(replaceValue, "replace", false, selection);

				let resolvedFind = variables.parseVariables(findValue, "find", isRegex, selection);
				resolvedFind = _adjustFindValue(resolvedFind, isRegex, matchWholeWord, madeFind);

				const re = new RegExp(resolvedFind, regexOptions);
				currentLine = editor.document.lineAt(selection.active.line).text;
				const matches = [...currentLine.matchAll(re)];
		
				for (const match of matches) {
					let replacement;

					if (!isRegex) replacement = resolvedReplace;
					else replacement = variables.buildReplace(resolvedReplace, matches[0]);
					
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

				if (cursorMoveSelect) {

					lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
					currentLine = editor.document.lineAt(selection.active.line).text;  // ??

					if (!isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
					if (matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

					const matches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, regexOptions))];

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

	else if (restrictFind === "once") {  // from cursor to end of line

		let fullLine = "";
		let lineIndex;
		let subStringIndex;
		let matchObj;

		// replaceValue = await variables.parseClipboardVariable(replaceValue, "replace", isRegex);

		editor.edit(function (edit) {

			editor.selections.forEach(selection => {

				let resolvedReplace = variables.parseVariables(replaceValue, "replace", false, selection);

				let resolvedFind = variables.parseVariables(findValue, "find", isRegex, selection);
				resolvedFind = _adjustFindValue(resolvedFind, isRegex, matchWholeWord, madeFind);
				const re = new RegExp(resolvedFind, regexOptions);

				// get first match on line from cursor forward
				fullLine = editor.document.lineAt(selection.active.line).text;
				currentLine = fullLine.substring(selection.active.character);

				// use matchAll() to get index even though only using the first one
				const matches = [...currentLine.matchAll(re)];
				let replacement;
				if (!isRegex) replacement = resolvedReplace;
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
			
			if (cursorMoveSelect) {

				cursorMoveSelect = variables.buildReplace(cursorMoveSelect, matchObj);

				editor.selections.forEach(selection => {

					lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
					// subStringIndex = selection.active.character;
					subStringIndex = matchObj.index + selection.active.character;
					fullLine = editor.document.lineAt(selection.active.line).text;
					// currentLine = fullLine.substring(selection.active.character);
					currentLine = fullLine.substring(subStringIndex);

					if (!isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
					if (matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

					const matches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, regexOptions))];

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
 * @param {String} findValue
 * @param {String} replaceValue
 * @param {String} restrictFind
 * @param {Boolean} isRegex
 * @param {String} regexOptions
 */
async function _replaceNextInWholeDocument(editor, edit, findValue, replaceValue, restrictFind, isRegex, regexOptions) {

	// make work for multiple selections ??

	let replacement;
	let matchEndPos;
	let documentBeforeCursor;
	const foundSelections = [];

	let cursorIndex = editor.document.offsetAt(editor.selection.end);
	const re = new RegExp(findValue, regexOptions);
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

		if (replaceValue) {
			// replacement = variables.buildReplace(replaceValue, matches[0]);
			replaceValue = variables.parseVariables(replaceValue, "replace", false, vscode.window.activeTextEditor.selections[0]);

			if (!isRegex) replacement = replaceValue;
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
		if (restrictFind === "nextSelect") {
			const matchStartPos = editor.document.positionAt(cursorIndex + matches[0].index);
			if (replaceValue) {
				matchEndPos = editor.document.positionAt(cursorIndex + matches[0].index + replacement.length);
			}
			else matchEndPos = editor.document.positionAt(cursorIndex + matches[0].index + matches[0][0].length);

			foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
			editor.selections = foundSelections;
		}
		else if (restrictFind === "nextMoveCursor") {
			if (replaceValue) {
				matchEndPos = editor.document.positionAt(cursorIndex + matches[0].index + replacement.length);
			}
			else matchEndPos = editor.document.positionAt(cursorIndex + matches[0].index + matches[0][0].length);

			foundSelections.push(new vscode.Selection(matchEndPos, matchEndPos));
			editor.selections = foundSelections;
		}
		else if (restrictFind === "nextDontMoveCursor") {}   // do nothing, edit already made
	});
}

/**
 * Replace all find matches in the entire document
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {String} findValue
 * @param {String} replaceValue
 * @param {String} cursorMoveSelect
 * @param {Boolean} isRegex
 * @param {String} regexOptions
 * @param {Boolean} matchWholeWord
 */
async function _replaceWholeDocument(editor, edit, findValue, replaceValue, cursorMoveSelect, isRegex, regexOptions, matchWholeWord) {

	const re = new RegExp(findValue, regexOptions);
	const docString = editor.document.getText();
	const matches = [...docString.matchAll(re)];
	let replacement;

	replaceValue = variables.parseVariables(replaceValue, "replace", false, vscode.window.activeTextEditor.selections[0]);

	editor.edit(function (edit) {

		for (const match of matches) {

			// if not a regex, replace with the string even if it has conditionals, \\U, $n, etc.
			// parseVariables has already been done
			if (!isRegex)	replacement = replaceValue;
			else replacement = variables.buildReplace(replaceValue, match);

			const matchStartPos = editor.document.positionAt(match.index);
			const matchEndPos = editor.document.positionAt(match.index + match[0].length);
			const matchRange = new vscode.Range(matchStartPos, matchEndPos)
			edit.replace(matchRange, replacement);
		}
	}).then(success => {
		if (!success) {
			return;
		}
		if (cursorMoveSelect) {
			if (cursorMoveSelect === "^") return;

			const foundSelections = [];
			if (!isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
			if (matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;

			const re = new RegExp(cursorMoveSelect, regexOptions);
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
 * @param {String} findValue
 * @param {String} replaceValue
 * @param {String} cursorMoveSelect
 * @param {Boolean} isRegex
 * @param {String} regexOptions
 * @param {Boolean} matchWholeWord
 */
function _replaceSelectionsLoop(editor, edit, findValue, replaceValue, cursorMoveSelect, isRegex, regexOptions, matchWholeWord) {

	const re = new RegExp(findValue, regexOptions);
	const originalSelections = editor.selections;
	const foundSelections = [];

	editor.edit(function (edit) {

		editor.selections.forEach(selection => {

			let resolvedValue = variables.parseVariables(replaceValue, "replace", false, selection);

			// and use this selectedRange for each final edit
			const selectedRange = new vscode.Range(selection.start, selection.end);
			let docString = editor.document.getText(selectedRange);
			let doReplace = false;

			if (re.test(docString)) {  // boolean, must be a global regexp

				doReplace = true;
				// find all matches in iteratively reduced docString
				docString = docString.replace(re, (...groups) => {
					// return utilities.buildReplace(replaceValue, groups);
					if (!isRegex) return resolvedValue;
					else return variables.buildReplace(resolvedValue, groups);
					// TODO replace here
				});
			};

			if (replaceValue !== null && doReplace) {
				const matchRange = selectedRange;
				edit.replace(matchRange, docString);
			}
			else editor.selections = editor.selections.filter(otherSelection => otherSelection !== selection);
		});

	}).then(success => {
		if (!success) {
			return;
		}
		if (cursorMoveSelect) {

			let lineEndStart = false;
			if (cursorMoveSelect.search(/^[^$]$/m) !== -1) lineEndStart = true;

			if (!isRegex) cursorMoveSelect = cursorMoveSelect.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");
			// don't do below if cursorMoveSelect is only ^ or $
			if (!lineEndStart) {
				if (matchWholeWord) cursorMoveSelect = `\\b${ cursorMoveSelect }\\b`;
			}

			// editor.selections.forEach(selection => {
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

					const matches = [...docString.matchAll(new RegExp(cursorMoveSelect, regexOptions))];

					for (const match of matches) {
						const matchStartPos = editor.document.positionAt(selectionIndex + match.index);
						const matchEndPos = editor.document.positionAt(selectionIndex + match.index + match[0].length);
						foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
						// editor.selections = foundSelections;
						// if (lineEndStart) break;
					}
				}
			});
			editor.selections = foundSelections;
		}
	})
}


function _adjustFindValue (findValue, isRegex, matchWholeWord, madeFind) {

	if (matchWholeWord) findValue = findValue.replace(/\\b/g, "@%@");

	// removed escaping the or | if madeFind
	if (!isRegex && madeFind) findValue = findValue.replace(/([?$^.\\*\{\}\[\]\(\)])/g, "\\$1");
	else if (!isRegex) findValue = findValue.replace(/([?$^.\\*\|\{\}\[\]\(\)])/g, "\\$1");  // TODO move to functions?
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
	// return ["title", "find", "replace", "isRegex", "matchCase", "matchWholeWord", "restrictFind", "cursorMoveSelect"];
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