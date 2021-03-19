const vscode = require('vscode');

/**
 * Find and transform any case identifiers
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {string[] | any[]} findReplaceArray - this setting
 */
exports.findTransform = function (editor, edit, findReplaceArray) {

	let docString = editor.document.getText();
	const re = new RegExp(findReplaceArray[1].find, "g");
	const replaceValue = findReplaceArray[2].replace;
	let buildReplace = "";

	while (re.test(docString)) {  // boolean

		// find first match in reduced docString
		docString = docString.replace(re, (...groups) => {

			// array of case modifiers
			const identifiers = [...replaceValue.matchAll(/(?<trans>\\[UuLl])(?<capGroup>\$\d\d?)/g)];

			if (!identifiers.length) return replaceValue;

			else {

				buildReplace = replaceValue.substring(0, identifiers[0].index - 1);

				for (let i = 0; i < identifiers.length; i++) {  // how many case modifiers in the replace setting

								// {  "find": "((create)|(table)|(iif)|(exists))"  },
								// {  "replace": "\\U$2+\\u$3+\\u$4+\\u$5"}

					const thisGroup = identifiers[i][2].substring(1); // "1" or "2", etc.

					switch (identifiers[i][1]) {  // "\\U", etc.

						case "\\U":
							if (groups[thisGroup]) {
								buildReplace += groups[thisGroup].toUpperCase();
								if (identifiers[i + 1])  // if there is another cse modifier in the replace field
									buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
								else
									buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length);
							}
							// case \\U but no capture group
							else if (identifiers[i + 1]) buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
							break;

						case "\\u":
							if (groups[thisGroup]) {
								buildReplace += groups[thisGroup].substring(0, 1).toUpperCase() + groups[thisGroup].substring(1);
								if (identifiers[i + 1])
									buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
								else
									buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length);
							}
							else if (identifiers[i + 1]) buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
							break;

						case "\\L":
							if (groups[thisGroup]) {
								buildReplace += groups[thisGroup].toUpperCase();
								if (identifiers[i + 1])
									buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
								else
									buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length);
							}
							else if (identifiers[i + 1]) buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
							break;

						case "\\l":
							if (groups[thisGroup]) {
								buildReplace += groups[thisGroup].substring(0, 1).toLowerCase() + groups[thisGroup].substring(1);
								if (identifiers[i + 1])
									buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
								else
									buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length);
							}
							else if (identifiers[i + 1]) buildReplace += replaceValue.substring(identifiers[i].index + identifiers[i][0].length, identifiers[i + 1].index);
							break;

						default:
							break;
					}
				}
			}
			return buildReplace;
		});
	};
		// get entire document range
		const firstLine = editor.document.lineAt(0);
		const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
		const matchRange = new vscode.Range(firstLine.range.start, lastLine.range.end);

		edit.replace(matchRange, docString);
}


			// docString = docString.substring(re.lastIndex + groups[0].length);
			// re.lastIndex = 0;

			// 			// need/can strip out lookaheads/behinds from newFinder?  Test for lookbehinds, non-fixed width.
			// 			// See https://regex101.com/r/pgDs8B/1
			// 			newFinder = newFinder.replace(/\(\?[=!<]+[^)]*\)/, "");
			// 			const replaceValue = fullMatch.replace(new RegExp(newFinder), newReplacer);
			// 			edit.replace(matchRange, replaceValue);