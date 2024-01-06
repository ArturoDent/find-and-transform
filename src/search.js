const { window, env, commands } = require('vscode');

const utilities = require('./utilities');
const resolve = require('./resolveVariables');
const searchOptions = require('./args/searchOptions');
// const delay = require('node:timers/promises');


/**
 * Input argsArray is an object from runInSearchPanel keybindings or settings
 * @param {Array} argsArray
 * @returns {Promise<object>} - an array of objects {key: value}
 */
exports.getObjectFromArgs = async function (argsArray) {
  
  const args = {};
  
	// could be bad keys/values here
	for (const [key, value] of Object.entries(argsArray)) {
    args[`${ key }`] = value;
	}
	return args;
}

/**
 * From 'findInCurrentFile' settings or keybindings. If necessary, split and run each command in 
 * its separate steps (if find/replace are arrays of multiple values).
 * 
 * @param {object} args
 */
exports.runAllSearches = async function (args) {

	let numFindArgs = 0;
  let numReplaceArgs = 0;

  // delayed into resolveVariables
  // await env.clipboard.readText().then(string => {
  //   args.clipText = string;
  // });

  if (Array.isArray(args.find)) numFindArgs = args.find.length;
  else if (typeof args.find == "string") numFindArgs = 1;
   // even if no 'find' one will be created from "wordAtCursor"

  if (Array.isArray(args.replace)) numReplaceArgs = args.replace.length;
  else if (typeof args.replace == "string") numReplaceArgs = 1;

  // maximum number of find/replaces in args
  let most = (numFindArgs >= numReplaceArgs) ? numFindArgs : numReplaceArgs;
  if (most === 0) most = 1;

  // fills each arg as an array to "most" length: find: ["(first)", "second", ""]
  // replace: ["\\U$1", "second", "third"], isRegex: [true, false, true]
  const expandedArgs = await _expandArgs(args, numFindArgs, numReplaceArgs);

  for (let index = 0; index < most; index++) { 

    const splitArgs = await _buildSearchArgs(expandedArgs, index);
    await this.useSearchPanel(splitArgs);
    
    // need a delay to get results files, if necessary
    if (splitArgs.delay) await new Promise(r => setTimeout(r, splitArgs.delay));
  }
}

/**
 * Get the args for each step in a possible find/replace array of commands.
 * 
 * @param {object} args - all args from a 'findInCurrentFile' keybinding or setting
 * @param {number} index - for which step to retrieve its args
 * @returns {Promise<object>} - all args for this command
 */
async function _buildSearchArgs(args, index)  {

  const editor = window.activeTextEditor;
  const { selections } = editor;
  
	let  indexedArgs = { isRegex: false, matchWholeWord: false, matchCase: false, triggerReplaceAll: false, filesToInclude: undefined };
  const splitArgs = await _returnArgsByIndex(args, index);
	Object.assign(indexedArgs, splitArgs);

  // find = "" is allowable and does a makeFind
  // else if (!indexedArgs.find) {
  if (!indexedArgs.find) {
    // if multiple selections, isRegex must be true
    const findObject = await resolve.makeFind(editor.selections, args);
    indexedArgs.find = findObject.find;
    indexedArgs.isRegex = indexedArgs.isRegex || findObject.mustBeRegex;
    indexedArgs.pointReplaces = findObject.emptyPointSelections;
  }

  // this is delayed - to resolveVariables.resolveSnippetVariables
  // indexedArgs.currentLanguageConfig = await utilities.getlanguageConfigComments(indexedArgs);

  // "find": "(\\$1 \\$2)" if find has (double-escaped) capture groups 
  // "find": "(\\U\\$1)"  not in find though
  if (indexedArgs.find && /\\\$(\d+)/.test(indexedArgs.find)) {
    // replaceFindCaptureGroups also does case modifiers
    indexedArgs.find = await resolve.replaceFindCaptureGroups(indexedArgs.find);
  }

  // add args.filesToInclude === "${resultsFiles} if index > 0 (i.e., search > 1)
  // notify message?, can be overridden by specifying some filesToInclude
  if (index > 0 && !indexedArgs.filesToInclude) indexedArgs.filesToInclude = "${resultsFiles}";
  
    // at least one more find/replace than this index
  const numSearches = args.find.length;
  if (numSearches > index+1) indexedArgs.triggerSearch = true;
  else if (numSearches === index+1 && args.filesToInclude === "${resultsFiles}") 
    indexedArgs.triggerSearch = true;

  // check for '${...}' some variable
  let re = /\$\{.+\}/g;
  if (indexedArgs.find.search(re) !== -1) {
    indexedArgs.find = await resolve.resolveSearchPathVariables(indexedArgs.find, indexedArgs, "findSearch", selections[0]);
    indexedArgs.find = await resolve.resolveSearchSnippetVariables(indexedArgs.find, indexedArgs, "findSearch", selections[0]);
    indexedArgs.find = await resolve.resolveExtensionDefinedVariables(indexedArgs.find, indexedArgs, "findSearch");
  }
  
  if (indexedArgs.filesToInclude && indexedArgs.filesToInclude.search(re) !== -1) {
    indexedArgs.filesToInclude = await resolve.resolveSearchPathVariables(indexedArgs.filesToInclude, indexedArgs, "filesToInclude", selections[0]);
    indexedArgs.filesToInclude = await resolve.resolveExtensionDefinedVariables(indexedArgs.filesToInclude, indexedArgs, "filesToInclude");
  }
  
  if (indexedArgs.filesToExclude && indexedArgs.filesToExclude.search(re) !== -1) {
    indexedArgs.filesToExclude = await resolve.resolveSearchPathVariables(indexedArgs.filesToExclude, indexedArgs, "filesToExclude", selections[0]);
    indexedArgs.filesToExclude = await resolve.resolveExtensionDefinedVariables(indexedArgs.filesToExclude, indexedArgs, "filesToExclude");
  }
  
  if (indexedArgs.replace && indexedArgs.replace.search(re) !== -1) {
    indexedArgs.replace = await resolve.resolveSearchPathVariables(indexedArgs.replace, indexedArgs, "replace", selections[0]);
    indexedArgs.replace = await resolve.resolveSearchSnippetVariables(indexedArgs.replace, indexedArgs, "replace", selections[0]);
    indexedArgs.replace = await resolve.resolveExtensionDefinedVariables(indexedArgs.replace, indexedArgs, "replace");
  }

  // so triggerReplaceAll is true for the last search only no matter the setting
  if (numSearches > index + 1) indexedArgs.triggerReplaceAll = false;

  // find: "" is okay, can triggerReplaceAll; 
  // but if no find at all don't triggerReplaceAll (as that is a replace with nothing)
  if (numSearches === index + 1 && (indexedArgs.replace !== ""  && !indexedArgs.replace)) indexedArgs.triggerReplaceAll = false;

  // add a delay if trigger a search now and there is another find later
  if (!indexedArgs.delay && indexedArgs.triggerSearch && (numSearches > index+1) )
      indexedArgs.delay = 2000;
  if (!indexedArgs.delay && indexedArgs.triggerReplaceAll) indexedArgs.delay = 2000;

  indexedArgs.query = indexedArgs.find;
  
  if (args.ignoreWhiteSpace && indexedArgs.query) {
    indexedArgs.query = indexedArgs.query.trim();
    indexedArgs.query = `\\n{0}` + indexedArgs.query.replace(/\s+/g, '\\s*');
  }
  
	return indexedArgs;
}


