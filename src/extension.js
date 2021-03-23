const vscode = require('vscode');
const commands = require('./commands');
const transform = require('./transform');
const providers = require('./completionProviders');


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

	providers.makeKeybindingsCompletionProvider(context);
	providers.makeSettingsCompletionProvider(context);

	// -----------------------------------------------------------------------------------------------------------

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

	// ---------------------------------------------------------------------------------------------------------------------

	// make a generic "run" command for keybindings args
	let runDisposable = vscode.commands.registerTextEditorCommand('find-and-transform.run', async (editor, edit, args) => {

		// get this from keybinding:  { find: "(document)", replace: "\\U$1" }
		// need this:                 [ { find: "(document)"	}, { replace: "\\U$1"	} ]

		if (!args) {     // or not
			vscode.window
        .showInformationMessage('You must have "find" and "replace" keys and values in your "find-and-transform.run" keybinding.',
          ...['Got it'])   // one button
        .then(selected => {
          if (selected === 'Got it') vscode.commands.executeCommand('leaveEditorMessage');
				});
			return;
			// args.find = ""; args.replace = "";
		}

		// args in keybinding can be in any order, a new title will be constructed
		// a title must be present to create a command from this object
		let argsArray = [
			{ "title": "Keybinding for generic command run" },
 			{ "find": args.find },
 			{ "replace": args.replace }
		];
		transform.findTransform(editor, edit, argsArray);
	});

	context.subscriptions.push(runDisposable);

	// ----------------------------------------------------------------------------------------------------------------------

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
