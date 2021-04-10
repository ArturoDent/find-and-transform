const vscode = require('vscode');

/**
 * Find and transform any case identifiers with or without capture groups
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {String[] | any[]} findReplaceArray - this setting
 */
exports.findTransform = function (editor, edit, findReplaceArray) {

	let restrictFind = "document";  // effectively making "document" the default
	let restrictItem = Object.entries(findReplaceArray).filter(item => (item[1].restrictFind || item[0] === 'restrictFind'));
	if (restrictItem.length) restrictFind = restrictItem[0][1].restrictFind ?? restrictItem[0][1];  // limit to 'document/selections' only

	let findValue = "";
	let findItem = Object.entries(findReplaceArray).filter(item => {
		return (item[1].find || item[0] === 'find');
	});  // returns an empty [] if nothing
	if (findItem.length) findValue = findItem[0][1].find ?? findItem[0][1];
	// no 'find' key generate a findValue useing the selected words/wordsAtCursors as the 'find' value
	// TODO  what if find === "" empty string?
	else findValue = _makeFind(editor.selections);

	let replaceValue = null;
	// lots of extra work because string.replace is a function and so true
	// not the case for 'find' or 'restrictFind'
	// possible to change to 'replace' in registerCommand?
	let replaceItem = Object.entries(findReplaceArray).filter(item => {
		if (typeof item[1] === 'string') return item[0] === 'replace';  // keybinding from a setting
		else if (item[1].replace === '') return item;
		else return item[1].replace;   // from keybinding not from a setting
	});
	if (replaceItem.length) {
		if (typeof replaceItem[0][1] === 'string') replaceValue = replaceItem[0][1];
		else replaceValue = replaceItem[0][1].replace;
	}
	else if (!findItem.length) replaceValue = "$1";  // if no replace key, set to $1

	// no find and no replace
	if (!findItem.length && !replaceItem.length)
		_findAndSelect(editor, findValue, restrictFind); // find and select all even if restrictFind === selections

	// add all "empty selections" to editor.selections_replaceSelectionsLoop
	else if (restrictFind === "selections" && replaceValue !== null) {
		_addEmptySelectionMatches(editor);
		_replaceSelectionsLoop(editor, edit, findValue, replaceValue);
	}
	else if (replaceValue !== null) _replaceWholeDocument(editor, edit, findValue, replaceValue);
	else _findAndSelect(editor, findValue, restrictFind);   // find but no replace
}


/**
 * When no 'find' key in command: make a find value for use as a regexp
 * from all selected words or words at cursor positions wrapped by word boundaries \b
 *
 * @param {Array<vscode.Selection>} selections
 * @returns {String} - selected text '(\\ba\\b|\\bb c\\b|\\bd\\b)'
 */
function _makeFind(selections) {

	const document = vscode.window.activeTextEditor.document;
	let selectedText = "";
	let find = "";

	selections.forEach((selection, index) => {

		if (selection.isEmpty) {
			let wordRange = document.getWordRangeAtPosition(selection.start);
			selectedText = document.getText(wordRange);
		}
		else {
			let selectedRange = new vscode.Range(selection.start, selection.end);
			selectedText = document.getText(selectedRange);
		}

		// wrap with word boundaries \\b must be double-escaped
		if (index < selections.length-1) find += `\\b${ selectedText }\\b|`;  // add an | or pipe to end
		else find += `\\b${ selectedText }\\b`;

	});

	find = `(${ find })`;  // e.g. "(\\baword\\b|\\bsome words\\b|\\bmore\\b)"
	return find;
}

/**
 * Add any empty/words at cursor position to the selections
 * @param {vscode.window.activeTextEditor} editor
 */
