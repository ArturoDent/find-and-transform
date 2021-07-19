const vscode = require('vscode');
// const path = require('path');

const commands = require('./commands');
const findCommands = require('./transform');
const searchCommands = require('./search');
const providers = require('./completionProviders');
const codeActions = require('./codeActions');
const utilities = require('./utilities');

/** @type { Array<vscode.Disposable> } */
let disposables = [];

let enableWarningDialog = false;


/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {

	let firstRun = true;

	await _loadSettingsAsCommands(context, disposables, firstRun);

	providers.makeKeybindingsCompletionProvider(context);
	providers.makeSettingsCompletionProvider(context);

	// enableWarningDialog = await vscode.workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

	// ---------------------------------------------------------------------------------------------

	// make a context menu "searchInFolder" command for searches in the Search Panel
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

	// make a context menu "searchInFile" command for searches in the Search Panel
	// with 'files to include' this ${file} only
	let contextMenuCommandFile = vscode.commands.registerCommand('find-and-transform.searchInFile', async (args) => {

		let argsArray = [];

		if (args) {

			const relativePath = utilities.getRelativeFilePath(args.path);

			argsArray = [
				{ "triggerSearch": true },            // make triggerSearch the default
				{ "filesToInclude": relativePath }
			];
		}
		searchCommands.useSearchPanel(argsArray);
	});

	context.subscriptions.push(contextMenuCommandFile);

	// ---------------------------------------------------------------------------------------------------------------------

	// make a context menu "searchInResults" command for searches in the Search Panel
	// with 'files to include' this ${file} only
	let contextMenuCommandResults = vscode.commands.registerCommand('find-and-transform.searchInResults', async (args) => {

		let argsArray = [];

		// args is undefined if coming from Command Palette or keybinding with no args
		// args.path, args.scheme coming from editor context menu

		if (args) {
			for (const [key, value] of Object.entries(args)) {
				const obj = new Object();
				// so override these keys if there are in the keybinding or setting ?
				if (key !== "triggerSearch" && key !== "filesToInclude") {
					obj[`${key}`] = value;
					argsArray.push(obj);
				}
			}
		}

		// override triggerSearch? override filesToInclude? or add the settingkeybinding to it? 
		argsArray.push({ "triggerSearch": true }),
		argsArray.push({ "filesToInclude": await utilities.getSearchResultsFiles() });

		searchCommands.useSearchPanel(argsArray);
	});

	context.subscriptions.push(contextMenuCommandResults);

	// ---------------------------------------------------------------------------------------------------------------------

	// make a generic "run" command for keybindings args using find in current file only
	const runDisposable = vscode.commands.registerTextEditorCommand('findInCurrentFile', async (editor, edit, args) => {

		// get this from keybinding:  { find: "(document)", replace: "\\U$1" }
		// need this:                 [ { find: "(document)"	}, { replace: "\\U$1"	} ]

		// TODO warn if fewer capture groups in the find than used in the replace ? or did you mean isRegex
		let continueRun = true;

		if (args && enableWarningDialog) {
			const argsBadObject = utilities.checkArgs(args, "findBinding");
			// boolean modal or not
			if (argsBadObject.length) continueRun = await utilities.showBadKeyValueMessage(argsBadObject, true, "");
		}

		if (continueRun) {		
			let argsArray = [];
			if (args) {
				argsArray = [
					{ "title": "Keybinding for generic command run" },  // "title" is never used?
					{ "find": args.find },
					{ "replace": args.replace },
					{ "restrictFind": args.restrictFind },
					{ "cursorMoveSelect": args.cursorMoveSelect },
					{ "isRegex": args.isRegex },
					{ "matchCase": args.matchCase },
					{ "matchWholeWord": args.matchWholeWord },
				];
			}
			else argsArray = [
				{ "title": "Keybinding for generic command run" }
			];

			findCommands.findTransform(editor, edit, argsArray);
		}
	});

	context.subscriptions.push(runDisposable);

	// ---------------------------------------------------------------------------------------------------------------------

	// make a generic "runInSearchPanel" command for keybindings args using the search panel
	let runInSearchPanelDisposable = vscode.commands.registerCommand('runInSearchPanel', async (args) => {

		let continueRun = true;

		if (args && enableWarningDialog) {
			const argsBadObject = utilities.checkArgs(args, "searchBinding");
			// boolean modal or not
			if (argsBadObject.length)	continueRun = await utilities.showBadKeyValueMessage(argsBadObject, true, "");
		}

		if (continueRun) {
			let argsArray = [];
			if (args) argsArray = searchCommands.getObjectFromArgs(args);
			else argsArray = [
				{ "title": "Keybinding for generic command run" }
			];

			searchCommands.useSearchPanel(argsArray);
		}
	});

	context.subscriptions.push(runInSearchPanelDisposable);

	// ----------------------------------------------------------------------------------------------------------------------

	// select the 'n' in completionItems like '${n:/upcase}' or '${n:+add text}'
	// not exposed in package.json
	let selectDigitInCompletion = vscode.commands.registerCommand('find-and-transform.selectDigitInCompletion', async (...args) => {

		//args = [completionText, Range]
		// if completionText startsWith '\\U$n' or '${n'
		let keyLength;
		if (args[0]?.startsWith("${n")) keyLength = 3;
		else if (args[0]?.search(/^\\\\[UuLl]\$n/m) === 0) keyLength = 5;
		else return;

		if (args[1]?.start) {
			const digitStart = new vscode.Position(args[1].start.line, args[1].start.character + keyLength - 1);
			const digitEnd = new vscode.Position(args[1].start.line, args[1].start.character + keyLength);
			vscode.window.activeTextEditor.selection = new vscode.Selection(digitStart, digitEnd);
		}
	});

	context.subscriptions.push(selectDigitInCompletion);

	// ---------------------------------------------------------------------------------------------------------------------

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
		
		// if (event.affectsConfiguration("find-and-transform.enableWarningDialog"))
		// enableWarningDialog = await vscode.workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

		// else if (event.affectsConfiguration("findInCurrentFile") ||
		// 		event.affectsConfiguration("runInSearchPanel")) {
		
		if (event.affectsConfiguration("find-and-transform.enableWarningDialog")
			|| event.affectsConfiguration("findInCurrentFile")
			|| event.affectsConfiguration("runInSearchPanel")) {
			
			enableWarningDialog = await vscode.workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

			for (let disposable of disposables) {
				await disposable.dispose();
			}
			// should do disposables = [] here? Or does it matter?

			// reload
			await _loadSettingsAsCommands(context, disposables, false);

			await providers.makeKeybindingsCompletionProvider(context);
			await providers.makeSettingsCompletionProvider(context);

			if (!event.affectsConfiguration("find-and-transform.enableWarningDialog")) {
				vscode.window
					.showInformationMessage("Reload vscode to see the changes you made in the Command Palette.",
						...['Reload vscode', 'Do not Reload'])   // two buttons
					.then(selected => {
						if (selected === 'Reload vscode') vscode.commands.executeCommand('workbench.action.reloadWindow');
						else vscode.commands.executeCommand('leaveEditorMessage');
					});
			}
		}
	}));
}

/**
 * 
 * @param {vscode.ExtensionContext} context 
 * @param {Array<vscode.Disposable>} disposables
 * @param {Boolean} firstRun 
 */
async function _loadSettingsAsCommands(context, disposables, firstRun) {

	// if (!firstRun) enableWarningDialog = await vscode.workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

	const findSettings = await commands.getSettings("findInCurrentFile");
	const searchSettings = await commands.getSettings("runInSearchPanel");

	if (findSettings || searchSettings) {
		await commands.loadCommands(findSettings, searchSettings, context, enableWarningDialog);
	}

	if (firstRun) enableWarningDialog = await vscode.workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

	if (findSettings.length) {
		await commands.registerFindCommands(findSettings, context, disposables, enableWarningDialog);
		await codeActions.makeCodeActionProvider(context, findSettings);
	}

	if (searchSettings.length) {
		await commands.registerSearchCommands(searchSettings, context, disposables, enableWarningDialog);
	}
}

// exports.activate = activate;

function deactivate() { }

module.exports = {
	activate,
	deactivate
}
