const vscode = require('vscode');
const jsonc = require("jsonc-parser");
const searchCommands = require('./search');
const findCommands = require('./transform');


/**
 * Register a CompletionItemProvider for keybindings.json
 * @param {vscode.ExtensionContext} context
 */
exports.makeKeybindingsCompletionProvider = function(context) {
    const configCompletionProvider = vscode.languages.registerCompletionItemProvider (
      { pattern: '**/keybindings.json' },
      {
        provideCompletionItems(document, position) {

					const linePrefix = document.lineAt(position).text.substr(0, position.character);
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
							// "command": "findInCurrentFile.upcaseSwap2",
							if (find && pcommand.command.startsWith("findInCurrentFile")) {
								completionArray.push(_makeCompletionItem(pcommand.command.replace(/^.*\./, ""), new vscode.Range(position, position), null, "", "A 'findInCurrentFile' from your settings."));
							}
							else if (search && pcommand.command.startsWith("runInSearchPanel")) {
								completionArray.push(_makeCompletionItem(pcommand.command.replace(/^.*\./, ""), new vscode.Range(position, position), null, "", "'runInSearchPanel' from your settings."));
							}
						});
						return completionArray;
					}

					// ---------------    command completion end   ----------------------------

					// ---------------    args completion start   ----------------------------

					find = false;
					search = false;
							
					const rootNode = jsonc.parseTree(document.getText());
					const node = jsonc.findNodeAtOffset(rootNode, document.offsetAt(position));
					const curLocation = jsonc.getLocation(document.getText(), document.offsetAt(position));

					const thisKeybinding = node.parent?.parent?.parent?.parent?.children[1]?.children[1]?.value;
					if (thisKeybinding === 'findInCurrentFile') find = true;
					else if (thisKeybinding === 'runInSearchPanel') search = true;
					else return undefined;  // not in our keybindings

					// ---------  $ for 'filesToInclude/filesToExclude/find/replace/restrictFind' completions  ------
							
					let re$ = /^\s*"(find|filesToInclude|filesToExclude)"\s*:\s*".*\$$/;
					if (find || search) {
						if (linePrefix.substring(0, position.character).search(re$) !== -1) {
							return _completeVariables(position, '$');
						}
					}

					re$ = /^\s*"replace"\s*:\s*".*\$$/;    // just for 'replace'
					if (find && linePrefix.substring(0, position.character).search(re$) !== -1) {
						return _completeReplaceFindVariables(position, '$');
					}
					else if (search && linePrefix.substring(0, position.character).search(re$) !== -1) {
						return _completeVariables(position, '$');
					}

					re$ = /^\s*"replace"\s*:\s*".*\\$/;    // just for 'replace'
					if (linePrefix.substring(0, position.character).search(re$) !== -1) {
						return _completeReplaceFindCaseTransforms(position, '\\');
					}
					
					re$ = /^\s*"restrictFind"\s*:\s*"$/;
					if (find && linePrefix.search(re$) !== -1)
						return _completeRestrictFindValues(position);

					// ---------------    duplicate args removal start   ----------------------------

					if (curLocation?.path[1] !== 'args') return undefined;

					const argNode = node.parent.parent.parent.children;
					const argsStartingIndex = argNode[0]?.offset;
					const argsLength = argNode[0]?.length + argNode[1]?.length;

					const argsRange = new vscode.Range(document.positionAt(argsStartingIndex), document.positionAt(argsLength + argsStartingIndex + 1));
					const argsText = document.getText(argsRange);

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
		'.', '"', '$', '\\'   // trigger intellisense/completion
	);

  context.subscriptions.push(configCompletionProvider);
};


/**
 * Register a CompletionItemProvider for settings.json
 * @param {vscode.ExtensionContext} context
 */
