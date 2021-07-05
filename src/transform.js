const vscode = require('vscode');
const utilities = require('./utilities');


/**
 * Find and transform any case identifiers with or without capture groups
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {String[] | any[]} findReplaceArray - this setting
 */
exports.findTransform = async function (editor, edit, findReplaceArray) {

	let restrictFind = "document";  // effectively making "document" the default
	const restrictItem = Object.entries(findReplaceArray).filter(item => (item[1].restrictFind || item[0] === 'restrictFind'));
	if (restrictItem.length) restrictFind = restrictItem[0][1].restrictFind ?? restrictItem[0][1];

	let findValue = "";
	  // returns an empty [] if no 'find'
	const findItem = Object.entries(findReplaceArray).filter(item => (item[1].find || item[0] === 'find'));
	if (findItem.length) {
		findValue = findItem[0][1].find ?? findItem[0][1];
		// true in parseVariables(..., true) will escape resolved variables for use in a regex
		findValue = await utilities.parseVariables(findValue, "find");
	}
	// no 'find' key generate a findValue using the selected words/wordsAtCursors as the 'find' value
	// TODO  what if find === "" empty string?
	else findValue = _makeFind(editor.selections, restrictFind);

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
			replaceValue = await utilities.parseVariables(replaceValue, "replace");  // TODO necessary, setting?
		}
		else {
			replaceValue = replaceItem[0][1].replace;
			// if (restrictFind === "selections" && replaceValue !== null) don't parse here, parse later 
			replaceValue = await utilities.parseVariables(replaceValue, "replace");
		}
	}
	else if (!findItem.length) replaceValue = "$1";  // if no replace key, set to $1

	// no find and no replace
	if (!findItem.length && !replaceItem.length && restrictFind !== "nextMoveCursor" && restrictFind !== "nextSelect" && restrictFind !== "nextDontMoveCursor")
		_findAndSelect(editor, findValue, restrictFind); // find and select all even if restrictFind === selections

	// add all "empty selections" to editor.selections_replaceSelectionsLoop
	else if (restrictFind === "selections" && replaceValue !== null) {
		_addEmptySelectionMatches(editor);
		_replaceSelectionsLoop(editor, edit, findValue, replaceValue, cursorMoveSelect);
	}
	else if ((restrictFind === "line" || restrictFind === "once") && replaceValue !== null) {
		_replaceInLine(editor, edit, findValue, replaceValue, restrictFind, cursorMoveSelect);
	}
	// is replaceValue appropriate here?
	else if (restrictFind === "nextMoveCursor" || restrictFind === "nextSelect" || restrictFind === "nextDontMoveCursor") {
		_replaceNextInWholeDocument(editor, edit, findValue, replaceValue, restrictFind);
	}
	else if (replaceValue !== null) _replaceWholeDocument(editor, edit, findValue, replaceValue, cursorMoveSelect);
	
	else _findAndSelect(editor, findValue, restrictFind);   // find but no replace
}


/**
 * When no 'find' key in command: make a find value for use as a regexp
 * from all selected words or words at cursor positions wrapped by word boundaries \b
 *
 * @param {Array<vscode.Selection>} selections
 * @param {String} restrictFind
 * @returns {String} - selected text '(\\ba\\b|\\bb c\\b|\\bd\\b)'
 */
function _makeFind(selections, restrictFind) {

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

		// wrap with word boundaries \b must be escaped to \\b
		if (index < selections.length-1) find += `\\b${ selectedText }\\b|`;  // add an | or pipe to end
		else find += `\\b${ selectedText }\\b`;

	});

	find = `(${ find })`;  // e.g. "(\\bword\\b|\\bsome words\\b|\\bmore\\b)"
	return find;
}

/**
 * Add any empty/words at cursor position to the selections
 * @param {vscode.window.activeTextEditor} editor
 */
