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


/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {

	// process.on('warning', (warning) => {
	// 	console.log(warning.stack);
	// });

	await _loadSettingsAsCommands(context, disposables);

	providers.makeKeybindingsCompletionProvider(context);
	providers.makeSettingsCompletionProvider(context);

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

		// if (args) argsArray = searchCommands.getObjectFromArgs(args);
		if (args) {
			for (const [key, value] of Object.entries(args)) {
				const obj = new Object();
				// so override these keys if there are in the keybinding or setting ?
				if (key !== "triggerSearch" && key !== "filesToInclude") {
				// if (key !== "filesToInclude") {
					obj[`${key}`] = value;
					argsArray.push(obj);
				}
			}
		}

			// argsArray = [
			// 	{ "triggerSearch": true },           
			// 	{ "filesToInclude": await utilities.getSearchResultsFiles() }
			// ];

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
		// not modal, "Don't show again" option

		// warn if args that don't belong (not in argsArray below)
		// bad values too TODO
		if (args) {

			const goodKeys = findCommands.getKeys();  // an array
			const notGood = Object.keys(args).filter(arg => !goodKeys.includes(arg));
			if (notGood.length) console.log(`"${ notGood }" arg is bad`);
			else {
				const goodValues = findCommands.getValues(); // an object

				for (const key of goodKeys) {

					if (args[key]) {  // and not the empty string "" TODO
						if (typeof goodValues[key] === "string") {
							
						}
						else {
							const badValue = !goodValues[key].includes(args[key]);

							if (badValue && typeof goodValues[key][0] === "boolean") console.log(`"${ args[key] }" is not an accepted value of "${ key }".  The value must be a boolean true or false (not a string).`);
							else if (badValue && typeof goodValues[key][0] === "string") console.log(`"${ args[key] }" is not an accepted value of "${ key }". Accepted values are "${ goodValues[key].join('", "') }".`);
						}
					}
				}
			}
		}

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
