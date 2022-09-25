const { window, workspace, commands, env, Uri, Position, Selection } = require('vscode');

const extensionCommands = require('./commands');
const parseCommands = require('./parseCommands');
const searchCommands = require('./search');
const providers = require('./completionProviders');
const codeActions = require('./codeActions');
const utilities = require('./utilities');


exports.outputChannel = window.createOutputChannel("find-and-transform");

/** @type { Array<import("vscode").Disposable> } */
let _disposables = [];

let enableWarningDialog = false;

/**
 * @param {import("vscode").ExtensionContext} context
 */
async function activate(context) {
  
  this.context = context;  // global  
	let firstRun = true;

  await _loadSettingsAsCommands(context, _disposables, firstRun);

  providers.makeKeybindingsCompletionProvider(context);
	providers.makeSettingsCompletionProvider(context);

	enableWarningDialog = await workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

	// ---------------------------------------------------------------------------------------------

	// make a context menu "searchInFolder" command for searches in the Search Panel: "Search in Folder(s)"
	// parse the args to get the filesToInclude entry
	let contextMenuCommandFolder = commands.registerCommand('find-and-transform.searchInFolder', async (...commandArgs) => {

    // args is undefined if coming from Command Palette or keybinding with no args
		// args is a Uri if coming from editor context menu
    // args is a [0]Uri, [1].editorIndex if coming from editor tab/title context menu
    // args from explorer context menu: array of Uri's

    let args = {};

    if (commandArgs?.length === 1 && !(commandArgs[0] instanceof Uri)) {  // if from keybinding
      let argsArray = Object.entries(commandArgs[0]).filter(arg => {
        return searchCommands.getKeys().includes(arg[0]);
      });
      Object.assign(args, Object.fromEntries(argsArray))
    }

    args.filesToInclude = await parseCommands.parseArgs(commandArgs, "folder");
    args.triggerSearch = true;
    await searchCommands.runAllSearches(args);
	});

	context.subscriptions.push(contextMenuCommandFolder);

	// -------------------------------------------------------------------------------------------

	// make a context menu "searchInFile" command for searches in the Search Panel: "Search in File(s)"
	// parse args to get filesToInclude entry
	let contextMenuCommandFile = commands.registerCommand('find-and-transform.searchInFile', async (...commandArgs) => {
    
    let args = {};

    if (commandArgs?.length === 1 && !(commandArgs[0] instanceof Uri)) {   // if from keybinding
      let argsArray = Object.entries(commandArgs[0]).filter(arg => {
        return searchCommands.getKeys().includes(arg[0]);
      });
      Object.assign(args, Object.fromEntries(argsArray));
    }

    args.filesToInclude = await parseCommands.parseArgs(commandArgs, "file");
    args.triggerSearch = true;
    await searchCommands.runAllSearches(args);
	});

	context.subscriptions.push(contextMenuCommandFile);

	// ---------------------------------------------------------------------------------------------------------------------

	// make a context menu "searchInResults" command for searches in the Search Panel
	// with 'files to include' this ${file} only
	let contextMenuCommandResults = commands.registerCommand('find-and-transform.searchInResults', async (args) => {

		// args is undefined if coming from Command Palette or keybinding with no args
		// args.path, args.scheme coming from editor context menu

    if (args) {
      args = Object.entries(args).filter(arg => {
        return searchCommands.getKeys().includes(arg[0]);
      });

      args = Object.fromEntries(args);
    }
    else args = {};

    await env.clipboard.readText().then(string => {
      args.clipText = string;
    });
    
    args.triggerSearch = true;
    args.filesToInclude = await utilities.getSearchResultsFiles(args.clipText);  // isn't this done in useSearchPanel() TODO

    // pre/postCommands?
    await searchCommands.runAllSearches(args);
	});

	context.subscriptions.push(contextMenuCommandResults);  

	// ---------------------------------------------------------------------------------------------------------------------

	// make a generic "run" command for keybindings args using find in current file only
  const runDisposable = commands.registerTextEditorCommand('findInCurrentFile', async (editor, edit, args) => {

    // get this from keybinding:  { find: "(document)", replace: "\\U$1" }

    let continueRun = true;
    
    if (args?.preCommands) await extensionCommands.runPrePostCommands(args.preCommands, "preCommands");
    
    let replacement = "";
    if (Array.isArray(args?.replace)) replacement = args?.replace.join(' ');
    else if (args?.replace) replacement = args?.replace;
    if (replacement?.search(/\$\{resultsFiles\}/) !== -1) args.resultsFiles = await utilities.getSearchResultsFiles(args.clipText);
    
    // could be an array of 1 : ["$${ return 'howdy', }$$"] or ["howdy $${ return 'pardner', }$$"]
    // call a function that looks for all jsOp's $${...}$$ in args.replace
    if (args && Array.isArray(args.replace) && args.replace.find(el => el.search(/^\s*\$\$\{\s*/m) !== -1))
      args.replace = await parseCommands.buildJSOperationsFromArgs(args.replace);
    
    const argsBadObject = await utilities.checkArgs(args, "findBinding");
    
    if (Object.entries(argsBadObject).length) {  // send to utilities function
      await utilities.writeBadArgsToOutputChannel(argsBadObject);
      return;    // abort
    }
    
		if (args && enableWarningDialog) {
			// boolean modal or not?
			if (argsBadObject.length) continueRun = await utilities.showBadKeyValueMessage(argsBadObject, true, "");
		}

		if (continueRun) {		
      if (!args) args = { title: "Keybinding for generic command run" };
			else if (!args.title) args.title = "Keybinding for generic command run";

			await parseCommands.splitFindCommands(editor, edit, args);
    }
	});

	context.subscriptions.push(runDisposable);

	// ---------------------------------------------------------------------------------------------------------------------

	// make a generic "runInSearchPanel" command for keybindings args using the search panel
	let runInSearchPanelDisposable = commands.registerCommand('runInSearchPanel', async (args) => {

		let continueRun = true;

		if (args?.preCommands) {
      await extensionCommands.runPrePostCommands(args.preCommands, "preCommands");
    }

    const argsBadObject = await utilities.checkArgs(args, "searchBinding");
    
    if (Object.entries(argsBadObject).length) {  // send to utilities function
      await utilities.writeBadArgsToOutputChannel(argsBadObject);
      return;    // abort
    }
    
		if (args && enableWarningDialog) {
			// boolean modal or not?
			if (argsBadObject.length)	continueRun = await utilities.showBadKeyValueMessage(argsBadObject, true, "");
		}

		if (continueRun) {
      if (!args) args = { title: "Keybinding for generic command run"};
      else if (!args.title) args.title = "Keybinding for generic command run";
      await searchCommands.runAllSearches(args);
		}
		
    if (args?.postCommands) await extensionCommands.runPrePostCommands(args.postCommands, "postCommands");
	});

	context.subscriptions.push(runInSearchPanelDisposable);

	// ----------------------------------------------------------------------------------------------------------------------

	// select the 'n' in completionItems like '${n:/upcase}' or '${n:+add text}'
	// not exposed in package.json
  let selectDigitInCompletion = commands.registerCommand('find-and-transform.selectDigitInCompletion', async (completionText, completionRange) => {

    const editor = window.activeTextEditor;
    // args = [completionText, Range]
    // if completionText startsWith '\\U$n' or '${n'
    let keyLength;
    if (completionText?.startsWith("${n")) keyLength = 3;
    else if (completionText?.search(/^\\\\[UuLl]\$n/m) === 0) keyLength = 5;
    else if (completionText?.search(/^\$\{getTextLines:n/m) === 0) keyLength = 16;
    else return;

    if (completionRange?.start) {
      const digitStart = new Position(completionRange.start.line, completionRange.start.character + keyLength - 1);
      const digitEnd = new Position(completionRange.start.line, completionRange.start.character + keyLength);
      editor.selection = new Selection(digitStart, digitEnd);
    }
  });

  context.subscriptions.push(selectDigitInCompletion);

	// ---------------------------------------------------------------------------------------------------------------------
  
  // select 'operation' in completionItems like '$${operation}$$'
	// not exposed in package.json
  let selectOperationInCompletion = commands.registerCommand('find-and-transform.selectOperationInCompletion', async (completionText, completionRange) => {

    const editor = window.activeTextEditor;
		// args = [completionText, Range]
		// if completionText startsWith '$${operation'
		let keyLength;
		if (completionText?.startsWith("$${operation")) keyLength = 12;
		else return;

		if (completionRange?.start) {
			const operationStart = new Position(completionRange.start.line, completionRange.start.character + keyLength - 9);
			const operationEnd = new Position(completionRange.start.line, completionRange.start.character + keyLength);
			editor.selection = new Selection(operationStart, operationEnd);
		}
	});

	context.subscriptions.push(selectOperationInCompletion);

	// ---------------------------------------------------------------------------------------------------------------------

	context.subscriptions.push(workspace.onDidChangeConfiguration(async (event) => {
		
		if (event.affectsConfiguration("find-and-transform.enableWarningDialog")
			|| event.affectsConfiguration("findInCurrentFile")
			|| event.affectsConfiguration("runInSearchPanel")) {
			
			enableWarningDialog = await workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

      // easier to just dispose of them all and re-enable them all
			for (let disposable of _disposables) {
				await disposable.dispose();
			}
      
			// reload
			await _loadSettingsAsCommands(context, _disposables, false);

			await providers.makeKeybindingsCompletionProvider(context);
			await providers.makeSettingsCompletionProvider(context);

			if (!event.affectsConfiguration("find-and-transform.enableWarningDialog")) {
				window
					.showInformationMessage("Reload vscode to see the changes you made in the Command Palette.",
						...['Reload vscode', 'Do not Reload'])   // two buttons
					.then(selected => {
						if (selected === 'Reload vscode') commands.executeCommand('workbench.action.reloadWindow');
						else commands.executeCommand('leaveEditorMessage');
					});
			}
		}
	}));
}

/**
 * 
 * @param {import("vscode").ExtensionContext} context 
 * @param {Array<import("vscode").Disposable>} _disposables
 * @param {boolean} firstRun 
 */
async function _loadSettingsAsCommands(context, _disposables, firstRun) {

	const findSettings = await extensionCommands.getSettings("findInCurrentFile");
	const searchSettings = await extensionCommands.getSettings("runInSearchPanel");

	if (findSettings || searchSettings) {
		await extensionCommands.loadCommands(findSettings, searchSettings, context, enableWarningDialog);
	}

	if (firstRun) enableWarningDialog = await workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

	if (findSettings.length) {
		await extensionCommands.registerFindCommands(findSettings, context, _disposables, enableWarningDialog);
		await codeActions.makeCodeActionProvider(context, findSettings);
	}

	if (searchSettings.length) {
		await extensionCommands.registerSearchCommands(searchSettings, context, _disposables, enableWarningDialog);
	}
}

// exports.activate = activate;

function deactivate() { }

module.exports = {
	activate,
  deactivate
}