function _addEmptySelectionMatches(editor) {

	editor.selections.forEach(selection => {

		let emptySelections = [];

		// if selection start = end then just a cursor no actual selected text
		if (selection.isEmpty) {

			let wordRange = editor.document.getWordRangeAtPosition(selection.start);
			let word;
			if (wordRange) word = editor.document.getText(wordRange);
			else return;

			// get all the matches in the document
			let fullText = editor.document.getText();
			let matches = [...fullText.matchAll(new RegExp(word, "g"))];

			matches.forEach((match, index) => {
				let startPos = editor.document.positionAt(match.index);
				let endPos = editor.document.positionAt(match.index + match[0].length);

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

	let foundSelections = [];

	if (restrictFind === "document") {

		// get all the matches in the document
		let fullText = editor.document.getText();
		let matches = [...fullText.matchAll(new RegExp(findValue, "gm"))];

		matches.forEach((match, index) => {
			let startPos = editor.document.positionAt(match.index);
			let endPos = editor.document.positionAt(match.index + match[0].length);
			foundSelections[index] = new vscode.Selection(startPos, endPos);
		});
		editor.selections = foundSelections; // this will remove all the original selections
	}

	else {

		let selectedRange;

		editor.selections.forEach(selection => {

			if (selection.isEmpty) {
				selectedRange = editor.document.getWordRangeAtPosition(selection.start);
			}
			else selectedRange = new vscode.Range(selection.start, selection.end);

			let selectedText = editor.document.getText(selectedRange);
			let matches = [...selectedText.matchAll(new RegExp(findValue, "gm"))];

			matches.forEach((match) => {

				let selectionStart = 0;

				if (selection.isEmpty && (match.index + editor.document.offsetAt(selection.start) === editor.document.offsetAt(selection.start))) {
					selectionStart = editor.document.offsetAt(selectedRange.start);
				}
				// else if (selection.isEmpty) selectionStart = 0;  // doesn't seem necessary
				else selectionStart = editor.document.offsetAt(selection.start);

				let startPos = editor.document.positionAt(match.index + selectionStart);
				let endPos = editor.document.positionAt(match.index + match[0].length + selectionStart);
				foundSelections.push(new vscode.Selection(startPos, endPos));
			});
		});
		editor.selections = foundSelections; // this will remove all the original selections
	}
}


/**
 * Replace all find matches in the entire document
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {String} findValue
 * @param {String} replaceValue
 */
function _replaceWholeDocument(editor, edit, findValue, replaceValue) {

	const re = new RegExp(findValue, "gm");
	const firstLine = editor.document.lineAt(0);
	const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
	const matchRange = new vscode.Range(firstLine.range.start, lastLine.range.end);

	let docString = editor.document.getText();
	let doReplace = false;

	if (re.test(docString)) {  // boolean, must be a global regexp

		doReplace = true;
		// find all matches in iteratively reduced docString
		docString = docString.replace(re, (...groups) => {
			return _buildReplaceValue(replaceValue, groups);
		});
	};
	if (doReplace) edit.replace(matchRange, docString);
}

/**
 * Replace matches within each selection range
 *
 * @param {vscode.window.activeTextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {String} findValue
 * @param {String} replaceValue
 */
function _replaceSelectionsLoop(editor, edit, findValue, replaceValue) {

	const re = new RegExp(findValue, "gm");

	editor.selections.forEach(selection => {

		// and use this selectedRange for each final edit
		let selectedRange = new vscode.Range(selection.start, selection.end);
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
		// if selection was not a match/no replacement = remove from editor.selections
	});
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

	if (replaceValue !== null)
		identifiers = [...replaceValue.matchAll(/(?<case>\\[UuLl])(?<capGroup>\$\d\d?)|(?<capGroupOnly>\$\d\d?)/g)];

	if (!identifiers.length) return replaceValue;

	else {
		buildReplace = replaceValue.substring(0, identifiers[0].index);

		// loop through case modifiers/capture groups in the replace setting
		for (let i = 0; i < identifiers.length; i++) {

			if (identifiers[i].groups.capGroupOnly) {   // so no case modifier, only an unmodified capture group: "$n"
				let thisCapGroup = identifiers[i].groups.capGroupOnly.substring(1);
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
							//
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

exports.getKeys = function () {
	return ["title", "find", "replace", "restrictFind"];
}

exports.getDefaults = function () {
	return {
						"title": "",
						"find": "",
						"replace": "",
						"restrictFind": "document"
				};
}