function _addEmptySelectionMatches(editor) {

	editor.selections.forEach(selection => {

		const emptySelections = [];

		// if selection start = end then just a cursor no actual selected text
		if (selection.isEmpty) {

			const wordRange = editor.document.getWordRangeAtPosition(selection.start);
			let word;
			if (wordRange) word = editor.document.getText(wordRange);
			else return;

			// get all the matches in the document
			const fullText = editor.document.getText();
			const matches = [...fullText.matchAll(new RegExp(word, "g"))];

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
 */
function _findAndSelect(editor, findValue, restrictFind) {

	const foundSelections = [];

	if (restrictFind === "document") {

		// get all the matches in the document
		const fullText = editor.document.getText();
		const matches = [...fullText.matchAll(new RegExp(findValue, "gm"))];

		matches.forEach((match, index) => {
			const startPos = editor.document.positionAt(match.index);
			const endPos = editor.document.positionAt(match.index + match[0].length);
			foundSelections[index] = new vscode.Selection(startPos, endPos);
		});
		editor.selections = foundSelections; // this will remove all the original selections
	}

	else {  // restrictFind === "selections"

		let selectedRange;

		editor.selections.forEach(selection => {

			if (selection.isEmpty) {
				selectedRange = editor.document.getWordRangeAtPosition(selection.start);
			}
			else selectedRange = new vscode.Range(selection.start, selection.end);

			const selectedText = editor.document.getText(selectedRange);
			const matches = [...selectedText.matchAll(new RegExp(findValue, "gm"))];

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
 */
async function _replaceInLine(editor, edit, findValue, replaceValue, restrictFind, cursorMoveSelect) {

	const re = new RegExp(findValue, "gm");
	let currentLine = "";
	let foundSelections = [];

	if (restrictFind === "line") {

		// get all the matches on the line
		let lineIndex;

		editor.edit(function (edit) {

			editor.selections.forEach(selection => {

				currentLine = editor.document.lineAt(selection.active.line).text;
				const matches = [...currentLine.matchAll(re)];
		
				for (const match of matches) {
					const replacement = _buildReplaceValue(replaceValue, match);
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

					const matches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, "gm"))];

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

		editor.edit(function (edit) {

			editor.selections.forEach(selection => {

				// get first match on line from cursor forward
				fullLine = editor.document.lineAt(selection.active.line).text;
				currentLine = fullLine.substring(selection.active.character);

				// use matchAll() to get index even though only using the first one
				const matches = [...currentLine.matchAll(re)];
				const replacement = _buildReplaceValue(replaceValue, matches[0]);
				lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
				subStringIndex = selection.active.character;

				const matchStartPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index);
				const matchEndPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
				const matchRange = new vscode.Range(matchStartPos, matchEndPos);

				edit.replace(matchRange, replacement);
			})
		}).then(success => {
				if (!success) {
					return;
				}
				editor.selections.forEach(selection => {

					if (cursorMoveSelect) {

						lineIndex = editor.document.offsetAt(new vscode.Position(selection.active.line, 0));
						subStringIndex = selection.active.character;
						fullLine = editor.document.lineAt(selection.active.line).text;
						currentLine = fullLine.substring(selection.active.character);

						const matches = [...currentLine.matchAll(new RegExp(cursorMoveSelect, "gm"))];

						if (matches.length) {
							const matchStartPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index);
							const matchEndPos = editor.document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
							foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
						}
					}
				});
				editor.selections = foundSelections;
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
 */
async function _replaceNextInWholeDocument(editor, edit, findValue, replaceValue, restrictFind) {

	// make work for multiple selections ??

	let replacement;
	let matchEndPos;
	let documentBeforeCursor;
	const foundSelections = [];

	let cursorIndex = editor.document.offsetAt(editor.selection.end);
	// let cursorIndex = editor.document.offsetAt(editor.selection.start);

	// if wanted 'next...' commands to apply to current word
	// if (editor.selection.isEmpty) {
	// 	let wordRange = editor.document.getWordRangeAtPosition(editor.selection.start);
	// 	cursorIndex = editor.document.offsetAt(wordRange.start);
	// }

	const re = new RegExp(findValue, "gm");
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
			replacement = _buildReplaceValue(replaceValue, matches[0]);

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
 */
async function _replaceWholeDocument(editor, edit, findValue, replaceValue, cursorMoveSelect) {

	const re = new RegExp(findValue, "gm");
	const docString = editor.document.getText();
	const matches = [...docString.matchAll(re)];

	editor.edit(function (edit) {

		for (const match of matches) {

			const replacement = _buildReplaceValue(replaceValue, match);
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
			const foundSelections = [];

			const re = new RegExp(cursorMoveSelect, "gm");
			const docString = editor.document.getText();
			const matches = [...docString.matchAll(re)];

			for (const match of matches) {

				const matchStartPos = editor.document.positionAt(match.index);
				const matchEndPos = editor.document.positionAt(match.index + match[0].length);
				// const matchRange = new vscode.Range(matchStartPos, matchEndPos);
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
 */
function _replaceSelectionsLoop(editor, edit, findValue, replaceValue, cursorMoveSelect) {

	const re = new RegExp(findValue, "gm");

	// editor.selections.forEach(selection => {

	// 	// and use this selectedRange for each final edit
	// 	let selectedRange = new vscode.Range(selection.start, selection.end);
	// 	let docString = editor.document.getText(selectedRange);
	// 	let doReplace = false;

	// 	if (re.test(docString)) {  // boolean, must be a global regexp

	// 		doReplace = true;
	// 		// find all matches in iteratively reduced docString
	// 		docString = docString.replace(re, (...groups) => {
	// 			return _buildReplaceValue(replaceValue, groups);
	// 		});
	// 	};

	// 	if (replaceValue !== null && doReplace) {
	// 		const matchRange = selectedRange;
	// 		edit.replace(matchRange, docString);
	// 	}
	// 	else editor.selections = editor.selections.filter(otherSelection => otherSelection !== selection);
		// if selection was not a match/no replacement = remove from editor.selections
	// });

	const foundSelections = [];

	editor.edit(function (edit) {

		editor.selections.forEach(selection => {

			// and use this selectedRange for each final edit
			const selectedRange = new vscode.Range(selection.start, selection.end);
			let docString = editor.document.getText(selectedRange);
			let doReplace = false;

			if (re.test(docString)) {  // boolean, must be a global regexp

				doReplace = true;
				// find all matches in iteratively reduced docString
				docString = docString.replace(re, (...groups) => {
					return _buildReplaceValue(replaceValue, groups);
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

			editor.selections.forEach(selection => {

				const selectionIndex = editor.document.offsetAt(new vscode.Position(selection.start.line, selection.start.character));
				const selectedRange = new vscode.Range(selection.start, selection.end);
				const docString = editor.document.getText(selectedRange);

				const matches = [...docString.matchAll(new RegExp(cursorMoveSelect, "gm"))];

				for (const match of matches) {
					const matchStartPos = editor.document.positionAt(selectionIndex + match.index);
					const matchEndPos = editor.document.positionAt(selectionIndex + match.index + match[0].length);
					foundSelections.push(new vscode.Selection(matchStartPos, matchEndPos));
					// editor.selections = foundSelections;
				}
			});
			editor.selections = foundSelections;
		}
	})
}


/**
 * Build the replacestring by updating the setting 'replaceValue' to
 * account for case modifiers and capture groups
 *
 * @param {String} replaceValue
 * @param {Array} groups - the result of matching the docString with the regexp findValue
 * @returns {String} - the replace string
 */
function _buildReplaceValue(replaceValue, groups) {

	let buildReplace = "";

	// array of case modifiers + $n's
	// groups.capGroupOnly is for '$n' with no case modifier
	let identifiers;

	if (replaceValue === "") return replaceValue;

	// replaceValue = String(utilities.parseVariables(replaceValue, false));

	if (replaceValue !== null)
		identifiers = [...replaceValue.matchAll(/(?<case>\\[UuLl])(?<capGroup>\$\d\d?)|(?<capGroupOnly>\$\d\d?)/g)];

	if (!identifiers.length) return replaceValue;

	else {
		buildReplace = replaceValue.substring(0, identifiers[0].index);

		// loop through case modifiers/capture groups in the replace setting
		for (let i = 0; i < identifiers.length; i++) {

			if (identifiers[i].groups.capGroupOnly) {   // so no case modifier, only an unmodified capture group: "$n"
				const thisCapGroup = identifiers[i].groups.capGroupOnly.substring(1);
				if (groups[thisCapGroup]) {
					buildReplace += groups[thisCapGroup];
					buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
				}
				else if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
				continue;
			}

			else {

				let thisGroup = "0";
				if (identifiers[i][2]) thisGroup = identifiers[i][2].substring(1);			 // "1" or "2", etc.

				switch (identifiers[i].groups.case) {  // "\\U", "\\l", etc.  // identifiers[i].groups.case

					case "\\U":
						if (groups[thisGroup]) {
							buildReplace += groups[thisGroup].toUpperCase();
							buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						}
						// case "\\U$n" but there is no matching capture group
						else if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						break;

					case "\\u":
						if (groups[thisGroup]) {
							buildReplace += groups[thisGroup].substring(0, 1).toUpperCase() + groups[thisGroup].substring(1);
							buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						}
						else if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						break;

					case "\\L":
						if (groups[thisGroup]) {
							buildReplace += groups[thisGroup].toLowerCase();
							buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						}
						else if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						break;

					case "\\l":
						if (groups[thisGroup]) {
							buildReplace += groups[thisGroup].substring(0, 1).toLowerCase() + groups[thisGroup].substring(1);
							buildReplace += _addToNextIdentifier(identifiers, i, replaceValue);
						}
						else if (identifiers[i + 1]) buildReplace += _stringBetweenIdentifiers(identifiers, i, replaceValue);
						break;

					default:
						break;
				}
			}
		}
	}
	return buildReplace;
}


/**
 * If a next case modifier or capture group, add any intervening characters to the replace string,
 * otherwise, add to end of input string
 *
 * @param {Array} identifiers - case modifiers and capture groups
 * @param {Number} i - index of currrent identifier
 * @param {String} replaceValue
 * @returns {String} - new ReplaceValue
 */
function _addToNextIdentifier(identifiers, i, replaceValue) {
	if (identifiers[i + 1])    // if there is a later case modifier in the replace field
		return _stringBetweenIdentifiers(identifiers, i, replaceValue)
	else                       // get to end of input string
		return replaceValue.substring(identifiers[i].index + identifiers[i][0].length);
}


/**
 * Add any intervening characters, only between identifier groups, to the replace string
 *
 * @param {Array} identifiers - case modifiers and capture groups
 * @param {Number} i - index of currrent identifier
 * @param {String} replaceValue
 * @returns {String} - new ReplaceValue
 */
function _stringBetweenIdentifiers(identifiers, i, replaceValue) {
	return replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
}

/**
 * Get just the findInCurrentFile args keys, like "title", "find", etc.
 * @returns {Array}
 */
exports.getKeys = function () {
	// return ["title", "find", "replace", "restrictFind"];
	return ["title", "find", "replace", "restrictFind", "cursorMoveSelect"];
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
		"restrictFind": "document",
		"cursorMoveSelect": ""
	};
}