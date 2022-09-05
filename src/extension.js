const vscode = require('vscode');
const commands = require('./commands');
const parseCommands = require('./parseCommands');
const searchCommands = require('./search');
const providers = require('./completionProviders');
const codeActions = require('./codeActions');
const utilities = require('./utilities');


exports.outputChannel = vscode.window.createOutputChannel("find-and-transform");

/** @type { Array<vscode.Disposable> } */
let _disposables = [];

let enableWarningDialog = false;


/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  
  this.context = context;  // global  
  
	let firstRun = true;

  await _loadSettingsAsCommands(context, _disposables, firstRun);

  providers.makeKeybindingsCompletionProvider(context);
	providers.makeSettingsCompletionProvider(context);

	// enableWarningDialog = await vscode.workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

	// ---------------------------------------------------------------------------------------------

	// make a context menu "searchInFolder" command for searches in the Search Panel: "Search in Folder(s)"
	// parse the args to get the filesToInclude entry
	let contextMenuCommandFolder = vscode.commands.registerCommand('find-and-transform.searchInFolder', async (...commandArgs) => {

    // args is undefined if coming from Command Palette or keybinding with no args
		// args is a vscode.Uri if coming from editor context menu
    // args is a [0]vscode.Uri, [1].editorIndex if coming from editor tab/title context menu
    // args from explorer context menu: array of Uri's

    let args = {};

    if (commandArgs?.length === 1 && !(commandArgs[0] instanceof vscode.Uri)) {  // if from keybinding
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
	let contextMenuCommandFile = vscode.commands.registerCommand('find-and-transform.searchInFile', async (...commandArgs) => {
    
    let args = {};

    if (commandArgs?.length === 1 && !(commandArgs[0] instanceof vscode.Uri)) {   // if from keybinding
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
	let contextMenuCommandResults = vscode.commands.registerCommand('find-and-transform.searchInResults', async (args) => {

		// args is undefined if coming from Command Palette or keybinding with no args
		// args.path, args.scheme coming from editor context menu

    if (args) {
      args = Object.entries(args).filter(arg => {
        return searchCommands.getKeys().includes(arg[0]);
      });

      args = Object.fromEntries(args);
    }
    else args = {};

    await vscode.env.clipboard.readText().then(string => {
      args.clipText = string;
    });
    
    args.triggerSearch = true;
    args.filesToInclude = await utilities.getSearchResultsFiles(args.clipText);  // isn't this done in useSearchPanel() TODO

    // pre/postCommands?  TODO
    await searchCommands.runAllSearches(args);
	});

	context.subscriptions.push(contextMenuCommandResults);  

	// ---------------------------------------------------------------------------------------------------------------------

	// make a generic "run" command for keybindings args using find in current file only
  const runDisposable = vscode.commands.registerTextEditorCommand('findInCurrentFile', async (editor, edit, args) => {

    // get this from keybinding:  { find: "(document)", replace: "\\U$1" }

    let continueRun = true;
    
    if (args?.preCommands) await commands.runPrePostCommands(args.preCommands);
    
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
      await utilities.writeBadArgsToOutputChannel(argsBadObject, module.exports.outputChannel);
      return;    // abort
    }
    
		if (args && enableWarningDialog) {
			// boolean modal or not
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
	let runInSearchPanelDisposable = vscode.commands.registerCommand('runInSearchPanel', async (args) => {

		let continueRun = true;

		if (args?.preCommands) {
      await commands.runPrePostCommands(args.preCommands);
    }

    const argsBadObject = await utilities.checkArgs(args, "searchBinding");
    
    if (Object.entries(argsBadObject).length) {  // send to utilities function
      await utilities.writeBadArgsToOutputChannel(argsBadObject, module.exports.outputChannel);
      return;    // abort
    }
    
		if (args && enableWarningDialog) {
			// boolean modal or not
			if (argsBadObject.length)	continueRun = await utilities.showBadKeyValueMessage(argsBadObject, true, "");
		}

		if (continueRun) {
      if (!args) args = { title: "Keybinding for generic command run"};
      else if (!args.title) args.title = "Keybinding for generic command run";
      await searchCommands.runAllSearches(args);
		}
		
    if (args?.postCommands) await commands.runPrePostCommands(args.postCommands);
	});

	context.subscriptions.push(runInSearchPanelDisposable);

	// ----------------------------------------------------------------------------------------------------------------------

	// select the 'n' in completionItems like '${n:/upcase}' or '${n:+add text}'
	// not exposed in package.json
  let selectDigitInCompletion = vscode.commands.registerCommand('find-and-transform.selectDigitInCompletion', async (completionText, completionRange) => {

    // args = [completionText, Range]
    // if completionText startsWith '\\U$n' or '${n'
    let keyLength;
    if (completionText?.startsWith("${n")) keyLength = 3;
    else if (completionText?.search(/^\\\\[UuLl]\$n/m) === 0) keyLength = 5;
    else if (completionText?.search(/^\$\{getTextLines:n/m) === 0) keyLength = 16;
    else return;

    if (completionRange?.start) {
      const digitStart = new vscode.Position(completionRange.start.line, completionRange.start.character + keyLength - 1);
      const digitEnd = new vscode.Position(completionRange.start.line, completionRange.start.character + keyLength);
      vscode.window.activeTextEditor.selection = new vscode.Selection(digitStart, digitEnd);
    }
  });

  context.subscriptions.push(selectDigitInCompletion);

	// ---------------------------------------------------------------------------------------------------------------------
  
  // select 'operation' in completionItems like '$${operation}$$'
	// not exposed in package.json
  let selectOperationInCompletion = vscode.commands.registerCommand('find-and-transform.selectOperationInCompletion', async (completionText, completionRange) => {

		// args = [completionText, Range]
		// if completionText startsWith '$${operation'
		let keyLength;
		if (completionText?.startsWith("$${operation")) keyLength = 12;
		else return;

		if (completionRange?.start) {
			const operationStart = new vscode.Position(completionRange.start.line, completionRange.start.character + keyLength - 9);
			const operationEnd = new vscode.Position(completionRange.start.line, completionRange.start.character + keyLength);
			vscode.window.activeTextEditor.selection = new vscode.Selection(operationStart, operationEnd);
		}
	});

	context.subscriptions.push(selectOperationInCompletion);

	// ---------------------------------------------------------------------------------------------------------------------

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
		
		if (event.affectsConfiguration("find-and-transform.enableWarningDialog")
			|| event.affectsConfiguration("findInCurrentFile")
			|| event.affectsConfiguration("runInSearchPanel")) {
			
			enableWarningDialog = await vscode.workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

      // easier to just dispose of them all and re-enable them all
			for (let disposable of _disposables) {
				await disposable.dispose();
			}
      
			// reload
			await _loadSettingsAsCommands(context, _disposables, false);

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
 * @param {Array<vscode.Disposable>} _disposables
 * @param {boolean} firstRun 
 */
async function _loadSettingsAsCommands(context, _disposables, firstRun) {

	const findSettings = await commands.getSettings("findInCurrentFile");
	const searchSettings = await commands.getSettings("runInSearchPanel");

	if (findSettings || searchSettings) {
		await commands.loadCommands(findSettings, searchSettings, context, enableWarningDialog);
	}

	if (firstRun) enableWarningDialog = await vscode.workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

	if (findSettings.length) {
		await commands.registerFindCommands(findSettings, context, _disposables, enableWarningDialog);
		await codeActions.makeCodeActionProvider(context, findSettings);
	}

	if (searchSettings.length) {
		await commands.registerSearchCommands(searchSettings, context, _disposables, enableWarningDialog);
	}
}

// exports.activate = activate;

function deactivate() { }

module.exports = {
	activate,
  deactivate,
}