/**
 * Fill an array to the greater of numFindArgs or numReplaceArgs with args values.
 * Including empty strings if find.length < numReplaceArgs.
 * @param {object} args
 * @param {number} numFindArgs
 * @param {number} numReplaceArgs 
 * @returns {Promise<object>} 
 */
async function _expandArgs(args, numFindArgs, numReplaceArgs) {

  const expandedArgs = {};
  // if (args?.clipText) expandedArgs.clipText = args.clipText;
  let keys = searchOptions.getKeys();

  let most = (numFindArgs >= numReplaceArgs) ? numFindArgs : numReplaceArgs;
  if (most === 0) most = 1;
  keys = keys.filter(key => !(key.match(/title|preCommands|postCommands|clipText/)));

  for (const key of keys) {

    if (args[key] || args[key] === "") expandedArgs[key] = new Array();

    for (let index = 0; index < most; index++) { 

      if (key === "find") {

        if (!args.find && index === 0) expandedArgs[key] = new Array();
        // set find = "", if numReplaceArgs > numFindArgs
        if (Array.isArray(args[key]) && args[key].length <= index) expandedArgs[key].push("");
        else if (Array.isArray(args[key])) expandedArgs[key].push(args[key][index]);
        else if (index >= numFindArgs)  expandedArgs[key].push("");
        else expandedArgs[key].push(args[key]);
      }

      else if (args[key] || args[key] === "") {  // (key !== "find")
        // uses the last one if less than array.length, not true for find though
        if (Array.isArray(args[key]) && args[key].length <= index) expandedArgs[key].push(args[key][args[key].length-1]);
        else if (Array.isArray(args[key])) expandedArgs[key].push(args[key][index]);
        else expandedArgs[key].push(args[key]);
      }
    }
  }
  return expandedArgs;
}

/**
 * Get an object of args for the given index. find[0], replace[0], etc.
 * @param {object} args - all args from a 'findInCurrentFile' keybinding or setting
 * @param {number} index - for which step to retrieve its args
 * @returns {Promise<object>} 
 */
async function _returnArgsByIndex(args, index) {

  const indexedArgs = {};
  let keys = searchOptions.getKeys();
  
  keys = keys.filter(key => !(key.match(/title|preCommands|postCommands|clipText/)));
  if (args?.clipText) indexedArgs.clipText = args.clipText;

  for (const key of keys) {
    if (args[key]) indexedArgs[key] = args[key][index];
  }
  return indexedArgs;
}


/**
 * Register a command that uses the Search Panel
 * @param {object} args - the keybinding/settings args
 */
exports.useSearchPanel = async function (args) {

  if (args.triggerReplaceAll) args.triggerSearch = true;
  
  if (args.matchCase) {
    args.isCaseSensitive = args.matchCase;  // because workbench.action.findInFiles does not use "matchCase"!!
    delete args.matchCase;
  }

  // do args.clipText and args.resultsFiles need to be removed?  Doesn't seem to affect anything.
	await commands.executeCommand('workbench.action.findInFiles',
		args).then(() => {
      if (args.triggerReplaceAll)
        setTimeout(async () => {
          await commands.executeCommand('search.action.replaceAll');
				}, args.delay);
		});
};


