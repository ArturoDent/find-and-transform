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
						completionArray.push(_makeCompletionItem(pcommand.command.replace(/^.*\./, ""), position, null));
					}
					else if (search && pcommand.command.startsWith("runInSearchPanel")) {
						completionArray.push(_makeCompletionItem(pcommand.command.replace(/^.*\./, ""), position, null));
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

			if (find && argsRange.contains(position) && linePrefix.endsWith('"restrictFind": "')) {
				return [
					_makeCompletionItem("selections", position, "document"),
					_makeCompletionItem("line", position, "document"),
					_makeCompletionItem("once", position, "document"),
					_makeCompletionItem("document", position, "document"),
					_makeCompletionItem("nextSelect", position, "document"),
					_makeCompletionItem("nextMoveCursor", position, "document"),
					_makeCompletionItem("nextDontMoveCursor", position, "document")
				];
			}

			const searchArgsRegex = /^\s*"(find|replace|triggerSearch|isRegex|filesToInclude|preserveCase|useExcludeSettingsAndIgnoreFiles|isCaseSensitive|matchWholeWord|filesToExclude)"\s*:\s*"/;

			if (search && argsRange.contains(position) && linePrefix.search(searchArgsRegex) !== -1)
				return _makeSearchArgsCompletions(position, linePrefix);

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
      '.', '"'   // trigger intellisense/completion
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

				// is this duplicated above?
				if (linePrefix.search(/"restrictFind":\s*"$/m) !== -1) {
					return [
						_makeCompletionItem("selections", position, "document"),
						_makeCompletionItem("line", position, "document"),
						_makeCompletionItem("once", position, "document"),
						_makeCompletionItem("document", position, "document"),
						_makeCompletionItem("nextSelect", position, "document"),
						_makeCompletionItem("nextMoveCursor", position, "document"),
						_makeCompletionItem("nextDontMoveCursor", position, "document")
					];
				}
				else if (linePrefix.search(/"filesToExclude":\s*"$/m) !== -1) {
					return [
						_makeCompletionItem("", position, ""),
					];
				}

				// const runFindArgs = findCommands.getKeys().slice(1);     // remove title
				// const runSearchArgs = searchCommands.getKeys().slice(1); // remove title
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
    '"'  // trigger intellisense/completion
  );

  context.subscriptions.push(settingsCompletionProvider);
}


/**
 * Make the Completions for the searchInFindPanel args keys (if not simply boolean)
 * @param   {vscode.Position} position
 * @param   {String} linePrefix
 * @returns {Array | undefined}
 */
function _makeSearchArgsCompletions(position, linePrefix) {

		// find: "",
		// replace: "",
		// triggerSearch: true,                     // default is true
		// isRegex: true,                           // default is true
		// filesToInclude: "",                      // default is "" = current workspace
		// preserveCase: true,                      // default is true
		// useExcludeSettingsAndIgnoreFiles: true,  // default is true
		// isCaseSensitive: true,                   // default is true
		// matchWholeWord: true,                   // default is true
		// filesToExclude: "./*.css"                // default is ""

	// if (linePrefix.endsWith('"triggerSearch": "')) {
	// 	return [
	// 		_makeCompletionItem("true", position, true, "01"),
	// 		_makeCompletionItem("false", position, true, "02")
	// 	];
	// }
	// else if (linePrefix.endsWith('"isRegex": "')) {
	// 	return [
	// 		_makeCompletionItem("true", position, true, "01"),
	// 		_makeCompletionItem("false", position, true, "02")
	// 	];
	// }
	// else if (linePrefix.endsWith('"preserveCase": "')) {
	// 	return [
	// 		_makeCompletionItem("true", position, true, "01"),
	// 		_makeCompletionItem("false", position, true, "02")
	// 	];
	// }
	// else if (linePrefix.endsWith('"useExcludeSettingsAndIgnoreFiles": "')) {
	// 	return [
	// 		_makeCompletionItem("true", position, true, "01"),
	// 		_makeCompletionItem("false", position, true, "02")
	// 	];
	// }
	// else if (linePrefix.endsWith('"isCaseSensitive": "')) {
	// 	return [
	// 		_makeCompletionItem("true", position, true, "01"),
	// 		_makeCompletionItem("false", position, true, "02")
	// 	];
	// }
	// else if (linePrefix.endsWith('"matchWholeWord": "')) {
	// 	return [
	// 		_makeCompletionItem("true", position, false, "02"),
	// 		_makeCompletionItem("false", position, false, "01")
	// 	];
	// }
	// else

	if (linePrefix.endsWith('"filesToExclude": "')) {
		return [
			_makeCompletionItem("", position, ""),
		];
	}
	else return undefined;
}

/**
 * From a string input make a CompletionItemKind.Text
 *
 * @param   {String} key
 * @param   {vscode.Position} position
 * @param   {String|Boolean} defaultValue - default value for this option
 * @returns {vscode.CompletionItem} - CompletionItemKind.Text
 */
function _makeCompletionItem(key, position, defaultValue, sortText) {

	const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Text);

	item.range = new vscode.Range(position, position);
	if (defaultValue) item.detail = `default: ${ defaultValue }`;
	if (sortText) item.sortText = sortText;

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

	// const defaults = {
	// 	"find": "",
	// 	"replace": "",
	// 	"restrictFind": "document",   // else selections/line/once/nextSelect/nextMoveCursor/nextDontMoveCursor
	//  "cursorMoveSelect": "",                     // ignored if no replace
	// 	"triggerSearch": true,                    	// default is true
	// 	"isRegex": true,                           	// default is true
	// 	"filesToInclude": "",               	      // default is "" = current workspace
	// 	"preserveCase": true,                      	// default is true
	// 	"useExcludeSettingsAndIgnoreFiles": true,  	// default is true
	// 	"isCaseSensitive": true,                   	// default is true
	// 	"matchWholeWord": false,                    // default is false
	// 	"filesToExclude": ""                		    // default is ""
	// };

	const defaults = searchCommands.getDefaults();

	const priority = {
		"title": "01",
		"find": "011",
		"replace": "02",
		"restrictFind": "03",
		"cursorMove": "031",
		"triggerSearch": "04",
		"isRegex": "05",
		"filesToInclude": "06",
		"preserveCase": "07",
		"useExcludeSettingsAndIgnoreFiles": "08",
		"isCaseSensitive": "09",
		"matchWholeWord": "091",
		"filesToExclude": "092"
	};

	/** @type { Array<vscode.CompletionItem> } */
	const completionArray = [];

	// account for commented options (in keybindings and settings)
	argArray.forEach(option => {
		if (argsText.search(new RegExp(`^[ \t]*"${option}"`, "gm")) === -1)
			completionArray.push(_makeCompletionItem(option, position, defaults[`${ option }`], priority[`${ option }`]));
	});

	return completionArray;
}