const { window, workspace, commands, env, Uri } = require('vscode');

const configs = require('./configs');
const drivers = require('./drivers');
const registerCommands = require('./registerCommands');
const parseCommands = require('./parseCommands');
const searchCommands = require('./search');
const providers = require('./completionProviders');
const codeActions = require('./codeActions');
const utilities = require('./utilities');
const outputChannel = require('./outputChannel');
const searchArgs = require('./args/searchOptions');


/** @type { Array<import("vscode").Disposable> } */
let _disposables = [];

let enableWarningDialog = false;


/**
 * @param {import("vscode").ExtensionContext} context
 */
async function activate(context) {
  
  await outputChannel.dispose();
  
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
        return searchArgs.getKeys().includes(arg[0]);
      });
      Object.assign(args, Object.fromEntries(argsArray))
    }

    args.filesToInclude = await parseCommands.parseArgs(commandArgs, "folder");  // ould be multiple?, then loop
    args.filesToInclude = await utilities.escapePathsForFilesToInclude(args.filesToInclude);
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
        return searchArgs.getKeys().includes(arg[0]);
      });
      Object.assign(args, Object.fromEntries(argsArray));
    }

    args.filesToInclude = await parseCommands.parseArgs(commandArgs, "file");
    args.filesToInclude = await utilities.escapePathsForFilesToInclude(args.filesToInclude);

    args.triggerSearch = true;
    await searchCommands.runAllSearches(args);
	});

	context.subscriptions.push(contextMenuCommandFile);

	// ---------------------------------------------------------------------------------------------------------------------

	// make a context menu "searchInResults" command for searches in the Search Panel
	let contextMenuCommandResults = commands.registerCommand('find-and-transform.searchInResults', async (args) => {

		// args is undefined if coming from Command Palette or keybinding with no args
		// args.path, args.scheme coming from editor context menu

    if (args) {
      args = Object.entries(args).filter(arg => {
        return searchArgs.getKeys().includes(arg[0]);
      });

      args = Object.fromEntries(args);
    }
    else args = {};

    await env.clipboard.readText().then(string => {
      args.clipText = string;
    });
    
    args.triggerSearch = true;
    args.filesToInclude = await utilities.getSearchResultsFiles(args.clipText);
    args.filesToInclude = await utilities.escapePathsForFilesToInclude(args.filesToInclude);

    // pre/postCommands?
    await searchCommands.runAllSearches(args);
	});

	context.subscriptions.push(contextMenuCommandResults);  

	// ---------------------------------------------------------------------------------------------------------------------

	// make a generic "run" command for keybindings args using find in current file only
  const runDisposable = commands.registerCommand('findInCurrentFile', async (args) => {

    // get this from keybinding:  { find: "(howdy)", replace: "\\U$1" }
    
    drivers.startFindInCurrentFile(args, enableWarningDialog);
	});

	context.subscriptions.push(runDisposable);

	// ---------------------------------------------------------------------------------------------------------------------

	// make a generic "runInSearchPanel" command for keybindings args using the search panel
  let runInSearchPanelDisposable = commands.registerCommand('runInSearchPanel', async (args) => {
    
    drivers.startRunInSearchPanel(args, enableWarningDialog);
	});

	context.subscriptions.push(runInSearchPanelDisposable);

	// ---------------------------------------------------------------------------------------------------------------------
  
  // 
  let openReadmeAnchor = commands.registerCommand('find-and-transform.openReadmeAnchor', async (args) => {
      
    // add an arg for seachInPanel.md ?
    const readmePath = context.asAbsolutePath("README.md");
    let gotoUri = Uri.file(readmePath);
    
    // if (args.anchor) gotoUri = gotoUri.with({ fragment: 'using-the-ignorewhitespace-argument' });  // no # here
    if (args.anchor) gotoUri = gotoUri.with({ fragment: args.anchor });  // no # here
    commands.executeCommand("markdown.showPreview", gotoUri);
  });
  
  context.subscriptions.push(openReadmeAnchor);
  
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

	const findSettings = await configs.getSettings("findInCurrentFile");
	const searchSettings = await configs.getSettings("runInSearchPanel");

	if (findSettings || searchSettings) {
		await registerCommands.load(findSettings, searchSettings, context, enableWarningDialog);
	}

	if (firstRun) enableWarningDialog = await workspace.getConfiguration().get('find-and-transform.enableWarningDialog');

	if (findSettings.length) {
		await registerCommands.find(findSettings, context, _disposables, enableWarningDialog);
		await codeActions.makeCodeActionProvider(context, findSettings);
	}

	if (searchSettings.length) {
		await registerCommands.search(searchSettings, context, _disposables, enableWarningDialog);
	}
}


async function deactivate() {
  await outputChannel.dispose();
}

// exports.activate = activate;
// exports.deactivate = deactivate;

module.exports = {
	activate,
  deactivate
}