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

      // {
			// 	"key": "alt+r",
			// 	"command": "findInCurrentFile",  // runInSearchPanel
			// 	"args": {
			// 		"find"              : "<string>",
			// 		"replace"           : "<string>",
			// 		"restrictFind"      : "selections",  // or document/line/once/nextSelect/nextMoveCursor/nextDontMoveCursor
			// 		"cursorMove"        : "<string>"
			// 	}
			// }

			const linePrefix = document.lineAt(position).text.substr(0, position.character);

			// ---------------    $ completion for 'filesToInclude/filesToInclude/find/replace' completions   ------

			// these are not strictly limited to this extension's keybindings, but is to "file": "${" so okay for now
			let re$ = /^\s*"(find|replace|filesToInclude|filesToExclude)"\s*:\s*".*\$$/;
			if (linePrefix.substring(0, position.character).search(re$) !== -1)  {
				return _completeVariables(position, '$');
			}

			// ---------------    command completion start   ----------------------------

			let find = false;
			let search = false;
			if (linePrefix.search(/^\s*"command":\s*"(findInCurrentFile)./) !== -1) find = true;
			if (linePrefix.search(/^\s*"command":\s*"(runInSearchPanel)./) !== -1) search = true;

			if (find || search) {

				const thisExtension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
				const packageCommands = thisExtension.packageJSON.contributes.commands;

				const completionArray = [];

				packageCommands.forEach(pcommand => {
					// "command": "findInCurrentFile.upcaseSwap2",
					if (find && pcommand.command.startsWith("findInCurrentFile")) {
						completionArray.push(_makeCompletionItem(pcommand.command.replace(/^.*\./, ""), new vscode.Range(position, position), null));
					}
					else if (search && pcommand.command.startsWith("runInSearchPanel")) {
						completionArray.push(_makeCompletionItem(pcommand.command.replace(/^.*\./, ""), new vscode.Range(position, position), null));
					}
				});
				return completionArray;
			}
			// ---------------    command completion end   ----------------------------

			// ---------------    args completion start   ----------------------------

			const rootNode = jsonc.parseTree(document.getText());
			const node = jsonc.findNodeAtOffset(rootNode, document.offsetAt(position));
			const curLocation = jsonc.getLocation(document.getText(), document.offsetAt(position));

			const thisKeybinding = node.parent?.parent?.parent?.parent?.children[1]?.children[1]?.value;
			if (thisKeybinding === 'findInCurrentFile') find = true;
			else if (thisKeybinding === 'runInSearchPanel') search = true;
			else return undefined;  // not in our keybindings

			if (curLocation?.path[1] !== 'args') return undefined;

			const argNode = node.parent.parent.parent.children;
			const argsStartingIndex = argNode[0]?.offset;
			const argsLength = argNode[0]?.length + argNode[1]?.length;

			const argsRange = new vscode.Range(document.positionAt(argsStartingIndex), document.positionAt(argsLength + argsStartingIndex + 1));
			const argsText = document.getText(argsRange);

			if (!argsRange.contains(position) || linePrefix.search(/^\s*"/m) === -1) return undefined;

			let reRestrictFind = /^\s*"restrictFind"\s*:\s*"$/;
			if (find && argsRange.contains(position) && linePrefix.search(reRestrictFind) !== -1)
				return _completeRestrictFindValues(position);

			// linePrefix.endsWith('$', position.character)  TODO is this all correct
					re$ = /^\s*"(filesToInclude|filesToExclude)"\s*:\s*"$/;
			if (search && argsRange.contains(position) && linePrefix.substring(0, position.character).search(re$) !== -1) {
				return _completeVariables(position, "");
			}

			// not included because only 'filesToExclude' handled in _makeSearchArgsCompletions()
			// const searchArgsRegex = /^\s*"(find|replace|triggerSearch|triggerReplaceAll|isRegex|filesToInclude|preserveCase|useExcludeSettingsAndIgnoreFiles|isCaseSensitive|matchWholeWord|filesToExclude)"\s*:\s*"/;
			// if (search && argsRange.contains(position) && linePrefix.search(searchArgsRegex) !== -1)
			// 	return _makeSearchArgsCompletions(position, linePrefix);

			const runFindArgs = findCommands.getKeys().slice(1);       // remove title
			const runSearchArgs = searchCommands.getKeys().slice(1); // remove title

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
      '.', '"', '$'   // trigger intellisense/completion
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

		// 	"findInCurrentFile": {
		//     "upcaseSwap2": {
		// 			"title": "swap iif <==> hello",
		// 			"find": "(iif) (hello)",
		// 			"replace": "_\\u$2_ _\\U$1_",  // double-escaped case modifiers
		//     }
		// 	},

		// // non-fixed width lookbehind works in find but not in search
		// 	"runInSearchPanel": {
		// 		"removeDigits": {
		// 			"title": "Remove digits from Art....",
		// 			"find": "(?<=Arturo)\\d+",   // double-escaped
		// 			"replace": "",
		//      ""
		// 		}
		// 	}

        // get all text until the current `position` and check if it reads `  {  "` before the cursor
				const linePrefix = document.lineAt(position).text.substr(0, position.character);
				let find = false;
				let search = false;

				// ---------------    $ completion for 'filesToInclude/filesToExclude/find/replace' completions   ------

				// these are not strictly limited to this extension's keybindings, but is to "file": "${" so okay for now
				let re$ = /^\s*"(find|replace|filesToInclude|filesToExclude)"\s*:\s*".*\${$/;
				if (linePrefix.substring(0, position.character).search(re$) !== -1) {
					return _completeVariables(position, '${');
				}

				// -----------------------------------------------------------------------

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

				let keysText = "";

				if (curLocation.isAtPropertyKey && subCommand) {
					const subCommandNode = node.parent.parent.parent.children[1];
					const keysRange = new vscode.Range(document.positionAt(subCommandNode.offset), document.positionAt(subCommandNode.offset + subCommandNode.length + 1));
					keysText = document.getText(keysRange);
				}

				if (linePrefix.search(/"restrictFind":\s*"$/m) !== -1) 
					return _completeRestrictFindValues(position);
				else if (linePrefix.search(/"filesToExclude":\s*"$/m) !== -1) {
					return [
						_makeCompletionItem("", new vscode.Range(position, position), ""),
					];
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
    '"', '{'  // trigger intellisense/completion
  );

  context.subscriptions.push(settingsCompletionProvider);
}


// /**
//  * Make the Completions for the searchInFindPanel args keys (if not simply boolean)
//  * @param   {vscode.Position} position
//  * @param   {String} linePrefix
//  * @returns {Array | undefined}
//  */
// function _makeSearchArgsCompletions(position, linePrefix) {

// 	let re = /^\s*"filesToExclude"\s*:\s*"$/;

// 	// if (linePrefix.endsWith('"filesToExclude": "')) {
// 	if (linePrefix.search(re) !== -1) {
// 		return [
// 			_makeCompletionItem("", position, ""),
// 		];
// 	}
// 	else return undefined;

	// if (linePrefix.endsWith('"triggerSearch": "')) {
	// 	return [
	// 		_makeCompletionItem("true", position, true, "01"),
	// 		_makeCompletionItem("false", position, true, "02")
	// 	];
	// }
	// else
// }

/**
 * From a string input make a CompletionItemKind.Text
 *
 * @param   {String} key
 * @param   {vscode.Range} replaceRange
 * @param   {String|Boolean} defaultValue - default value for this option
 * @returns {vscode.CompletionItem} - CompletionItemKind.Text
 */
function _makeCompletionItem(key, replaceRange, defaultValue, sortText, documentation) {

	const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Text);

	// item.range = new vscode.Range(replaceRange, replaceRange);
	item.range = replaceRange;
	if (defaultValue) item.detail = `default: ${ defaultValue }`;
	if (sortText) item.sortText = sortText;
	if (documentation) item.documentation = new vscode.MarkdownString(documentation);

  return item;
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
		"restrictFind": "03",
		"cursorMove": "031",
		"triggerSearch": "04",
		"triggerReplaceAll": "041",
		"filesToInclude": "05",
		"filesToExclude": "051",
		"useExcludeSettingsAndIgnoreFiles": "052",
		"isRegex": "06",
		"preserveCase": "07",
		"isCaseSensitive": "08",
		"matchWholeWord": "081",
	};

	/** @type { Array<vscode.CompletionItem> } */
	const completionArray = [];

	// account for commented options (in keybindings and settings)
	argArray.forEach(option => {
		if (argsText.search(new RegExp(`^[ \t]*"${option}"`, "gm")) === -1)
			completionArray.push(_makeCompletionItem(option, new vscode.Range(position, position), defaults[`${ option }`], priority[`${ option }`]));
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
	// if (dollarSign) position = new vscode.Position(position.line, position.character - dollarSign.length);
	let replaceRange;
	if (dollarSign) replaceRange = new vscode.Range(position.line, position.character - dollarSign.length, position.line, position.character);
	else replaceRange = new vscode.Range(position, position);

	return [
		_makeCompletionItem("${file}", replaceRange, "", "01", "The full path of the current editor."),
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
 * Make completion items for 'restrictFind' values with priority
 * 
 * @param   {vscode.Position} position
 * @returns {Array<vscode.CompletionItem>}
 */
function _completeRestrictFindValues(position) {

	return [
		_makeCompletionItem("document", new vscode.Range(position, position), "document", "01"),
		_makeCompletionItem("selections", new vscode.Range(position, position), "document", "02"),

		_makeCompletionItem("once", new vscode.Range(position, position), "document", "03"),
		_makeCompletionItem("line", new vscode.Range(position, position), "document", "04"),

		_makeCompletionItem("nextSelect", new vscode.Range(position, position), "document", "05"),
		_makeCompletionItem("nextMoveCursor", new vscode.Range(position, position), "document", "06"),
		_makeCompletionItem("nextDontMoveCursor", new vscode.Range(position, position), "document", "07")
	];
}