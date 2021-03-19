const vscode = require('vscode');
const commands = require('./commands');
const transform = require('./transform');


/** @type { Array<vscode.Disposable> } */
let disposables = [];


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	const findSettings = commands.getSettings();
	if (findSettings) {
		commands.loadCommands(findSettings, context);
		commands.registerCommands(findSettings, context, disposables);
	}

	// -----------------------------------------------------------------

		// a sample command using a hard-written find regex and upperCase replacements
	let disposable = vscode.commands.registerTextEditorCommand('find-and-transform.upcaseAllKeywords', async (editor, edit) => {

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

	// -----------------------------------------------------------------

	// make a generic "run" command here and in package.json for keybindings args
	// let runDisposable = vscode.commands.registerTextEditorCommand('jump-and-select.run', async (editor, edit, args) => {
	// 	// let kbText = args ? args.text : "";
	// 	transform.findTransform(editor, edit, args);
	// });
	// context.subscriptions.push(runDisposable);

	// ------------------------------------------------------------------

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration("find-and-transform")) {

			for (let disposable of disposables) {
				disposable.dispose();
			}
			// reload
			const findSettings = commands.getSettings();
			if (findSettings) {
				commands.loadCommands(findSettings, context);
				commands.registerCommands(findSettings, context, disposables);
			}

			vscode.window
        .showInformationMessage("Reload vscode to see the changes you made in the Command Palette.  The new commands can be used in keybindings without reloading.",
          ...['Reload vscode', 'Do not Reload'])   // two buttons
        .then(selected => {
          if (selected === 'Reload vscode') vscode.commands.executeCommand('workbench.action.reloadWindow');
          else vscode.commands.executeCommand('leaveEditorMessage');
        });
		}
	}));
}

// exports.activate = activate;

function deactivate() { }

module.exports = {
	activate,
	deactivate
}
