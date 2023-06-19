const { commands, languages, extensions, window, Uri, Range, Position, CompletionItem, CompletionItemKind, CompletionTriggerKind, MarkdownString, SnippetString } = require('vscode');
const jsonc = require("jsonc-parser");

const searchCommands = require('./search');
const findCommands = require('./transform');


/**
 * Register a CompletionItemProvider for keybindings.json
 * @param {import("vscode").ExtensionContext} context
 */
exports.makeKeybindingsCompletionProvider = async function(context) {
    const configCompletionProvider = languages.registerCompletionItemProvider (
      { pattern: '**/keybindings.json' },
      {
        provideCompletionItems(document, position, token, completionContext) {

					const linePrefix = document.lineAt(position).text.substring(0, position.character);
					let find = false;
          let search = false;
      
					// ------------------------------------    command completion start  ------------------------------------
					if (linePrefix.search(/^\s*"command":\s*"(findInCurrentFile)\./) !== -1) find = true;
          if (linePrefix.search(/^\s*"command":\s*"(runInSearchPanel)\./) !== -1) search = true;
          
          const thisExtension = extensions.getExtension('ArturoDent.find-and-transform');
          const packageCommands = thisExtension.packageJSON.contributes.commands;

					if (find || search) {

            if (find) {
              return packageCommands.filter(pcommand => pcommand.command.startsWith("findInCurrentFile"))
                .map(pcommand => _makeCommandCompletionItem(pcommand.command.replace(/^.*\./, ""), new Range(position, position), "A 'findInCurrentFile' command from your settings."));
            }
            else if (search) {
              return packageCommands.filter(pcommand => pcommand.command.startsWith("runInSearchPanel"))
                .map(pcommand => _makeCommandCompletionItem(pcommand.command.replace(/^.*\./, ""), new Range(position, position), "A 'runInSearchPanel' command from your settings."));
            }
					}
					// ------------------------------------    command completion end   -------------------------------------------------

          
					// ------------------------------------    args completion start   -------------------------------------------------
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
                   
					// ---------  $ for 'filesToInclude/filesToExclude/find/replace/restrictFind/reveal/runWhen' completions  ------

          // curLocation.path = [26, 'args', 'replace', 1], isAtPropertyKey = false
          
          // prevents completion at "reveal": "last"|,
          if (curLocation?.previousNode && linePrefix.endsWith(`"${ curLocation.previousNode.value }"`)) return undefined;
          
          const regex = new RegExp("isRegex|matchCase|matchWholeWord");
          
          if (curLocation.path[2] && regex.test(curLocation.path[2].toString())) {
            
            if (linePrefix.endsWith(`false`) || linePrefix.endsWith(`true`)) {
            
              const trueItem = new CompletionItem("true", CompletionItemKind.Value);
              trueItem.range = new Range(position, position);
            
              const falseItem = new CompletionItem("false", CompletionItemKind.Value);
              falseItem.range = new Range(position, position);
            
              return [trueItem, falseItem];
            }
          }
          
          if (curLocation.path[2] && !curLocation.isAtPropertyKey) {
            const argCompletions = _completeArgs(linePrefix, position, find, search, curLocation);
            if (argCompletions) return argCompletions;
          }
          
					// ------------------------------------    duplicate args removal start   ------------------------------------

          // curLocation.path = [26, 'args', ''] = good  or [26, 'args', 'replace', 1] = bad here
          if ((curLocation?.path[2] !== '' && !curLocation?.path[2]) || curLocation?.path[1] !== 'args') return undefined;

          const argsNode = thisConfig.children.filter(entry => {
            return entry.children[0].value === "args";
          })

          const argsStartingIndex = argsNode[0].offset;
          const argsLength = argsStartingIndex + argsNode[0].length;

          const argsRange = new Range(document.positionAt(argsStartingIndex), document.positionAt(argsLength));
					if (!argsRange.contains(position)) return undefined;
          
          const argsText = document.getText(argsRange);
          const runFindArgs = findCommands.getKeys().slice(1);       // remove title
          const runSearchArgs = searchCommands.getKeys().slice(1);   // remove title
          
          const textLine = document.lineAt(position);
          let replaceRange = textLine.range;
          const startPos = new Position(textLine.lineNumber, textLine.firstNonWhitespaceCharacterIndex);
          const invoked = (completionContext.triggerKind == CompletionTriggerKind.Invoke) ? true : false;
          
          if ((completionContext.triggerKind == CompletionTriggerKind.Invoke) && textLine.isEmptyOrWhitespace) {
            // invoke on an empty line
            replaceRange = replaceRange.with(startPos);
          }
          else if ((completionContext.triggerKind == CompletionTriggerKind.Invoke) && !textLine.isEmptyOrWhitespace) {
            // '"reveal": "first"  select reveal and invoke
            const lineRange = window.activeTextEditor.document.lineAt(position.line).range;
            const wordRange = window.activeTextEditor.document.getWordRangeAtPosition(position);
            replaceRange = new Range(wordRange.start, lineRange.end);  // this does replace the whole thing but extra " at front
            // and can't invoke when selecting entire key
          }
          else {
            replaceRange = new Range(position, position);
          }
            
          if (find) {
            return _filterCompletionsItemsNotUsed(context, runFindArgs, argsText, replaceRange, position, invoked);
          }
          else if (search) {
            return _filterCompletionsItemsNotUsed(context, runSearchArgs, argsText, replaceRange, position, invoked);
          }
					return undefined;
				}
			},
		'.', '"', '$', '\\', '{'   // trigger intellisense/completion
	);

  context.subscriptions.push(configCompletionProvider);
};


/**
 * Register a CompletionItemProvider for settings.json
 * @param {import("vscode").ExtensionContext} context
 */
exports.makeSettingsCompletionProvider = async function(context) {
  const settingsCompletionProvider = languages.registerCompletionItemProvider (
    { pattern: '**/settings.json' },
    {
      provideCompletionItems(document, position, token, completionContext) {

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

        // prevents completion at "reveal": "last"|,
        if (linePrefix.endsWith(`"${ curLocation.previousNode?.value }"`)) return undefined;
        
        const regex = new RegExp("isRegex|matchCase|matchWholeWord");
        
        if (curLocation.path[2] && regex.test(curLocation.path[2].toString())) {
            
          if (linePrefix.endsWith(`false`) || linePrefix.endsWith(`true`)) {
          
            const trueItem = new CompletionItem("true", CompletionItemKind.Value);
            trueItem.range = new Range(position, position);
          
            const falseItem = new CompletionItem("false", CompletionItemKind.Value);
            falseItem.range = new Range(position, position);
          
            return [trueItem, falseItem];
          }
        }
        
        if (curLocation.path[2] && !curLocation.isAtPropertyKey && linePrefix.search(/^\s*$/m) === -1) {
          const argCompletions = _completeArgs(linePrefix, position, find, search, curLocation);
          if (argCompletions) return argCompletions;
        }

				// -----------------------------------------------------------------------------------------------------------
        
        // curLocation.path = [findInCurrentFile, addClassToElement, ''] = good here 
        // or [findInCurrentFile, addClassToElement, replace] =  bad
        if ((curLocation?.path[2] !== '' && !curLocation?.path[2]) || !curLocation?.path[1]) return undefined;
        
        let keysText = "";
        let subCommandNode;

				if ((curLocation.isAtPropertyKey || linePrefix.search(/^\s*"?$/m) !== -1) && subCommand) {
          if (find) subCommandNode = findCommandNode.children[1].children[0].children[1];
          else if (search) subCommandNode = searchCommandNode.children[1].children[0].children[1];
					const keysRange = new Range(document.positionAt(subCommandNode.offset), document.positionAt(subCommandNode.offset + subCommandNode.length));
					keysText = document.getText(keysRange);
				}

				// const runFindArgs   = findCommands.getKeys().slice(0, -1);     // remove clipText from end
        // const runSearchArgs = searchCommands.getKeys().slice(0, -1);   // remove clipText from end
        
        const runFindArgs   = findCommands.getKeys();
        const runSearchArgs = searchCommands.getKeys();

        let replaceRange = new Range(position, position);
        const textLine = document.lineAt(position);
        
        if ((completionContext.triggerKind == CompletionTriggerKind.Invoke) && !textLine.isEmptyOrWhitespace) {
        
          const lineRange = window.activeTextEditor.document.lineAt(position.line).range;
          const wordRange = window.activeTextEditor.document.getWordRangeAtPosition(position);
          replaceRange = new Range(wordRange.start, lineRange.end);
        }
        
        let keyArgs = runFindArgs;
        if (search) keyArgs = runSearchArgs;
        
				// eliminate any options already used
        if (linePrefix.search(/^\s*$/m) !== -1)
          return _filterCompletionsItemsNotUsed(context, keyArgs, keysText, replaceRange, position, true);
        
        else if (linePrefix.search(/^\s*"$/m) !== -1)
          return _filterCompletionsItemsNotUsed(context, keyArgs, keysText, replaceRange, position, false);
        
        else if (curLocation.isAtPropertyKey && !curLocation.previousNode) 
					return _filterCompletionsItemsNotUsed(context, keyArgs, keysText, replaceRange, position, true);
          
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
 * @param   {string} linePrefix 
 * @param   {import("vscode").Position} position 
 * @param   {boolean} find 
 * @param   {boolean} search 
 * @param   {jsonc.Location} curLocation
 * @returns {Array<CompletionItem>}
 */
function _completeArgs(linePrefix, position, find, search, curLocation) {
  
  const arg = curLocation.path[2];
  
// ----------  filesToInclude/filesToExclude  -----------
  if (arg === 'filesToInclude' || arg === 'filesToExclude') {
    if (linePrefix.endsWith('${'))
      return [..._completePathVariables(position, "${"), ..._completeExtensionDefinedVariables(position, "${", search)];
    
    else if (linePrefix.endsWith('$'))
      return [..._completePathVariables(position, "$"), ..._completeExtensionDefinedVariables(position, "$", search)];
  }

 // ---------------------  find  ------------------------
  else if (arg === 'find') {
    if (linePrefix.endsWith('$'))
      return [..._completePathVariables(position, '$'), ..._completeExtensionDefinedVariables(position, "$", search), ..._completeSnippetVariables(position, '$')];
      
    else if (linePrefix.endsWith('${'))
      return [..._completePathVariables(position, '${'), ..._completeExtensionDefinedVariables(position, "${", search), ..._completeSnippetVariables(position, '${')];
      
    
    else if (linePrefix.endsWith('\\\\'))
      return _completeFindCaseTransforms(position, '\\\\');
    
    else if (linePrefix.endsWith('\\'))
      return _completeFindCaseTransforms(position, '\\');
  }
  
// ---------------------  replace  ------------------------
  // else if (arg === 'replace') {
  else if (arg === 'replace') {
    
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
    
    else if (search && linePrefix.endsWith('$'))
      return [..._completePathVariables(position, '$'), ..._completeExtensionDefinedVariables(position, "$", search), ..._completeSnippetVariables(position, '$')];
      
		else if (search && linePrefix.endsWith('${'))
      return [..._completePathVariables(position, '${'), ..._completeExtensionDefinedVariables(position, "${", search), ..._completeSnippetVariables(position, '${')];
  }

// -------------------  cursorMoveSelect  ----------------------
  else if (arg === 'cursorMoveSelect') {
    if (find && linePrefix.endsWith('$')) 
      return _completeReplaceFindVariables(position, '$');
    
    else if (linePrefix.endsWith('\\\\'))
      return _completeReplaceCaseTransforms(position, '\\\\');
    
    else if (find && linePrefix.endsWith('\\'))
      return _completeReplaceCaseTransforms(position, '\\');
  }

  // ---------------------  restrictFind ------------------------
  else if (find && arg === 'restrictFind' && !curLocation.isAtPropertyKey) {
    return _completeRestrictFindValues(position);
  }
  // ---------------------    run    ------------------------
  else if (find && arg === 'run') {
    // return _completeReplaceJSOperation(position, '$');
    
    if (linePrefix.endsWith('$'))
      return _completeReplaceFindVariables(position, "$");
    
    else if (linePrefix.endsWith('${'))
      return _completeReplaceFindVariables(position, "${");
  }
  
  // -------------------    runWhen    ------------------------
  else if (find && arg === 'runWhen') {
    return _completeRunWhen(position);
  }
    
  // ---------------    runPostCommands    --------------------
  else if (find && arg === 'runPostCommands') {
    return _completeRunPostCommands(position);
  }
  
  // ---------------------  reveal ----------------------------
  // add line prefix info here: "    \"reveal\": \"next"
  else if (find && arg === 'reveal') {
    return _completeRevealValues(position);
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
 * @param   {import("vscode").ExtensionContext} context
 * @param   {string[]} argArray - 
 * @param   {string} argsText - text of the 'args' options:  "args": { .... }
 * @param   {import("vscode").Position} position - cursor position
 * @param   {Boolean} [invoked]
 * @returns {Array<CompletionItem>}
 */
function _filterCompletionsItemsNotUsed(context, argArray, argsText, replaceRange, position, invoked) {

  const searchDefaults = searchCommands.getDefaults();
  const findDefaults = findCommands.getDefaults();  
  const defaults = Object.assign({}, findDefaults, searchDefaults);
  
	const priority = {
    "title": "01",
    "description": '0101',
    
    "preCommands": "011",
    "find": "012",
    "ignoreWhiteSpace": "0121",
    "delay": "0122",
    "run": "0123",
    "runWhen": "0124",
    "replace": "013",
    "isRegex": "014",
    "postCommands": "015",
    "runPostCommands": "0151",

		"isCaseSensitive": "022",
		"matchCase": "023",
		"matchWholeWord": "024",

    "restrictFind": "03",
    "reveal": "031",
		"cursorMoveSelect": "032",

		"triggerSearch": "04",
		"triggerReplaceAll": "041",

		"filesToInclude": "05",
		"filesToExclude": "051",
		"useExcludeSettingsAndIgnoreFiles": "052",
		"onlyOpenEditors": "053",

		"preserveCase": "07"
  };
  
	const documentation = {
		"title": "This will appear in the Command Palette as `Find-and-Transform:<title>`. Can include spaces.",
    "description": "Any string describing what this keybinding does.",
    
    "preCommands": "A single command, as a string, or an array of commands to run before any find occurs.",
    "find": "Query to find or search.  Can be a regexp, plain text or `${getFindInput}`.",
    // "ignoreWhiteSpace": "Any whitespace in the `find` will be treated as if it is `\\s*`. And will match across lines without the need to specify a `\\n` in the find regex. See [using the ignoreWhiteSpace option](Readme.md#using-the-ignorewhitespace-argument)",
    "ignoreWhiteSpace": "Any whitespace in the `find` will be treated as if it is `\\s*`. And will match across lines without the need to specify a `\\n` in the find regex.",
    "delay": "Pause, in millisceonds, between searches when you have defined an array of searches.  Usually needed to allow the prior search to complete and populate the search results if you want to use those results files in a subsequent search with: .",
    "run": "Run a javascript operation after the find (and before any replace).",
    "runWhen": "When to trigger the `run` operation:",
    
    "replace": "Replacement text.  Can include variables like `${relativeFile}`. Replacements can include conditionals like `${n:+if add text}` or case modifiers such as `\\\\U$n` or `${2:/upcase}`.",
    "isRegex": "Is the find query a regexp.",
    "postCommands": "A single command, as a string, or an array of commands to run after any replace occurs.",
    "runPostCommands": "When to trigger the `postCommands`:",
    
		"isCaseSensitive": "Do you want the search to be case-senstive.",
		"matchCase": "Match only where the case is the same as the find query.",
		"matchWholeWord": "Match the find query with word boundaries.  As in `\\b<query>\\b`.",

    "restrictFind": "Find in the document, selection(s), line, one time on the current line or the next match after the cursor.",
    "reveal": "Scroll the editor viewport to show the first, next from cursor, or last match in the editor",
		"cursorMoveSelect": "Any text to find and select after performing all find/replaces.  This text can be part of the replacement text or elsewhere in the document, line or selection.",

		"triggerSearch": "Start the search automatically.",
		"triggerReplaceAll": "Like hitting the `Replace All` button.  This action must be confirmed by dialog before any replacements happen. And `triggerSearch` will be automatically triggered first.",

		"filesToInclude": "Search in these files or folders only.  Can be a comma-separated list.",
		"filesToExclude": "Do not search in these files or folders.  Can be a comma-separated list.",
		"useExcludeSettingsAndIgnoreFiles": "",
		"onlyOpenEditors": "Search in the currently opened editors only.",

		"preserveCase": ""
	};

  return argArray
    .filter(option => argsText.search(new RegExp(`^[ \t]*"${ option }"`, "gm")) === -1)
    .map(option => {
      return _makeKeyCompletionItem(option, replaceRange, defaults[`${ option }`], priority[`${ option }`], documentation[`${ option }`], invoked);
  })
}

/**
 * Make completion items for 'filesToInclude/filesToExclude/find/replace' values starting with a '$' sign
 * 
 * @param   {import("vscode").Position} position
 * @param   {string} trigger - triggered by '$' so include its range
 * @returns {Array<CompletionItem>}
 */
function _completeExtensionDefinedVariables(position, trigger, search) {

  // triggered by '$' or '${'}, so include them to complete w/o two '$${file}'
  let replaceRange;
  let searchCompletions = undefined;
  
  const text = `
  
	Three possible forms:
    
    \${getTextLines:n}  get line n text
    \${getTextLines:n-p} text lines n through p
    \${getTextLines:n,o,p,q} text from line n, character o 
                            through line p, character q

Replace ***n, o, p, q*** with some number 0-x.

`;

	if (trigger) replaceRange = new Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new Range(position, position);

  if (search)
    searchCompletions = [
      _makeValueCompletionItem("${resultsFiles}", replaceRange, "", "052", `A comma-separated list of the files in the current search results.`),
      // _makeValueCompletionItem("${getFindInput}", replaceRange, "", "0544", `Trigger an input box for the find query.`)
    ]
  
	const completionItems =  [
		_makeValueCompletionItem("${getDocumentText}", replaceRange, "", "053", `The complete text of the current document.`),
    _makeValueCompletionItem("${getTextLines:n}", replaceRange, "", "0541", `Line and character numbers are 0-based. ${ text }`),
    _makeValueCompletionItem("${getTextLines:n-p}", replaceRange, "", "0542", `Line and character numbers are 0-based. ${ text }`),
    _makeValueCompletionItem("${getTextLines:n,o,p,q}", replaceRange, "", "0543", `Line and character numbers are 0-based. ${ text }`),
    _makeValueCompletionItem("${getFindInput}", replaceRange, "", "0544", `Trigger an input box for the find query.`)
	];

	if (search) return completionItems.concat(searchCompletions);
	else return completionItems;
}

/**
 * Make completion items for 'filesToInclude/filesToExclude/find/replace' values starting with a '$' sign
 * 
 * @param   {import("vscode").Position} position
 * @param   {string} trigger - triggered by '$' so include its range
 * @returns {Array<CompletionItem>}
 */
function _completePathVariables(position, trigger) {

	// triggered by 1 '$', so include it to complete w/o two '$${file}'
	let replaceRange;

	if (trigger) replaceRange = new Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new Range(position, position);

	const completionItems =  [
		_makeValueCompletionItem("${file}", replaceRange, "", "01", "The full path (`/home/UserName/myProject/folder/test.txt`) of the current editor."),
		_makeValueCompletionItem("${relativeFile}", replaceRange, "", "011", "The path of the current editor relative to the workspaceFolder (`folder/file.ext`)."),
		_makeValueCompletionItem("${fileBasename}", replaceRange, "", "012", "The basename (`file.ext`) of the current editor."),
		_makeValueCompletionItem("${fileBasenameNoExtension}", replaceRange, "", "013", "The basename  (`file`) of the current editor without its extension."),
		_makeValueCompletionItem("${fileExtname}", replaceRange, "", "014", "The extension (`.ext`) of the current editor."),

		_makeValueCompletionItem("${fileDirname}", replaceRange, "", "02", "The full path of the current editor's parent directory."),
		_makeValueCompletionItem("${relativeFileDirname}", replaceRange, "", "021", "The path of the current editor's parent directory relative to the workspaceFolder."),

		_makeValueCompletionItem("${fileWorkspaceFolder}", replaceRange, "", "03", "The full path of the current editor's workspaceFolder."),
		_makeValueCompletionItem("${workspaceFolder}", replaceRange, "", "031", "The full path (`/home/UserName/myProject`) to the currently opened workspaceFolder."),
		_makeValueCompletionItem("${workspaceFolderBasename}", replaceRange, "", "032", "The name (`myProject`) of the workspaceFolder."),

		_makeValueCompletionItem("${selectedText}", replaceRange, "", "04", "The **first** selection in the current editor."),
		_makeValueCompletionItem("${CLIPBOARD}", replaceRange, "", "041", "The clipboard contents."),
    _makeValueCompletionItem("${pathSeparator}", replaceRange, "", "042", "`/` on linux/macOS, `\\` on Windows."),
    _makeValueCompletionItem("${lineIndex}", replaceRange, "", "043", "The line number of the **first** cursor in the current editor, lines start at 0."),
		_makeValueCompletionItem("${lineNumber}", replaceRange, "", "044", "The line number of the **first** cursor in the current editor, lines start at 1."),

    _makeValueCompletionItem("${matchIndex}", replaceRange, "", "05", "The 0-based find match index. Is this the first, second, etc. match?"),
    _makeValueCompletionItem("${matchNumber}", replaceRange, "", "051", "The 1-based find match index. Is this the first, second, etc. match?"),
	];

	return completionItems;
}

/**
 * Make completion items for 'snippet' variables starting with a '$' sign
 * 
 * @param   {import("vscode").Position} position
 * @param   {string} trigger - triggered by '$' so include its range
 * @returns {Array<CompletionItem>}
 */
function _completeSnippetVariables(position, trigger) {

	// triggered by 1 '$', so include it to complete w/o two '$${file}'
	let replaceRange;
	if (trigger) replaceRange = new Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new Range(position, position);

  return [
		_makeValueCompletionItem("${TM_CURRENT_LINE}", replaceRange, "", "0601", "The contents of the current line"),
		_makeValueCompletionItem("${TM_CURRENT_WORD}", replaceRange, "", "0602", "The contents of the word at the cursor or the empty string."),
    
    _makeValueCompletionItem("${CURRENT_YEAR}", replaceRange, "", "0613", "The current year."),
		_makeValueCompletionItem("${CURRENT_YEAR_SHORT}", replaceRange, "", "0614", "The current year's last two digits."),
		_makeValueCompletionItem("${CURRENT_MONTH}", replaceRange, "", "0615", "The month as two digits (example '02')."),
    _makeValueCompletionItem("${CURRENT_MONTH_NAME}", replaceRange, "", "0616", "The full name of the month (example 'July')."),
    _makeValueCompletionItem("${CURRENT_MONTH_NAME_SHORT}", replaceRange, "", "0617", "The short name of the month (example 'Jul')."),
    _makeValueCompletionItem("${CURRENT_DATE}", replaceRange, "", "0618", "The day of the month as two digits (example '08')."),
    _makeValueCompletionItem("${CURRENT_DAY_NAME}", replaceRange, "", "0619", "The name of day (example 'Monday')."),
    _makeValueCompletionItem("${CURRENT_DAY_NAME_SHORT}", replaceRange, "", "0620", "The short name of the day (example 'Mon')."),
    _makeValueCompletionItem("${CURRENT_HOUR}", replaceRange, "", "0621", "The current hour in 24-hour clock format."),
    _makeValueCompletionItem("${CURRENT_MINUTE}", replaceRange, "", "0621", "The current minute as two digits."),
    _makeValueCompletionItem("${CURRENT_SECOND}", replaceRange, "", "0622", "The current second as two digits."),
    _makeValueCompletionItem("${CURRENT_SECONDS_UNIX}", replaceRange, "", "0623", "The number of seconds since the Unix epoch."),
    _makeValueCompletionItem("${CURRENT_TIMEZONE_OFFSET}", replaceRange, "", "0624", "The timezone offset for the local time. In the form of '+7:00:00' or '-7:00:00'."),

    _makeValueCompletionItem("${RANDOM}", replaceRange, "", "0624", "Six random Base-10 digits."),
    _makeValueCompletionItem("${RANDOM_HEX}", replaceRange, "", "0625", "Six random Base-16 digits."),
    // _makeValueCompletionItem("${UUID}", replaceRange, "", "0626", "A Version 4 UUID."),
 
    _makeValueCompletionItem("${BLOCK_COMMENT_START}", replaceRange, "", "0627", "Example output: in PHP `/*` or in HTML `<!--`."),
    _makeValueCompletionItem("${BLOCK_COMMENT_END}", replaceRange, "", "0628", "Example output: in PHP `*/` or in HTML `-->`."),
    _makeValueCompletionItem("${LINE_COMMENT}", replaceRange, "", "0629", "Example output: in PHP `//`."),
  ];
}

/**
 * Make completion items for 'replace' values starting with a '\' sign in a 'findInCurrentFile' command
 * 
 * @param   {import("vscode").Position} position
 * @param   {string} trigger - triggered by '$' or '$$' or '$${' so include their ranges
 * @returns {Array<CompletionItem>}
 */
function _completeReplaceJSOperation(position, trigger) {

	// triggered by '$' or '$$' or '$${' so use their ranges
	let replaceRange;
	if (trigger) replaceRange = new Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new Range(position, position);

	const text = `
		
Replace ***operation*** with some code.`;

	return [
		_makeValueCompletionItem("$${return operation;}$$", replaceRange, "", "001", `Create a javascript operation.${ text }`),
	];
}

/**
 * Make completion items for 'replace' values starting with a '$' sign in a 'findInCurrentFile' command
 * 
 * @param   {import("vscode").Position} position
 * @param   {string} trigger - triggered by '$' so include its range
 * @returns {Array<CompletionItem>}
 */
function _completeReplaceFindVariables(position, trigger) {

	// triggered by 1 '$' or '$${' or '${'
  	return [
    ..._completePathVariables(position, trigger),
    ..._completeExtensionDefinedVariables(position, trigger),
    ..._completeFindConditionalTransforms(position, trigger),
    ..._completeReplaceJSOperation(position, trigger),
    ..._completeSnippetVariables(position, trigger)
  ];
}

/**
 * Make completion items for 'replace' values starting with a '$' sign
 * 
 * @param   {import("vscode").Position} position
 * @param   {string} trigger - triggered by '$' or '${' so include its range
 * @returns {Array<CompletionItem>}
 */
function _completeFindConditionalTransforms(position, trigger) {

  // triggered by $ or ${ so include their length in the replaceRange
  let replaceRange;
  if (trigger) replaceRange = new Range(position.line, position.character - trigger.length, position.line, position.character);
  else replaceRange = new Range(position, position);
  
  	const text = `
		
Replace ***n*** with some number 0-99.

`;

  return [
   	_makeValueCompletionItem("${n:/upcase}", replaceRange, "", "080", `Transform to uppercase the ***nth*** capture group.${text}.
Example: "find": "\${1:/upcase}"`),
    
    _makeValueCompletionItem("${n:/downcase}", replaceRange, "", "081", `Transform to lowercase the ***nth*** capture group.${text}
Example: "find": "\${2:/downcase}"`),
    
    _makeValueCompletionItem("${n:/capitalize}", replaceRange, "", "082", `Capitalize the ***nth*** capture group.${text}
Example: "find": "\${1:/capitalize}"`),
    
    _makeValueCompletionItem("${n:/pascalcase}", replaceRange, "", "083", `Transform to pascalcase the ***nth*** capture group.${text}
Example: "find": "\${2:/pascalcase}"`),
    
    _makeValueCompletionItem("${n:/camelcase}", replaceRange, "", "084", `Transform to camelcase the ***nth*** capture group.${text}
Example: "find": "\${1:/camelcase}"`),
    
    _makeValueCompletionItem("${n:/snakecase}", replaceRange, "", "085", `Transform to snakecase the ***nth*** capture group.${text}
Example: "find": "\${1:/snakecase}"`),
    
        
    _makeValueCompletionItem("${n:+ if add text}", replaceRange, "", "090", `Conditional replacement: if capture group ***nth***, add test.${text}
Example: "find": "\${2:+ if add text}"`),
            
    _makeValueCompletionItem("${n:- else add text}", replaceRange, "", "091", `Conditional replacement:  if no capture group ***nth***, add test.${text}
Example: "find": "\${1:- else add text}"`),
                
    _makeValueCompletionItem("${n: else add text}", replaceRange, "", "092", `Conditional replacement:  if no capture group ***nth***, add test.${text}
Example: "find": "\${2: else add text}"`),
                    
    _makeValueCompletionItem("${n:? if add text: else add this text}", replaceRange, "", "093", `Conditional replacement: if capture group ***nth***, add some text, else add other text.${text}
Example: "find": "\${1:? if add text: else add this text}"`),
  ];
}

/**
 * Make completion items for 'restrictFind' values with priority
 * 
 * @param   {import("vscode").Position} position
 * @returns {Array<CompletionItem>}
 */
function _completeRestrictFindValues(position) {
  
  const replaceRange = new Range(position, position);
  
	return [
		_makeValueCompletionItem("document", replaceRange, "document", "01", "Find and replace in the current editor."),
		_makeValueCompletionItem("selections", replaceRange, "document", "02", "Find and replace in selections only."),

		_makeValueCompletionItem("matchAroundCursor", replaceRange, "document", "021", "Use the find regex to get the match in which the cursor is contained."),
    
    _makeValueCompletionItem("onceIncludeCurrentWord", replaceRange, "document", "03", "Find the first match on the current line from the beginning of the current word and replace, if any replacement specified."),
    _makeValueCompletionItem("onceExcludeCurrentWord", replaceRange, "document", "031", "Find the first match on the current line **after the cursor** and replace, if any replacement specified.  Same as the previous value `once`, which is deprecated."),

		_makeValueCompletionItem("line", replaceRange, "document", "04", "Find and replace all matches on the current line before and after the cursor."),

		_makeValueCompletionItem("nextSelect", replaceRange, "document", "05", "Select the next match after replacing it (if you specify a replacement)."),
		_makeValueCompletionItem("nextMoveCursor", replaceRange, "document", "06", "Move the cursor to after the next match and replace it, if any, but do not select it."),
		_makeValueCompletionItem("nextDontMoveCursor", replaceRange, "document", "07", "Replace the next match but leave cursor at original position."),

		_makeValueCompletionItem("previousSelect", replaceRange, "document", "08", "Select the previous match after replacing it (if you specify a replacement)."),
		_makeValueCompletionItem("previousMoveCursor", replaceRange, "document", "09", "Move the cursor to after the previous match and replace it, if any, but do not select it."),
		_makeValueCompletionItem("previousDontMoveCursor", replaceRange, "document", "10", "Replace the previous match but leave cursor at original position.")
  ];
}

/**
 * Make completion items for 'runWhen' values with priority
 * 
 * @param   {import("vscode").Position} position
 * @returns {Array<CompletionItem>}
 */
function _completeRunWhen(position) {

  const replaceRange = new Range(position, position);
  return [
    _makeValueCompletionItem("onceIfAMatch", replaceRange, "onceIfAMatch", "01", "Do the `run` operation only one time for all matches, if there was at least one find match."),
    _makeValueCompletionItem("onEveryMatch", replaceRange, "onceIfAMatch", "02", "Do the `run` operation once for each find match."),
    _makeValueCompletionItem("onceOnNoMatches", replaceRange, "onceIfAMatch", "03", "Do the `run` operation one time when there were no find matches.")
  ];
}

/**
 * Make completion items for 'runPostCommands' values with priority
 * 
 * @param   {import("vscode").Position} position
 * @returns {Array<CompletionItem>}
 */
function _completeRunPostCommands(position) {

  const replaceRange = new Range(position, position);
  return [
    _makeValueCompletionItem("onceIfAMatch", replaceRange, "onceIfAMatch", "01", "Run the `postCommands` only one time for all matches, if there was at least one find match."),
    _makeValueCompletionItem("onEveryMatch", replaceRange, "onceIfAMatch", "02", "EXPERIMENTAL: Run the `postCommands` once for each find match."),
    _makeValueCompletionItem("onceOnNoMatches", replaceRange, "onceIfAMatch", "03", "Run the `postCommands` one time when there were no find matches.")
  ];
}

/**
 * Make completion items for 'reveal' values with priority
 * 
 * @param   {import("vscode").Position} position
 * @returns {Array<CompletionItem>}
 */
function _completeRevealValues(position) {

  const replaceRange = new Range(position, position);
  return [
    _makeValueCompletionItem("first", replaceRange, "", "01", "Reveal the first match in the editor."),
    _makeValueCompletionItem("next", replaceRange, "", "02", "Reveal the next match from the current cursor in the editor."),
    _makeValueCompletionItem("last", replaceRange, "", "03", "Reveal the last match in the editor.")
  ];
}

/**
 * Make completion items for 'find' values starting with a '\' sign in a 'findInCurrentFile' command
 * 
 * @param   {import("vscode").Position} position
 * @param   {string} trigger - triggered by '\' or '\\' so include its range
 * @returns {Array<CompletionItem>}
 */
function _completeFindCaseTransforms(position, trigger) {

  // triggered by 1 or 2 '\', so include it to complete w/o three '\\\U'
  let replaceRange;
  if (trigger) replaceRange = new Range(position.line, position.character - trigger.length, position.line, position.character);
  else replaceRange = new Range(position, position);

  return [
    _makeValueCompletionItem("\\\\U", replaceRange, "", "010", `Find the uppercased version of the following variable.

Example: "find": "\\\\\\U\${relativeFile}"`),
    
    _makeValueCompletionItem("\\\\u", replaceRange, "", "011", `Find the the following variable with its first letter uppercased.

Example: "find": "\\\\\\u\${TM_CURRENT_WORD}"`),
    
    _makeValueCompletionItem("\\\\L", replaceRange, "", "012", `Find the lowercased version of the following variable.

Example: "find": "\\\\\\L\${relativeFile}"`),
    
    _makeValueCompletionItem("\\\\l", replaceRange, "", "013", `Find the the following variable with its first letter lowercased.

Example: "find": "\\\\\\l\${CURRENT_MONTH_NAME}"`)
  ];
}


/**
 * Make completion items for 'replace' values starting with a '\' sign in a 'findInCurrentFile' command
 * 
 * @param   {import("vscode").Position} position
 * @param   {string} trigger - triggered by '\' or '\\' so include its range
 * @returns {Array<CompletionItem>}
 */
function _completeReplaceCaseTransforms(position, trigger) {

	// triggered by 1 or 2 '\', so include it to complete w/o three '\\\U$n'
	let replaceRange;
	if (trigger) replaceRange = new Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new Range(position, position);

	const text = `
		
Replace ***n*** with some number 0-99.`;

	return [
		_makeValueCompletionItem("\\\\U$n", replaceRange, "", "010", `Transform to uppercase the entire ***nth*** capture group.${ text }`),
		_makeValueCompletionItem("\\\\u$n", replaceRange, "", "011", `Capitalize the first letter of the ***nth*** capture group.${ text }`),
		_makeValueCompletionItem("\\\\L$n", replaceRange, "", "012", `Transform to lowercase the entire ***nth*** capture group.${ text }`),
    _makeValueCompletionItem("\\\\l$n", replaceRange, "", "013", `Transform to lowercase the first letter of the ***nth*** capture group.${ text }`),
    
    _makeValueCompletionItem("\\\\U", replaceRange, "", "014", `Find the uppercased version of the following variable.

Example: "find": "\\\\\\U\${relativeFile}"`),

    _makeValueCompletionItem("\\\\u", replaceRange, "", "015", `Find the the following variable with its first letter uppercased.

Example: "find": "\\\\\\u\${CURRENT_MONTH_NAME}"`),

    _makeValueCompletionItem("\\\\L", replaceRange, "", "016", `Find the lowercased version of the following variable.

Example: "find": "\\\\\\L\${relativeFile}"`),

    _makeValueCompletionItem("\\\\l", replaceRange, "", "017", `Find the the following variable with its first letter lowercased.

Example: "find": "\\\\\\l\$TM_CURRENT_LINE"`)
	];
}


/**
 * From a string input make a CompletionItemKind.Text
 * @param   {string} key
 * @param   {Range} replaceRange
 * @param   {string|boolean} defaultValue - default value for this option
 * @param   {string} sortText - sort order of item in completions
 * @param   {string} documentation - markdown description of each item
 * @param   {boolean} [invoked] - was this invoked by Ctrl+Space
 * @returns {CompletionItem} - CompletionItemKind.Text
 */
function _makeKeyCompletionItem(key, replaceRange, defaultValue, sortText, documentation, invoked) {

  let item;
  const leadingQuote = invoked ? '"' : '';  // if user-invoked, not character-triggered
  
  if (key === "run") {
    item = new CompletionItem("run: $${ operation }$$", CompletionItemKind.Property);
    item.insertText = new SnippetString(`${ leadingQuote }run": [\n\t"$$\{",\n\t\t"\$\{1:operation\};",\n\t\t"\$\{2:operation\};",\n\t\t"\$\{3:operation\};",\n\t"\}$$",\n],`);
    // item.range = replaceRange;
    item.range = new Range(replaceRange.start, new Position(replaceRange.start.line, replaceRange.start.character + 1));
  }
  else {
    item = new CompletionItem(key, CompletionItemKind.Property);
  
    // don't select true/false/numbers defaultValue's
    if (typeof defaultValue === "number")  // key == delay
      // item.insertText = new SnippetString(`${ leadingQuote }${ key }": \$\{1:${ defaultValue }\}`);
      item.insertText = new SnippetString(`${ leadingQuote }${ key }": \$\{1:${ defaultValue }\},`);
    else if (typeof defaultValue === "boolean")
      // item.insertText = new SnippetString(`${ leadingQuote }${ key }": ${ defaultValue }`);
      item.insertText = new SnippetString(`${ leadingQuote }${ key }": ${ defaultValue },`);
    else
      // item.insertText = new SnippetString(`${ leadingQuote }${ key }": "\$\{1:${ defaultValue }\}"`);
      item.insertText = new SnippetString(`${ leadingQuote }${ key }": "\$\{1:${ defaultValue }\}",`);
      
  
    if (!invoked)
      item.range = new Range(replaceRange.start, new Position(replaceRange.start.line, replaceRange.start.character + 1));
    else
      item.range = replaceRange;
  }
    // item.range = {inserting: replaceRange, replacing: new Range(replaceRange.start, replaceRange.start)}
  
  if (defaultValue) item.detail = `default: ${ defaultValue }`;
  if (sortText) item.sortText = sortText;
  
  const delayText = `"filesToInclude": "\${resultsFiles}"`;
  
  const preCommandText = `"preCommands": "cursorHome"
"preCommands": ["cursorHome", "cursorEndSelect"]`;
  
  const postCommandText = `"postCommands": "editor.action.selectFromAnchorToCursor"
"postCommands": ["cursorHome", "editor.action.clipboardCopyAction"]`;
  
  const runWhenText = ` "onceIfAMatch":  "one time only for all find matches"
 "onEveryMatch":  "one time for each match"
 "onceOnNoMatches":   "when there are no matches run one time"`;
  
 const runPostCommandsText = ` "onceIfAMatch":  "one time only for all find matches"
 "onEveryMatch":  "EXPERIMENTAL: one time for each match"
 "onceOnNoMatches":   "when there are no matches run one time"`;

  // TODO implement getDocumentation()/getCodeBlock() and possibly an array/object loading here rather than if/elses
  if (documentation) {
    if (key === 'runWhen')
      item.documentation = new MarkdownString(documentation).appendCodeblock(runWhenText, 'jsonc');
    else if (key === 'delay')
      item.documentation = new MarkdownString(documentation).appendCodeblock(delayText, 'jsonc');
    else if (key === 'preCommands')
      item.documentation = new MarkdownString(documentation).appendCodeblock(preCommandText, 'jsonc');
    else if (key === 'postCommands')
      item.documentation = new MarkdownString(documentation).appendCodeblock(postCommandText, 'jsonc');
    else if (key === 'runPostCommands')
      item.documentation = new MarkdownString(documentation).appendCodeblock(runPostCommandsText, 'jsonc');
      
    else if (key === 'ignoreWhiteSpace') {
      item.documentation = new MarkdownString(documentation);
      // get below from a getDocumentation() object
      const args = encodeURIComponent(JSON.stringify({ anchor: 'using-the-ignorewhitespace-argument' }));
      item.documentation.appendCodeblock('', 'plaintext');        // just adds an empty line before next entry
      item.documentation.appendMarkdown(`&nbsp;&nbsp;&nbsp; README : [ ignoreWhiteSpace option.](command:find-and-transform.openReadmeAnchor?${ args })`);
      item.documentation.isTrusted = true;
    }
      
    else item.documentation = new MarkdownString(documentation);
  }
  
	return item;
}

/**
 * From a string input make a CompletionItemKind.Property
 *
 * @param   {string} value
 * @param   {Range} replaceRange
 * @param   {string|boolean} defaultValue - default value for this option
 * @param   {string} sortText - sort order of item in completions
 * @param   {string} documentation - markdown description of each item
 * @param   {boolean} [invoked] - was this invoked by Ctrl+Space
 * @returns {CompletionItem} - CompletionItemKind.Text
 */
function _makeValueCompletionItem(value, replaceRange, defaultValue, sortText, documentation, invoked) {

  let item;
  
  item = new CompletionItem(value, CompletionItemKind.Property);
  item.insertText = value;  // inserting a SnippetString is resolving variables like ${file}, etc.
  item.range = replaceRange;
  // item.range = { inserting: insertRange, replacing: replaceRange }; // insertRange - numCharacters from "fi|rst ??
  
  if (defaultValue) item.detail = `default: ${ defaultValue }`;

  if (sortText) item.sortText = sortText;
  if (documentation) item.documentation = documentation;
  
  // to select all the n's and text to be replaced
  if (value.substring(0, 3) === "${n:/") { // // ${n:/upcase} 
    item.insertText = new SnippetString("\\${" + "\$\{1:n\}" + value.substring(3));
  }
  else if (value.search(/\${n:[+-]/) !== -1) {  // ${1:+ if add text}${n:- else add text}
    item.insertText = new SnippetString("\\${" + "\$\{1:n\}" + value.substring(3,5) + `\$\{2:${value.substring(5)}\}`);
  }
  else if (value.search(/\${n: /) !== -1) {  // ${n: else add text}
    item.insertText = new SnippetString("\\${" + "\$\{1:n\}" + value.substring(3,4) + "\$\{2: else add text\}}");
  }
  else if (value.search(/\${n:\?/) !== -1) {  // ${n:? if add text: else add this text}
    item.insertText = new SnippetString("\\${" + "\$\{1:n\}" + value.substring(3,5) + "\$\{2: if add text\}" + ":" + "\$\{3: else add this text\}}");
	}
  else if (value.search(/^\\\\[UuLl]\$n/m) !== -1) {  // \\U$n
    item.insertText = new SnippetString("\\" + value.slice(0, -1) + "\$\{1:n\}");
  }
  else if (value === "${getTextLines:n}") {
    item.insertText = new SnippetString("\\${getTextLines:\$\{1:n\}}");
  }
  else if (value === "${getTextLines:n-p}") {
    item.insertText = new SnippetString("\\${getTextLines:\$\{1:n\}-\$\{2:p\}}");
  }
  else if (value === "${getTextLines:n,o,p,q}") {
    item.insertText = new SnippetString("\\${getTextLines:\$\{1:n\},\$\{2:o\},\$\{3:p\},\$\{4:q\}}");
  }
  else if (value === "$${return operation;}$$") {
    item.insertText = new SnippetString("\\$\\${" + "\$\{1:return operation;\}}\\$\\$");
	}

	return item;
}

/**
 * From a string input make a CompletionItemKind.Text
 *
 * @param   {string} command
 * @param   {Range} replaceRange
 * @param   {string} documentation - markdown description of each item
 * @returns {CompletionItem} - CompletionItemKind.Text
 */
function _makeCommandCompletionItem(command, replaceRange, documentation) {

  let item;

  item = new CompletionItem(command, CompletionItemKind.Property);
  item.insertText = new SnippetString(`\$\{1:${ command }\}`);
  item.range = replaceRange;
  
	return item;
}