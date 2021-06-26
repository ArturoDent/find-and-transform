const vscode = require('vscode');
const path = require('path');

const commands = require('./commands');
const findCommands = require('./transform');
const searchCommands = require('./search');
const providers = require('./completionProviders');
const codeActions = require('./codeActions');
const utilities = require('./utilities');

/** @type { Array<vscode.Disposable> } */
let disposables = [];



/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {

	// process.on('warning', (warning) => {
	// 	console.log(warning.stack);
	// });

	await _loadSettingsAsCommands(context, disposables);

	await providers.makeKeybindingsCompletionProvider(context);
	await providers.makeSettingsCompletionProvider(context);

	// ---------------------------------------------------------------------------------------------

	// make a context menu "runInSearchPanel" command for searches in the Search Panel
	// with 'files to include' this ${file} only
	let contextMenuCommandFolder = vscode.commands.registerCommand('find-and-transform.searchInFolder', async (args) => {

		let argsArray = [];

		if (args) {

			const relativeFolderPath = utilities.getRelativeFolderPath(args.path);

			argsArray = [
				{ "triggerSearch": true },         // make triggerSearch the default
				{ "filesToInclude": relativeFolderPath }
			];
		}

		searchCommands.useSearchPanel(argsArray);
	});

	context.subscriptions.push(contextMenuCommandFolder);

	// -------------------------------------------------------------------------------------------

	// make a context menu "runInSearchPanel" command for searches in the Search Panel
	// with 'files to include' this ${file} only
	let contextMenuCommandFile = vscode.commands.registerCommand('find-and-transform.searchInFile', async (args) => {

		let argsArray = [];

		if (args) {

			// let relativePath;
			// const basename = path.posix.basename(args.path);
			// if (basename === "settings.json" || basename === "keybindings.json") {
			// 		relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri);
			// 		relativePath = relativePath.substring(3);
			// }
			// else {
			// 		const wsFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(args.path)).uri.path;
			// 		relativePath = path.posix.relative(wsFolder, args.path);
			// }

			const relativePath = utilities.getRelativeFilePath(args.path);

			argsArray = [
				{ "triggerSearch": true },         // make triggerSearch the default
				{ "filesToInclude": relativePath }
			];
		}
				// { "filesToInclude": "${file}"}

		searchCommands.useSearchPanel(argsArray);
	});

	context.subscriptions.push(contextMenuCommandFile);

	// ---------------------------------------------------------------------------------------------------------------------

	// make a generic "run" command for keybindings args using find in current file only
	const runDisposable = vscode.commands.registerTextEditorCommand('findInCurrentFile', async (editor, edit, args) => {

		// get this from keybinding:  { find: "(document)", replace: "\\U$1" }
		// need this:                 [ { find: "(document)"	}, { replace: "\\U$1"	} ]

		let argsArray = [];
		if (args) {
			argsArray = [
				{ "title": "Keybinding for generic command run" },  // "title" is never used?
				{ "find": args.find },
				{ "replace": args.replace },
				{ "restrictFind": args.restrictFind },
				{ "cursorMoveSelect": args.cursorMoveSelect },
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
			await codeActions.makeCodeActionProvider(context, findSettings);
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
