const vscode = require('vscode');
const commands = require('./commands');
const findCommands = require('./transform');
const searchCommands = require('./search');
const providers = require('./completionProviders');


/** @type { Array<vscode.Disposable> } */
let disposables = [];


/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {

	_loadSettingsAsCommands(context, disposables);

	await providers.makeKeybindingsCompletionProvider(context);
	await providers.makeSettingsCompletionProvider(context);

	// -----------------------------------------------------------------------------------------------------------

		// a sample command using a hard-written find regex and upperCase replacements
	let disposable = vscode.commands.registerTextEditorCommand('findInCurrentFile.upcaseAllKeywords', async (editor, edit) => {

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

	// make a generic "run" command for keybindings args using find in current file only
	let runDisposable = vscode.commands.registerTextEditorCommand('findInCurrentFile', async (editor, edit, args) => {

		// get this from keybinding:  { find: "(document)", replace: "\\U$1" }
		// need this:                 [ { find: "(document)"	}, { replace: "\\U$1"	} ]


		let argsArray = [];
		if (args) {
			argsArray = [
				{ "title": "Keybinding for generic command run" },  // "title" is never used?
				{ "find": args.find },
				{ "replace": args.replace },
				{ "restrictFind": args.restrictFind }
			];
		}
		else argsArray = [
			{ "title": "Keybinding for generic command run" }
		];

		findCommands.findTransform(editor, edit, argsArray);
	});

	context.subscriptions.push(runDisposable);

	// ---------------------------------------------------------------------------------------------------------------------

	// make a generic "runInSearchPanel" command for keybindings args using the search panel
	let runInSearchPanelDisposable = vscode.commands.registerCommand('runInSearchPanel', async (args) => {

		let argsArray = [];

		if (args) argsArray = searchCommands.getObjectFromArgs(args);
		else argsArray = [
			{ "title": "Keybinding for generic command run" }
		];

		searchCommands.useSearchPanel(argsArray);
	});

	context.subscriptions.push(runInSearchPanelDisposable);

	// ----------------------------------------------------------------------------------------------------------------------

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration( async (event) => {
		if (event.affectsConfiguration("findInCurrentFile") ||
				event.affectsConfiguration("runInSearchPanel")) {

			for (let disposable of disposables) {
				await disposable.dispose();
			}
			// should do disposables = [] here? Or does it matter?

			// reload
			await _loadSettingsAsCommands(context, disposables);

			await providers.makeKeybindingsCompletionProvider(context);
			await providers.makeSettingsCompletionProvider(context);

			vscode.window
        .showInformationMessage("Reload vscode to see the changes you made in the Command Palette.",
          ...['Reload vscode', 'Do not Reload'])   // two buttons
        .then(selected => {
          if (selected === 'Reload vscode') vscode.commands.executeCommand('workbench.action.reloadWindow');
          else vscode.commands.executeCommand('leaveEditorMessage');
        });
		}
	}));
}

async function _loadSettingsAsCommands(context, disposables) {

		const findSettings = await commands.getSettings("findInCurrentFile");
		const searchSettings = await commands.getSettings("runInSearchPanel");

		if (findSettings || searchSettings) {
			await commands.loadCommands(findSettings, searchSettings, context);
		}

		if (findSettings.length) {
			await commands.registerFindCommands(findSettings, context, disposables);
		}

		if (searchSettings.length) {
			await commands.registerSearchCommands(searchSettings, context, disposables);
		}
}


// exports.activate = activate;

function deactivate() { }

module.exports = {
	activate,
	deactivate
}