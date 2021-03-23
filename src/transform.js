const vscode = require('vscode');

/**
 * Find and transform any case identifiers with or without capture groups
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {string[] | any[]} findReplaceArray - this setting
 */
exports.findTransform = function (editor, edit, findReplaceArray) {

	// or use selections here if multiple  // Array<vscode.Selection>
	// let selections = editor.selections;


	let docString = editor.document.getText();
	const re = new RegExp(findReplaceArray[1].find, "g");
	const replaceValue = findReplaceArray[2].replace;
	let buildReplace = "";

	if (re.test(docString)) {  // boolean  // must be a global regexp

		// find all matches in iteratively reduced docString    // also a global regexp
		docString = docString.replace(re, (...groups) => {

			// array of case modifiers + $n's
			// groups.capGroupOnly is for '$n' with no case modifier
			const identifiers = [...replaceValue.matchAll(/(?<case>\\[UuLl])(?<capGroup>\$\d\d?)|(?<capGroupOnly>\$\d\d?)/g)];

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

						let thisGroup = 0;   // TODO: simplify this?
						if (identifiers[i][2]) 	thisGroup = identifiers[i][2].substring(1);			 // "1" or "2", etc.

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
		});
		// get entire document range
		const firstLine = editor.document.lineAt(0);
		const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
		const matchRange = new vscode.Range(firstLine.range.start, lastLine.range.end);

		edit.replace(matchRange, docString);
	};
}


/**
 * If a next case modifier or capture group, add any intervening characters to the replace string,
 * otherwise, add to end of input string
 *
 * @param {Array} identifiers
 * @param {Number} i
 * @param {String} replaceValue
 * @returns {String}
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
 * @param {Array} identifiers
 * @param {Number} i
 * @param {String} replaceValue
 * @returns {String}
 */
function _stringBetweenIdentifiers(identifiers, i, replaceValue) {
	return replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
}