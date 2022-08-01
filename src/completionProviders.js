const vscode = require('vscode');
const jsonc = require("jsonc-parser");
const searchCommands = require('./search');
const findCommands = require('./transform');


/**
 * Register a CompletionItemProvider for keybindings.json
 * @param {vscode.ExtensionContext} context
 */
exports.makeKeybindingsCompletionProvider = async function(context) {
    const configCompletionProvider = vscode.languages.registerCompletionItemProvider (
      { pattern: '**/keybindings.json' },
      {
        provideCompletionItems(document, position) {

					const linePrefix = document.lineAt(position).text.substring(0, position.character);
					let find = false;
					let search = false;

					// ---------------    command completion start   ----------------------------

					if (linePrefix.search(/^\s*"command":\s*"(findInCurrentFile)\./) !== -1) find = true;
					if (linePrefix.search(/^\s*"command":\s*"(runInSearchPanel)\./) !== -1) search = true;

					if (find || search) {

						const thisExtension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
						const packageCommands = thisExtension.packageJSON.contributes.commands;

						const completionArray = [];

						packageCommands.forEach(pcommand => {
							if (find && pcommand.command.startsWith("findInCurrentFile")) {
								completionArray.push(_makeCompletionItem(pcommand.command.replace(/^.*\./, ""), new vscode.Range(position, position), null, "", "A 'findInCurrentFile' from your settings."));
							}
							else if (search && pcommand.command.startsWith("runInSearchPanel")) {
								completionArray.push(_makeCompletionItem(pcommand.command.replace(/^.*\./, ""), new vscode.Range(position, position), null, "", "A 'runInSearchPanel' from your settings."));
							}
						});
						return completionArray;
					}

					// ---------------    command completion end   ----------------------------

					// ---------------    args completion start   ----------------------------

					find = false;
					search = false;
							
					const rootNode = jsonc.parseTree(document.getText());
					const curLocation = jsonc.getLocation(document.getText(), document.offsetAt(position));

          const thisConfig = _findConfig(rootNode, document.offsetAt(position));
          const nodeValue = jsonc.getNodeValue(thisConfig);
          const command = nodeValue.command;

          if (command.startsWith("find-and-transform")) search = true;
          else if (command.startsWith("runInSearchPanel")) search = true;
          else if (command.startsWith("findInCurrentFile")) find = true;
          else return undefined;
          
					// ---------  $ for 'filesToInclude/filesToExclude/find/replace/restrictFind' completions  ------

          // curLocation.path = [26, 'args', 'replace', 1], isAtPropertyKey = false
          
          const argCompletions = _completeArgs(linePrefix, position, find, search, curLocation.path[2]);
          if (argCompletions) return argCompletions;
          
					// ---------------    duplicate args removal start   ----------------------------

          // curLocation.path = [26, 'args', ''] = good  or [26, 'args', 'replace', 1] = bad here
          if (!curLocation?.path[2] === false || curLocation?.path[1] !== 'args') return undefined;

          const argsNode = thisConfig.children.filter(entry => {
            return entry.children[0].value === "args";
          })

          const argsStartingIndex = argsNode[0].offset;
          const argsLength = argsStartingIndex + argsNode[0].length;

					const argsRange = new vscode.Range(document.positionAt(argsStartingIndex), document.positionAt(argsLength));
					const argsText = document.getText(argsRange);

					// does this add anything to: curLocation?.path[1] !== 'args'
					if (!argsRange.contains(position) || linePrefix.search(/^\s*"/m) === -1) return undefined;

					const runFindArgs = findCommands.getKeys().slice(1);       // remove title
					const runSearchArgs = searchCommands.getKeys().slice(1);   // remove title

					// eliminate any options already used
					if (find && (linePrefix.search(/^\s*"$/m) !== -1)) {
						return _filterCompletionsItemsNotUsed(runFindArgs, argsText, position);
					}
					if (search && (linePrefix.search(/^\s*"$/m) !== -1)) {
						return _filterCompletionsItemsNotUsed(runSearchArgs, argsText, position);
					}
					else return undefined;
				}
			},
		'.', '"', '$', '\\', '{'   // trigger intellisense/completion
	);

  context.subscriptions.push(configCompletionProvider);
};


/**
 * Register a CompletionItemProvider for settings.json
 * @param {vscode.ExtensionContext} context
 */
exports.makeSettingsCompletionProvider = async function(context) {
  const settingsCompletionProvider = vscode.languages.registerCompletionItemProvider (
    { pattern: '**/settings.json' },
    {
      provideCompletionItems(document, position) {

        // get all text until the current `position` and check if it reads `  {  "` before the cursor
				const linePrefix = document.lineAt(position).text.substring(0, position.character);

				let find = false;
				let search = false;

				const rootNode = jsonc.parseTree(document.getText());
				const findCommandNode = rootNode.children?.find(child => child.children[0]?.value === "findInCurrentFile");
        // // find-and-transform.searchInFolder, etc. TODO (in a setting?)
				const searchCommandNode = rootNode.children?.find(child => child.children[0]?.value === "runInSearchPanel");
				if (!findCommandNode && !searchCommandNode) return undefined;

				const curLocation = jsonc.getLocation(document.getText(), document.offsetAt(position));
        const command = curLocation.path[0];        // findInCurrentFile
        const subCommand = curLocation.path[1];     //   addClassToElement

				if (command === 'findInCurrentFile') find = true;
        else if (command === 'runInSearchPanel') search = true;
        // if (command.startsWith("find-and-transform")) search = true;
				else return undefined;  // not in our keybindings

				// --------    $ completion for 'filesToInclude/filesToExclude/find/replace' completions   ------------

        const argCompletions = _completeArgs(linePrefix, position, find, search, curLocation.path[2]);
        if (argCompletions) return argCompletions;

				// -----------------------------------------------------------------------
        
        // curLocation.path = [findInCurrentFile, addClassToElement, ''] = good here 
        // or [findInCurrentFile, addClassToElement, replace] =  bad
        if (!curLocation.path[2] === false) return undefined;
        
        let keysText = "";
        let subCommandNode;

				if (curLocation.isAtPropertyKey && subCommand) {
          if (find) subCommandNode = findCommandNode.children[1].children[0].children[1];
          else if (search) subCommandNode = searchCommandNode.children[1].children[0].children[1];
					const keysRange = new vscode.Range(document.positionAt(subCommandNode.offset), document.positionAt(subCommandNode.offset + subCommandNode.length));
					keysText = document.getText(keysRange);
				}

				const runFindArgs = findCommands.getKeys();     // remove title
				const runSearchArgs = searchCommands.getKeys(); // remove title

				// eliminate any options already used
				if (find && (linePrefix.search(/^\s*"$/m) !== -1)) {
					return _filterCompletionsItemsNotUsed(runFindArgs, keysText, position);
				}
				else if (search && (linePrefix.search(/^\s*"$/m) !== -1)) {
					return _filterCompletionsItemsNotUsed(runSearchArgs, keysText, position);
				}
				else return undefined;
      }
    },
    '"', '$'  // trigger intellisense/completion
  );

  context.subscriptions.push(settingsCompletionProvider);
}


/**
 * Parse linePrefix for correct completionItems.
 * 
 * @param {string} linePrefix 
 * @param {vscode.Position} position 
 * @param {boolean} find 
 * @param {boolean} search 
 * @param {jsonc.Segment} arg - which args are we in: find/replace/etc.
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeArgs(linePrefix, position, find, search, arg) {
  
// ----------  filesToInclude/filesToExclude  -----------

  if (arg === 'filesToInclude' || arg === 'filesToExclude') {
    if (linePrefix.endsWith('${'))
      // return _completePathVariables(position, "${");
      return [..._completePathVariables(position, "${"), ..._completeExtensionDefinedVariables(position, "${", search)];
    
    else if (linePrefix.endsWith('$'))
      // return _completePathVariables(position, '$');
      return [..._completePathVariables(position, "$"), ..._completeExtensionDefinedVariables(position, "$", search)];
      
  }

 // ---------------------  find  ------------------------

  if (arg === 'find') {
    if (linePrefix.endsWith('$'))
      // return _completePathVariables(position, '$', search).concat(_completeSnippetVariables(position, '$'));  // other variables?  jsOp?
      return [..._completePathVariables(position, '$'), ..._completeExtensionDefinedVariables(position, "$", search), ..._completeSnippetVariables(position, '$')];
      
    else if (linePrefix.endsWith('${'))
      // return _completePathVariables(position, '${', search).concat(_completeSnippetVariables(position, '${'));
      return [..._completePathVariables(position, '${'), ..._completeExtensionDefinedVariables(position, "$", search), ..._completeSnippetVariables(position, '${')];
      
    
    else if (linePrefix.endsWith('\\\\'))
      return _completeFindCaseTransforms(position, '\\\\');
    
    else if (linePrefix.endsWith('\\'))
      return _completeFindCaseTransforms(position, '\\');
  }
  
// ---------------------  replace  ------------------------
  
  if (arg === 'replace') {
  
    if (find && linePrefix.endsWith('$${')) 
      return _completeReplaceFindVariables(position, '$${');
    
    else if (find && linePrefix.endsWith('$$'))
      return _completeReplaceFindVariables(position, '$$');
      
    // shouldn't include the jsOp $${...}$$
    else if (find && linePrefix.endsWith('${')) 
      return _completeReplaceFindVariables(position, '${');

    else if (find && linePrefix.endsWith('$')) 
      return _completeReplaceFindVariables(position, '$');
      
    else if (linePrefix.endsWith('\\\\'))
      return _completeReplaceCaseTransforms(position, '\\\\');
    
    else if (linePrefix.endsWith('\\'))
      return _completeReplaceCaseTransforms(position, '\\');
      
    // else if (find) {
    //   const regex = /\$\{(?<pathVar>\w*)$/m;
    //   const found = linePrefix.match(regex);
    //   if (found?.groups?.pathVar) 
    //     return _completeReplaceFindVariables(position, '${');
    // } 
    
    else if (search && linePrefix.endsWith('$'))
      // return _completePathVariables(position, '$', search).concat(_completeSnippetVariables(position, '$'));
      return [..._completePathVariables(position, '$'), ..._completeExtensionDefinedVariables(position, "$", search), ..._completeSnippetVariables(position, '$')];
      

		else if (search && linePrefix.endsWith('${'))
      // return _completePathVariables(position, '${', search).concat(_completeSnippetVariables(position, '${'));
      return [..._completePathVariables(position, '${'), ..._completeExtensionDefinedVariables(position, "$", search), ..._completeSnippetVariables(position, '${')];
  }

// -------------------  cursorMoveSelect  ----------------------

  if (arg === 'cursorMoveSelect') {
    if (find && linePrefix.endsWith('$')) 
      return _completeReplaceFindVariables(position, '$');
    
    else if (linePrefix.endsWith('\\\\'))
      return _completeReplaceCaseTransforms(position, '\\\\');
    
    else if (find && linePrefix.endsWith('\\'))
      return _completeReplaceCaseTransforms(position, '\\');
  }

// ---------------------  restrictFind ------------------------
  
  if (find && arg === 'restrictFind') {
    return _completeRestrictFindValues(position);
  }
}

/**
 * Get the keybinding where the cursor is located.
 * 
 * @param {jsonc.Node} rootNode - all parsed confogs in keybindings.json
 * @param {number} offset - of cursor position
 * @returns {jsonc.Node} - the node where the cursor is located
 */
function _findConfig(rootNode, offset)  {

  for (const node of rootNode.children) {
    if (node.offset <= offset && (node.offset + node.length > offset))
      return node;
  }
  return undefined;
}


/**
 * Make CompletionItem arrays, eliminate already used option keys found in the args text
 *
 * @param   {string[]} argArray - options for forward or backward commands
 * @param   {string} argsText - text of the 'args' options:  "args": { .... }
 * @param   {vscode.Position} position - cursor position
 * @returns {Array<vscode.CompletionItem>}
 */
function _filterCompletionsItemsNotUsed(argArray, argsText, position) {

	const defaults = searchCommands.getDefaults();

	const priority = {
    "title": "01",
    
    "preCommands": "011",
    "find": "012",
    "delay": "0121",
    "replace": "013",
    "isRegex": "014",
    "postCommands": "015",

		"isCaseSensitive": "022",
		"matchCase": "023",
		"matchWholeWord": "024",

		"restrictFind": "03",
		"cursorMoveSelect": "031",

		"triggerSearch": "04",
		"triggerReplaceAll": "041",

		"filesToInclude": "05",
		"filesToExclude": "051",
		"useExcludeSettingsAndIgnoreFiles": "052",
		"onlyOpenEditors": "053",

		"preserveCase": "07"
  };
  
	const description = {
		"title": "This will appear in the Command Palette as `Find-and-Transform:<title>`. Can include spaces.",

    "preCommands": "A single command, as a string, or an array of commands to run before any find occurs.",
    "find": "Query to find or search.  Can be a regexp or plain text.",
    "delay": "Pause, in millisceonds, between searches when you have defined an array of searches.  Usually needed to allow the prior search to complete and populate the search results if you want to use those results files in a subsequent search with: .",
		"replace": "Replacement text.  Can include variables like `${relativeFile}`. Replacements can include conditionals like `${n:+if add text}` or case modifiers such as `\\\\U$n` or `${2:/upcase}`.",
    "isRegex": "Is the find query a regexp.",
    "postCommands": "A single command, as a string, or an array of commands to run after any replace occurs.",
    
		"isCaseSensitive": "Do you want the search to be case-senstive.",
		"matchCase": "Match only where the case is the same as the find query.",
		"matchWholeWord": "Match the find query with word boundaries.  As in `\\b<query>\\b`.",

		"restrictFind": "Find in the document, selection(s), line, one time on the current line or the next match after the cursor.",
		"cursorMoveSelect": "Any text to find and select after performing all find/replaces.  This text can be part of the replacement text or elsewhere in the document, line or selection.",

		"triggerSearch": "Start the search automatically.",
		"triggerReplaceAll": "Like hitting the `Replace All` button.  This action must be confirmed by dialog before any replacements happen. And `triggerSearch` will be automatically triggered first.",

		"filesToInclude": "Search in these files or folders only.  Can be a comma-separated list.",
		"filesToExclude": "Do not serach in these files or folder.  Can be a comma-separated list.",
		"useExcludeSettingsAndIgnoreFiles": "",
		"onlyOpenEditors": "Search in the currently opened editors only.",

		"preserveCase": ""
	};

	/** @type { Array<vscode.CompletionItem> } */
	const completionArray = [];

	// account for commented options (in keybindings and settings)
	argArray.forEach(option => {
		if (argsText.search(new RegExp(`^[ \t]*"${option}"`, "gm")) === -1)
			completionArray.push(_makeCompletionItem(option, new vscode.Range(position, position), defaults[`${ option }`], priority[`${ option }`], description[`${ option }`]));
	});

	return completionArray;
}

/**
 * Make completion items for 'filesToInclude/filesToExclude/find/replace' values starting with a '$' sign
 * 
 * @param   {vscode.Position} position
 * @param   {string} trigger - triggered by '$' so include its range
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeExtensionDefinedVariables(position, trigger, search) {

  // triggered by 1 '$', so include it to complete w/o two '$${file}'
  let replaceRange;
  let addResultFiles = undefined;
  
  const text = `
  
	Three possible forms:
    
    \${getTextLines:n}  get line n text
    \${getTextLines:n-p} text lines n through p
    \${getTextLines:n,o,p,q} text from line n, character o 
                            through line p, character q

Replace ***n, o, p, q*** with some number 0-x.

`;

	if (trigger) replaceRange = new vscode.Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new vscode.Range(position, position);

	if (search)
		addResultFiles = _makeCompletionItem("${resultsFiles}", replaceRange, "", "052", `A comma-separated list of the files in the current search results.`);

	const completionItems =  [
		_makeCompletionItem("${getDocumentText}", replaceRange, "", "053", `The complete text of the current document.`),
    _makeCompletionItem("${getTextLines:n}", replaceRange, "", "0541", `Line and character numbers are 0-based. ${ text }`),
    _makeCompletionItem("${getTextLines:n-p}", replaceRange, "", "0542", `Line and character numbers are 0-based. ${ text }`),
    _makeCompletionItem("${getTextLines:n,o,p,q}", replaceRange, "", "0543", `Line and character numbers are 0-based. ${ text }`),
	];

	if (search) return completionItems.concat(addResultFiles);
	else return completionItems;
}

/**
 * Make completion items for 'filesToInclude/filesToExclude/find/replace' values starting with a '$' sign
 * 
 * @param   {vscode.Position} position
 * @param   {string} trigger - triggered by '$' so include its range
 * @returns {Array<vscode.CompletionItem>}
 */
function _completePathVariables(position, trigger) {

	// triggered by 1 '$', so include it to complete w/o two '$${file}'
	let replaceRange;
	// let addResultFiles = undefined;

	if (trigger) replaceRange = new vscode.Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new vscode.Range(position, position);

	// if (search)
	// 	addResultFiles = _makeCompletionItem("${resultsFiles}", replaceRange, "", "052", "A comma-separated list of the files in the current search results.");

	const completionItems =  [
		_makeCompletionItem("${file}", replaceRange, "", "01", "The full path (`/home/UserName/myProject/folder/test.txt`) of the current editor."),
		_makeCompletionItem("${relativeFile}", replaceRange, "", "011", "The path of the current editor relative to the workspaceFolder (`folder/file.ext`)."),
		_makeCompletionItem("${fileBasename}", replaceRange, "", "012", "The basename (`file.ext`) of the current editor."),
		_makeCompletionItem("${fileBasenameNoExtension}", replaceRange, "", "013", "The basename  (`file`) of the current editor without its extension."),
		_makeCompletionItem("${fileExtname}", replaceRange, "", "014", "The extension (`.ext`) of the current editor."),

		_makeCompletionItem("${fileDirname}", replaceRange, "", "02", "The full path of the current editor's parent directory."),
		_makeCompletionItem("${relativeFileDirname}", replaceRange, "", "021", "The path of the current editor's parent directory relative to the workspaceFolder."),

		_makeCompletionItem("${fileWorkspaceFolder}", replaceRange, "", "03", "The full path of the current editor's workspaceFolder."),
		_makeCompletionItem("${workspaceFolder}", replaceRange, "", "031", "The full path (`/home/UserName/myProject`) to the currently opened workspaceFolder."),
		_makeCompletionItem("${workspaceFolderBasename}", replaceRange, "", "032", "The name (`myProject`) of the workspaceFolder."),

		_makeCompletionItem("${selectedText}", replaceRange, "", "04", "The **first** selection in the current editor."),
		_makeCompletionItem("${CLIPBOARD}", replaceRange, "", "041", "The clipboard contents."),
    _makeCompletionItem("${pathSeparator}", replaceRange, "", "042", "`/` on linux/macOS, `\\` on Windows."),
    _makeCompletionItem("${lineIndex}", replaceRange, "", "043", "The line number of the **first** cursor in the current editor, lines start at 0."),
		_makeCompletionItem("${lineNumber}", replaceRange, "", "044", "The line number of the **first** cursor in the current editor, lines start at 1."),

    _makeCompletionItem("${matchIndex}", replaceRange, "", "05", "The 0-based find match index. Is this the first, second, etc. match?"),
    _makeCompletionItem("${matchNumber}", replaceRange, "", "051", "The 1-based find match index. Is this the first, second, etc. match?"),
	];

	// if (search) return completionItems.concat(addResultFiles);
	return completionItems;
}

/**
 * Make completion items for 'snippet' variables starting with a '$' sign
 * 
 * @param   {vscode.Position} position
 * @param   {string} trigger - triggered by '$' so include its range
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeSnippetVariables(position, trigger) {

	// triggered by 1 '$', so include it to complete w/o two '$${file}'
	let replaceRange;
	if (trigger) replaceRange = new vscode.Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new vscode.Range(position, position);

  return [
		_makeCompletionItem("${TM_CURRENT_LINE}", replaceRange, "", "0601", "The contents of the current line"),
		_makeCompletionItem("${TM_CURRENT_WORD}", replaceRange, "", "0602", "The contents of the word at the cursor or the empty string."),
    
    _makeCompletionItem("${CURRENT_YEAR}", replaceRange, "", "0613", "The current year."),
		_makeCompletionItem("${CURRENT_YEAR_SHORT}", replaceRange, "", "0614", "The current year's last two digits."),
		_makeCompletionItem("${CURRENT_MONTH}", replaceRange, "", "0615", "The month as two digits (example '02')."),
    _makeCompletionItem("${CURRENT_MONTH_NAME}", replaceRange, "", "0616", "The full name of the month (example 'July')."),
    _makeCompletionItem("${CURRENT_MONTH_NAME_SHORT}", replaceRange, "", "0617", "The short name of the month (example 'Jul')."),
    _makeCompletionItem("${CURRENT_DATE}", replaceRange, "", "0618", "The day of the month as two digits (example '08')."),
    _makeCompletionItem("${CURRENT_DAY_NAME}", replaceRange, "", "0619", "The name of day (example 'Monday')."),
    _makeCompletionItem("${CURRENT_DAY_NAME_SHORT}", replaceRange, "", "0620", "The short name of the day (example 'Mon')."),
    _makeCompletionItem("${CURRENT_HOUR}", replaceRange, "", "0621", "The current hour in 24-hour clock format."),
    _makeCompletionItem("${CURRENT_MINUTE}", replaceRange, "", "0621", "The current minute as two digits."),
    _makeCompletionItem("${CURRENT_SECOND}", replaceRange, "", "0622", "The current second as two digits."),
    _makeCompletionItem("${CURRENT_SECONDS_UNIX}", replaceRange, "", "0623", "The number of seconds since the Unix epoch."),
 
    _makeCompletionItem("${RANDOM}", replaceRange, "", "0624", "Six random Base-10 digits."),
    _makeCompletionItem("${RANDOM_HEX}", replaceRange, "", "0625", "Six random Base-16 digits."),
    // _makeCompletionItem("${UUID}", replaceRange, "", "0626", "A Version 4 UUID."),
 
    _makeCompletionItem("${BLOCK_COMMENT_START}", replaceRange, "", "0627", "Example output: in PHP `/*` or in HTML `<!--`."),
    _makeCompletionItem("${BLOCK_COMMENT_END}", replaceRange, "", "0628", "Example output: in PHP `*/` or in HTML `-->`."),
    _makeCompletionItem("${LINE_COMMENT}", replaceRange, "", "0629", "Example output: in PHP `//`."),
  ];
}

/**
 * Make completion items for 'replace' values starting with a '\' sign in a 'findInCurrentFile' command
 * 
 * @param   {vscode.Position} position
 * @param   {string} trigger - triggered by '$' or '$$' or '$${' so include their ranges
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeReplaceJSOperation(position, trigger) {

	// triggered by '$' or '$$' or '$${' so use their ranges
	let replaceRange;
	if (trigger) replaceRange = new vscode.Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new vscode.Range(position, position);

	const text = `
		
Replace ***operation*** with some code.`;

	return [
		_makeCompletionItem("$${operation}$$", replaceRange, "", "001", `Create a javascript operation.${ text }`),
	];
}

/**
 * Make completion items for 'replace' values starting with a '$' sign in a 'findInCurrentFile' command
 * 
 * @param   {vscode.Position} position
 * @param   {string} trigger - triggered by '$' so include its range
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeReplaceFindVariables(position, trigger) {

	// triggered by 1 '$' or '$${' or '${'

  // const pathVariableArray = _completePathVariables(position, trigger);
  // // search? arg TODO
  // const extensionDefinedArray = _completeExtensionDefinedVariables(position, trigger);
  // const conditionalsArray = _completeFindConditionalTransforms(position, trigger);
  // const snippetVariableArray = _completeSnippetVariables(position, trigger);  
  // const jsOperation = _completeReplaceJSOperation(position, trigger);

	// return [
  //   ...pathVariableArray,  // or just ..._completePathVariables(position, trigger); ?
  //   ...extensionDefinedArray,
  //   ...conditionalsArray,
  //   ...jsOperation,
  //   ...snippetVariableArray
  // ];
  	return [
    ..._completePathVariables(position, trigger),
    ..._completeExtensionDefinedVariables(position, trigger),
    ..._completeFindConditionalTransforms(position, trigger),
    ..._completeReplaceJSOperation(position, trigger),
    ..._completeSnippetVariables(position, trigger)
  ];
}

/**
 * Make completion items for 'find' values starting with a '\' sign in a 'findInCurrentFile' command
 * 
 * @param   {vscode.Position} position
 * @param   {string} trigger - triggered by '\' or '\\' so include its range
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeFindConditionalTransforms(position, trigger) {

  // triggered by 1 or 2 '\', so include it to complete w/o three '\\\U'
  let replaceRange;
  if (trigger) replaceRange = new vscode.Range(position.line, position.character - trigger.length, position.line, position.character);
  else replaceRange = new vscode.Range(position, position);
  
  	const text = `
		
Replace ***n*** with some number 0-99.

`;

  return [
   	_makeCompletionItem("${n:/upcase}", replaceRange, "", "080", `Transform to uppercase the ***nth*** capture group.${text}.
Example: "find": "\${1:/upcase}"`),
    
    _makeCompletionItem("${n:/downcase}", replaceRange, "", "081", `Transform to lowercase the ***nth*** capture group.${text}
Example: "find": "\${2:/downcase}"`),
    
    _makeCompletionItem("${n:/capitalize}", replaceRange, "", "082", `Capitalize the ***nth*** capture group.${text}
Example: "find": "\${1:/capitalize}"`),
    
    _makeCompletionItem("${n:/pascalcase}", replaceRange, "", "083", `Transform to pascalcase the ***nth*** capture group.${text}
Example: "find": "\${2:/pascalcase}"`),
    
    _makeCompletionItem("${n:/camelcase}", replaceRange, "", "084", `Transform to camelcase the ***nth*** capture group.${text}
Example: "find": "\${1:/camelcase}"`),
    
        
    _makeCompletionItem("${n:+ if add text}", replaceRange, "", "090", `Conditional replacement: if capture group ***nth***, add test.${text}
Example: "find": "\${2:+ if add text}"`),
            
    _makeCompletionItem("${n:- else add text}", replaceRange, "", "091", `Conditional replacement:  if no capture group ***nth***, add test.${text}
Example: "find": "\${1:- else add text}"`),
                
    _makeCompletionItem("${n: else add text}", replaceRange, "", "092", `Conditional replacement:  if no capture group ***nth***, add test.${text}
Example: "find": "\${2: else add text}"`),
                    
    _makeCompletionItem("${n:? if add text: else add this text}", replaceRange, "", "093", `Conditional replacement: if capture group ***nth***, add some text, else add other text.${text}
Example: "find": "\${1:? if add text: else add this text}"`),
  ];
}

/**
 * Make completion items for 'restrictFind' values with priority
 * 
 * @param   {vscode.Position} position
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeRestrictFindValues(position) {

	return [
		_makeCompletionItem("document", new vscode.Range(position, position), "document", "01", "Find and replace in the current editor."),
		_makeCompletionItem("selections", new vscode.Range(position, position), "document", "02", "Find and replace in selections only."),

		_makeCompletionItem("once", new vscode.Range(position, position), "document", "03", "Find the first match on the current line **after the cursor** and replace, if any replacement specified."),
		_makeCompletionItem("line", new vscode.Range(position, position), "document", "04", "Find and replace all matches on the current line before and after the cursor."),

		_makeCompletionItem("nextSelect", new vscode.Range(position, position), "document", "05", "Select the next match after replacing it (if you specify a replacement)."),
		_makeCompletionItem("nextMoveCursor", new vscode.Range(position, position), "document", "06", "Move the cursor to after the next match and replace it, if any, but do not select it."),
		_makeCompletionItem("nextDontMoveCursor", new vscode.Range(position, position), "document", "07", "Replace the next match but leave cursor at original position.")
	];
}

/**
 * Make completion items for 'find' values starting with a '\' sign in a 'findInCurrentFile' command
 * 
 * @param   {vscode.Position} position
 * @param   {string} trigger - triggered by '\' or '\\' so include its range
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeFindCaseTransforms(position, trigger) {

  // triggered by 1 or 2 '\', so include it to complete w/o three '\\\U'
  let replaceRange;
  if (trigger) replaceRange = new vscode.Range(position.line, position.character - trigger.length, position.line, position.character);
  else replaceRange = new vscode.Range(position, position);

  return [
    _makeCompletionItem("\\\\U", replaceRange, "", "010", `Find the uppercased version of the following variable.

Example: "find": "\\\\\\U\${relativeFile}"`),
    
    _makeCompletionItem("\\\\u", replaceRange, "", "011", `Find the the following variable with its first letter uppercased.

Example: "find": "\\\\\\u\${TM_CURRENT_WORD}"`),
    
    _makeCompletionItem("\\\\L", replaceRange, "", "012", `Find the lowercased version of the following variable.

Example: "find": "\\\\\\L\${relativeFile}"`),
    
    _makeCompletionItem("\\\\l", replaceRange, "", "013", `Find the the following variable with its first letter lowercased.

Example: "find": "\\\\\\l\${CURRENT_MONTH_NAME}"`)
  ];
}


/**
 * Make completion items for 'replace' values starting with a '\' sign in a 'findInCurrentFile' command
 * 
 * @param   {vscode.Position} position
 * @param   {string} trigger - triggered by '\' or '\\' so include its range
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeReplaceCaseTransforms(position, trigger) {

	// triggered by 1 or 2 '\', so include it to complete w/o three '\\\U$n'
	let replaceRange;
	if (trigger) replaceRange = new vscode.Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new vscode.Range(position, position);

	const text = `
		
Replace ***n*** with some number 0-99.`;

	return [
		_makeCompletionItem("\\\\U$n", replaceRange, "", "010", `Transform to uppercase the entire ***nth*** capture group.${ text }`),
		_makeCompletionItem("\\\\u$n", replaceRange, "", "011", `Capitalize the first letter of the ***nth*** capture group.${ text }`),
		_makeCompletionItem("\\\\L$n", replaceRange, "", "012", `Transform to lowercase the entire ***nth*** capture group.${ text }`),
    _makeCompletionItem("\\\\l$n", replaceRange, "", "013", `Transform to lowercase the first letter of the ***nth*** capture group.${ text }`),
    
    _makeCompletionItem("\\\\U", replaceRange, "", "014", `Find the uppercased version of the following variable.

Example: "find": "\\\\\\U\${relativeFile}"`),

    _makeCompletionItem("\\\\u", replaceRange, "", "015", `Find the the following variable with its first letter uppercased.

Example: "find": "\\\\\\u\${CURRENT_MONTH_NAME}"`),

    _makeCompletionItem("\\\\L", replaceRange, "", "016", `Find the lowercased version of the following variable.

Example: "find": "\\\\\\L\${relativeFile}"`),

    _makeCompletionItem("\\\\l", replaceRange, "", "017", `Find the the following variable with its first letter lowercased.

Example: "find": "\\\\\\l\$TM_CURRENT_LINE"`)
	];
}


/**
 * From a string input make a CompletionItemKind.Text
 *
 * @param   {string} key
 * @param   {vscode.Range} replaceRange
 * @param   {string|boolean} defaultValue - default value for this option
 * @param   {string} sortText - sort order of item in completions
 * @param   {string} documentation - markdown description of each item
 * @returns {vscode.CompletionItem} - CompletionItemKind.Text
 */
function _makeCompletionItem(key, replaceRange, defaultValue, sortText, documentation) {

	const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Text);
	item.range = replaceRange;
  if (defaultValue) item.detail = `default: ${ defaultValue }`;

  if (sortText) item.sortText = sortText;
  
  const delayText = `"filesToInclude": "\${resultsFiles}"`;
  
  const preCommandText = `"preCommands": "cursorHome"
"preCommands": ["cursorHome", "cursorEndSelect"]`;
  
  const postCommandText = `"postCommands": "editor.action.selectFromAnchorToCursor"
"postCommands": ["cursorHome", "editor.action.clipboardCopyAction"]`;

  if (documentation) {
    if (key === 'delay')
      item.documentation = new vscode.MarkdownString(documentation).appendCodeblock(delayText, 'jsonc');
    else if (key === 'preCommands')
      item.documentation = new vscode.MarkdownString(documentation).appendCodeblock(preCommandText, 'jsonc');
    else if (key === 'postCommands')
      item.documentation = new vscode.MarkdownString(documentation).appendCodeblock(postCommandText, 'jsonc');
    else item.documentation = new vscode.MarkdownString(documentation);
  }
  
	if (key.substring(0, 3) === "${n") {
		let newCommand = {};
		// call command 'selectDigitInCompletion' defined in extension.js
		newCommand.command = "find-and-transform.selectDigitInCompletion";
		newCommand.title = "Select the digit 'n' in completionItem";
		newCommand.arguments = [key, replaceRange];
		item.command = newCommand;
	}
	else if (key.search(/^\\\\[UuLl]\$n/m) !== -1) {
		let newCommand = {};
		newCommand.command = "find-and-transform.selectDigitInCompletion";
		newCommand.title = "Select the digit 'n' in completionItem";
		newCommand.arguments = [key, replaceRange];
		item.command = newCommand;
  }
  else if (key.search(/^\$\{getTextLines:n/m) !== -1) {
		let newCommand = {};
		newCommand.command = "find-and-transform.selectDigitInCompletion";
		newCommand.title = "Select the digit 'n' in completionItem";
		newCommand.arguments = [key, replaceRange];
		item.command = newCommand;
  }
  else if (key.substring(0, 12) === "$${operation") {
		let newCommand = {};
		newCommand.command = "find-and-transform.selectOperationInCompletion";
		newCommand.title = "Select the 'operation' in completionItem";
		newCommand.arguments = [key, replaceRange];
		item.command = newCommand;
	}

	return item;
}