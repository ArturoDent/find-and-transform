const { window } = require('vscode');

// const registerCommands = require('./registerCommands');
const parseCommands = require('./parseCommands');
const searchCommands = require('./search');
const utilities = require('./utilities');
const outputChannel = require('./outputChannel');
const prePostCommands = require('./prePostCommands');


/**
 * Main driver to start a findInCurrentFile from a keybinding/setting
 * Called in vscode.commands.registerTextEditorCommand()
 * 
 * @param {Object} args - keybinding/settings args
 * @param {boolean} enableWarningDialog - 
 * @returns 
 */
exports.startFindInCurrentFile = async function (args, enableWarningDialog) {
  
  await outputChannel.clear();

  // get this from keybinding:  { find: "(document)", replace: "\\U$1" }
  
  const editor = window.activeTextEditor;
  
  let continueRun = true;
    
  if (args?.preCommands) await prePostCommands.run(args.preCommands, "preCommands");
    
  let replacement = "";  
  if (Array.isArray(args?.replace)) replacement = args?.replace.join(' ');
  else if (args?.replace) replacement = args?.replace;
  
  // if (replacement?.search(/\$\{resultsFiles\}/) !== -1) args.resultsFiles = await utilities.getSearchResultsFiles(args.clipText);
    
  // could be an array of 1 : ["$${ return 'howdy', }$$"] or ["howdy $${ return 'pardner', }$$"]
  // call a function that looks for all jsOp's $${...}$$ in args.replace
  if (args && Array.isArray(args.replace) && args.replace.find(el => el.search(/^\s*\$\$\{\s*/m) !== -1))
    args.replace = await parseCommands.buildJSOperationsFromArgs(args.replace);
      
  if (args && Array.isArray(args.run) && args.run.find(el => el.search(/^\s*\$\$\{\s*/m) !== -1))
    args.run = await parseCommands.buildJSOperationsFromArgs(args.run);
    
  const argsBadObject = await utilities.checkArgs(args, "findBinding");
    
  if (Object.entries(argsBadObject).length) {  // send to utilities function
    await outputChannel.writeBadArgs(argsBadObject);
    return;    // abort
  }
    
  if (args && enableWarningDialog) {
    // boolean modal or not?
    if (argsBadObject.length) continueRun = await outputChannel.showBadKeyValueMessage(argsBadObject, true, "");
  }

  if (continueRun) {
    if (!args) args = { title: "Keybinding for generic command run" };
    else if (!args.title) args.title = "Keybinding for generic command run";

    await parseCommands.splitFindCommands(editor, args);
  }
};

/**
 * Main driver to start a runInSearchPanel from a keybinding/setting
 * Called in vscode.commands.registerTextEditorCommand()
 * 
 * @param {Object} args - keybinding/settings args
 * @param {boolean} enableWarningDialog - 
 * @returns 
 */
exports.startRunInSearchPanel = async function (args, enableWarningDialog) {
  
  await outputChannel.clear();
  
  let continueRun = true;

  if (args?.preCommands) await prePostCommands.run(args.preCommands, "preCommands");

  const argsBadObject = await utilities.checkArgs(args, "searchBinding");
  
  if (Object.entries(argsBadObject).length) {  // send to utilities function
    await outputChannel.writeBadArgs(argsBadObject);
    return;    // abort
  }
  
  if (args && enableWarningDialog) {
    // boolean modal or not?
    if (argsBadObject.length)	continueRun = await outputChannel.showBadKeyValueMessage(argsBadObject, true, "");
  }

  if (continueRun) {
    if (!args) args = { title: "Keybinding for generic command run"};
    else if (!args.title) args.title = "Keybinding for generic command run";
    await searchCommands.runAllSearches(args);
  }
  
  if (args?.postCommands) await prePostCommands.run(args.postCommands, "postCommands");
}