exports.makeSettingsCompletionProvider = function(context) {
  const settingsCompletionProvider = vscode.languages.registerCompletionItemProvider (
    { pattern: '**/settings.json' },
    {
      provideCompletionItems(document, position) {

        // get all text until the current `position` and check if it reads `  {  "` before the cursor
				const linePrefix = document.lineAt(position).text.substr(0, position.character);

				let find = false;
				let search = false;

				const rootNode = jsonc.parseTree(document.getText());
				const findCommandNode = rootNode.children?.find(child => child.children[0]?.value === "findInCurrentFile");
				const searchCommandNode = rootNode.children?.find(child => child.children[0]?.value === "runInSearchPanel");
				if (!findCommandNode && !searchCommandNode) return undefined;

				const node = jsonc.findNodeAtOffset(rootNode, document.offsetAt(position));
				const curLocation = jsonc.getLocation(document.getText(), document.offsetAt(position));

				const command = curLocation.path[0];
				const subCommand = curLocation.path[1];

				if (command === 'findInCurrentFile') find = true;
				else if (command === 'runInSearchPanel') search = true;
				else return undefined;  // not in our keybindings

				// ---------------    $ completion for 'filesToInclude/filesToExclude/find/replace' completions   ------

				let re$ = /^\s*"(find|filesToInclude|filesToExclude)"\s*:\s*".*\$$/;
				if (find || search) {
					if (linePrefix.substring(0, position.character).search(re$) !== -1) {
						return _completeVariables(position, '$');
					}
				}

				re$ = /^\s*"replace"\s*:\s*".*\$$/;    // just for 'replace'
				if (find && linePrefix.substring(0, position.character).search(re$) !== -1) {
					return _completeReplaceFindVariables(position, '$');
				}
				else if (search && linePrefix.substring(0, position.character).search(re$) !== -1) {
					return _completeVariables(position, '$');
				}

				if (find && linePrefix.search(/"restrictFind":\s*"$/m) !== -1)
					return _completeRestrictFindValues(position);

				// -----------------------------------------------------------------------

				let keysText = "";

				if (curLocation.isAtPropertyKey && subCommand) {
					const subCommandNode = node.parent.parent.parent.children[1];
					const keysRange = new vscode.Range(document.positionAt(subCommandNode.offset), document.positionAt(subCommandNode.offset + subCommandNode.length + 1));
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
 * Make CompletionItem arrays, eliminate already used option keys found in the args text
 *
 * @param   {String[]} argArray - options for forward or backward commands
 * @param   {String} argsText - text of the 'args' options:  "args": { .... }
 * @param   {vscode.Position} position - cursor position
 * @returns {Array<vscode.CompletionItem>}
 */
function _filterCompletionsItemsNotUsed(argArray, argsText, position) {

	const defaults = searchCommands.getDefaults();

	const priority = {
		"title": "01",
		"find": "011",
		"replace": "02",
		"isRegex": "021",

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

		"preserveCase": "07"
	};

	const description = {
		"title": "This will appear in the Command Palette as `Find-and-Transform:<title>`. Can include spaces.",

		"find": "Query to find or search.  Can be a regexp or plain text.",
		"replace": "Replacement text.  Can include variables like `${relativeFile}`. Replacements can include conditionals like `${n:+if add text}` or case modifiers such as `\\\\U$n` or `${2:/upcase}`.",
		"isRegex": "Is the find query a regexp.",

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
 * Make completion items for 'filesToInclude/filesToExclude' values starting with a '$' sign
 * 
 * @param   {vscode.Position} position
 * @param   {String} dollarSign - triggered by '$' so include its range
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeVariables(position, dollarSign) {

	// triggered by 1 '$', so include it to complete w/o two '$${file}'
	let replaceRange;
	if (dollarSign) replaceRange = new vscode.Range(position.line, position.character - dollarSign.length, position.line, position.character);
	else replaceRange = new vscode.Range(position, position);

	return [
		_makeCompletionItem("${file}", replaceRange, "", "01", "The full path (`/home/UserName/myProject/folder/test.txt`) of the current editor."),
		_makeCompletionItem("${relativeFile}", replaceRange, "", "011", "The path of the current editor relative to the workspaceFolder (`folder/file.ext`)."),
		_makeCompletionItem("${fileBasename}", replaceRange, "", "02", "The basename (`file.ext`) of the current editor."),
		_makeCompletionItem("${fileBasenameNoExtension}", replaceRange, "", "03", "The basename  (`file`) of the current editor without its extension."),
		_makeCompletionItem("${fileExtname}", replaceRange, "", "04", "The extension (`.ext`) of the current editor."),

		_makeCompletionItem("${fileDirname}", replaceRange, "", "05", "The full path of the current editor's parent directory."),
		_makeCompletionItem("${relativeFileDirname}", replaceRange, "", "051", "The path of the current editor's parent directory relative to the workspaceFolder."),

		_makeCompletionItem("${fileWorkspaceFolder}", replaceRange, "", "06", "The full path of the current editor's workspaceFolder."),
		_makeCompletionItem("${workspaceFolder}", replaceRange, "", "061", "The full path (`/home/UserName/myProject`) to the currently opened workspaceFolder."),
		_makeCompletionItem("${workspaceFolderBasename}", replaceRange, "", "062", "The name (`myProject`) of the workspaceFolder."),

		_makeCompletionItem("${selectedText}", replaceRange, "", "071", "The **first** selection in the current editor."),
		_makeCompletionItem("${CLIPBOARD}", replaceRange, "", "072", "The clipboard contents."),
		_makeCompletionItem("${pathSeparator}", replaceRange, "", "073", "`/` on linux/macOS, `\\` on Windows."),
		_makeCompletionItem("${lineNumber}", replaceRange, "", "074", "The line number of the **first** cursor in the current editor, lines start at 1."),
		_makeCompletionItem("${resultsFiles}", replaceRange, "", "075", "A comma-separated list of the files in the current search results."),
	];
}

/**
 * Make completion items for 'replace' values starting with a '$' sign in a 'findInCurrentFile' command
 * 
 * @param   {vscode.Position} position
 * @param   {String} trigger - triggered by '$' so include its range
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeReplaceFindVariables(position, trigger) {

	// triggered by 1 '$', so include it to complete w/o two '$${file}'
	let replaceRange;
	if (trigger) replaceRange = new vscode.Range(position.line, position.character - trigger.length, position.line, position.character);
	else replaceRange = new vscode.Range(position, position);

	let specialVariableArray = _completeVariables(position, trigger);

	const text = `
		
Replace ***n*** with some number 0-99.`;

	return [
		...specialVariableArray,

		_makeCompletionItem("${n:/upcase}", replaceRange, "", "080", `Transform to uppercase the ***nth*** capture group.${text}`),
		_makeCompletionItem("${n:/downcase}", replaceRange, "", "081", `Transform to lowercase the ***nth*** capture group.${text}`),
		_makeCompletionItem("${n:/capitalize}", replaceRange, "", "082", `Capitalize the ***nth*** capture group.${text}`),
		_makeCompletionItem("${n:/pascalcase}", replaceRange, "", "083", `Transform to pascalcase the ***nth*** capture group.${text}`),
		_makeCompletionItem("${n:/camelcase}", replaceRange, "", "084", `Transform to camelcase the ***nth*** capture group.${text}`),

		_makeCompletionItem("${n:+ if add text}", replaceRange, "", "090", `Conditional replacement: if capture group ***nth***, add test.${text}`),
		_makeCompletionItem("${n:- else add text}", replaceRange, "", "091", `Conditional replacement:  if no capture group ***nth***, add test.${text}`),
		_makeCompletionItem("${n: else add text}", replaceRange, "", "092", `Conditional replacement:  if no capture group ***nth***, add test.${text}`),
		_makeCompletionItem("${n:? if add text: else add this text}", replaceRange, "", "093", `Conditional replacement: if capture group ***nth***, add some text, else add other text.${text}`)
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
 * Make completion items for 'replace' values starting with a '$' sign in a 'findInCurrentFile' command
 * 
 * @param   {vscode.Position} position
 * @param   {String} trigger - triggered by '$' so include its range
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeReplaceFindCaseTransforms(position, trigger) {

	// triggered by 1 '$', so include it to complete w/o two '$${file}'
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
	];
}

/**
 * From a string input make a CompletionItemKind.Text
 *
 * @param   {String} key
 * @param   {vscode.Range} replaceRange
 * @param   {String|Boolean} defaultValue - default value for this option
 * @param   {String} sortText - sort order of item in completions
 * @param   {String} documentation - markdown description of each item
 * @returns {vscode.CompletionItem} - CompletionItemKind.Text
 */
function _makeCompletionItem(key, replaceRange, defaultValue, sortText, documentation) {

	const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Text);
	item.range = replaceRange;
	if (defaultValue) item.detail = `default: ${ defaultValue }`;
	if (sortText) item.sortText = sortText;
	if (documentation) item.documentation = new vscode.MarkdownString(documentation);

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
		// call command 'selectDigitInCompletion' defined in extension.js
		newCommand.command = "find-and-transform.selectDigitInCompletion";
		newCommand.title = "Select the digit 'n' in completionItem";
		newCommand.arguments = [key, replaceRange];
		item.command = newCommand;
	}

	return item;
}