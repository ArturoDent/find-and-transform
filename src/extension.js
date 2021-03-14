const vscode = require('vscode');

/** @type { Array<vscode.Disposable> } */
let disposables = [];



/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	_getFindTransformSetting(context, disposables);

	// a sample command using a hard-written find regex and upperCase replacements
	let disposable = vscode.commands.registerTextEditorCommand('find-and-transform.uppcaseKeywords', async (editor, edit) => {

		const docString = editor.document.getText();
		const re = /(?<!\w)(create|select|sum|drop|table|if|exists|day|group|by|order|min|max|and|else|iif|end|over|partition|distinct|desc)(?!\w)/g;
		const matches = [...docString.matchAll(re)];

		if (matches) {
			matches.forEach((match) => {

				// this matchRange can be used if find matches are single words only
				// const matchRange = editor.document.getWordRangeAtPosition(editor.document.positionAt(match.index));

				// use this matchRange if matches can be more than a single word
				const matchRange = new vscode.Range(editor.document.positionAt(match.index), editor.document.positionAt(match.index + match[0].length));

				edit.replace(matchRange, match[1].toUpperCase());
			});
		}
	});
	context.subscriptions.push(disposable);

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration("find-and-transform")) {

			for (let disposable of disposables) {
				disposable.dispose();
			}
			// reload
			_getFindTransformSetting(context, disposables);
		}
	}));
}
// exports.activate = activate;

function deactivate() { }


/**
 * Get the settings and register commands for them
 * @param {vscode.ExtensionContext} context
 * @param {Array<vscode.Disposable>} disposables
 */
function _getFindTransformSetting(context, disposables) {

	let disposable;
	const settings = vscode.workspace.getConfiguration().get("find-and-transform");
	let findArray = Object.entries(settings);
  findArray = findArray.filter(current => (typeof current[1] === 'string') || (Array.isArray(current[1])));

	for (const elem in findArray) {
		if (Array.isArray(findArray[elem])) {
			disposable = vscode.commands.registerTextEditorCommand(`find-and-transform.${findArray[elem][0]}`, async (editor, edit) => {
				_findTransform(editor, edit, findArray[elem][1]);
			});
		}
		else {
			disposable = vscode.commands.registerTextEditorCommand(`find-and-transform.${ findArray[elem][0]}`, async (editor, edit) => {
				_findTransform(editor, edit, findArray[elem][1]);
			});
		}
		context.subscriptions.push(disposable);
		disposables.push(disposable);
	}
}


/**
 * Find and transform any case identifiers
 * @param {vscode.TextEditor} editor
 * @param {vscode.TextEditorEdit} edit
 * @param {string[] | any[]} findReplaceArray
 */
function _findTransform(editor, edit, findReplaceArray) {

	const docString = editor.document.getText();
	const re = new RegExp(findReplaceArray[0].find, "g");
	const matches = [...docString.matchAll(re)];

	if (matches) {
		matches.forEach((match) => {

			let newReplacer = findReplaceArray[1].replace;
			let newFinder = findReplaceArray[0].find;
			let fullMatch = match[0];

			const matchRange = new vscode.Range(editor.document.positionAt(match.index), editor.document.positionAt(match.index+match[0].length));
			const identifiers = [...findReplaceArray[1].replace.matchAll(/(?<trans>\\[UuLl])(?<capGroup>\$\d\d?)/g)]

			if (identifiers.length) {

				identifiers.forEach(item => {

					newReplacer = newReplacer.replace(item[0], item.groups.capGroup);
					let group = item.groups.capGroup.substring(1);

					switch (item.groups.trans) {
						case "\\U":
								newFinder = newFinder.replace(match[group], match[group].toUpperCase());
								fullMatch = fullMatch.replace(match[group], match[group].toUpperCase());
							break;
						case "\\u":
								newFinder = newFinder.replace(match[group], match[group].substring(0, 1).toUpperCase() + match[group].substring(1));
								fullMatch = fullMatch.replace(match[group], match[group].substring(0, 1).toUpperCase() + match[group].substring(1));
							break;
						case "\\L":
								newFinder = newFinder.replace(match[group], match[group].toLowerCase());
								fullMatch = fullMatch.replace(match[group], match[group].toLowerCase());
							break;
						case "\\l":
								newFinder = newFinder.replace(match[group], match[group].substring(0, 1).toLowerCase() + match[group].substring(1));
								fullMatch = fullMatch.replace(match[group], match[group].substring(0, 1).toLowerCase() + match[group].substring(1));
							break;
						default:
							break;
					}
				});
			}
			const replaceValue = fullMatch.replace(new RegExp(newFinder), newReplacer);
			edit.replace(matchRange, replaceValue);
		});
	}
}

module.exports = {
	activate,
	deactivate
}
