const vscode = require('vscode');
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
						// 	"command": "findInCurrentFile",
						// 	"args": {
						// 		"find"              : "<string>",
						// 		"replace"           : "<string>",
						// 		"restrictFind  "    : "selections"        // or "document"
						// 	}
						// }

					const linePrefix = document.lineAt(position).text.substr(0, position.character);
					// if ((linePrefix.search(/^\s*"$/) === -1)) return;

					let find = false;
					let search = false;
					if (linePrefix.search(/^\s*"command":\s*"(findInCurrentFile)./) !== -1) find = true;
					if (linePrefix.search(/^\s*"command":\s*"(runInSearchPanel)./) !== -1) search = true;

					if (find || search) {

						let thisExtension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
						let packageCommands = thisExtension.packageJSON.contributes.commands;

						let completionArray = [];

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

					// // in 'args' options keys intellisense/completions
					const firstLine = document.lineAt(0);
					let curStartRange = new vscode.Range(firstLine.range.start, position);

					const argsStartingIndex = document.getText(curStartRange).lastIndexOf('"args"');

					const previousLine = document.lineAt(document.positionAt(argsStartingIndex).line-1).text;

					if (previousLine.search(/^\s*"command":\s*"(findInCurrentFile)./) !== -1) find = true;
					else if (previousLine.search(/^\s*"command":\s*"(runInSearchPanel)./) !== -1) search = true;
					else return undefined;

					let lastLine = document.lineAt(document.lineCount - 1);

					const argSearchRange = new vscode.Range(document.positionAt(argsStartingIndex), lastLine.range.end);
					const argsClosingIndex = document.getText(argSearchRange).match(/^\s*}/m).index;

					const argsRange = new vscode.Range(document.positionAt(argsStartingIndex), document.positionAt(argsClosingIndex + argsStartingIndex + 1));
					const argsText = document.getText(argsRange);

					if (!argsRange.contains(position) || linePrefix.search(/^\s*"/m) === -1) return undefined;

					if (find && argsRange.contains(position) && linePrefix.endsWith('"restrictFind": "')) {
						return [
							_makeCompletionItem("selections", position, "document"),
							_makeCompletionItem("document", position, "document")
						];
					}

					const searchArgsRegex = /^\s*"(find|replace|triggerSearch|isRegex|filesToInclude|preserveCase|useExcludeSettingsAndIgnoreFiles|isCaseSensitive|matchWholeWord|filesToExclude)"\s*:\s*"/;

					if (search && argsRange.contains(position) && linePrefix.search(searchArgsRegex) !== -1)
						return _makeSearchArgsCompletions(position, linePrefix);

					const runFindArgs = findCommands.getKeys().slice(1);
					const runSearchArgs = searchCommands.getKeys().slice(1);

					// eliminate any options already used
					if (find && (linePrefix.search(/^\s*"(find|replace|restrictFind)"\s*:\s*"/) === -1)) {
						return _filterCompletionsItemsNotUsed(runFindArgs, argsText, position);
					}
					else if (search && (linePrefix.search(searchArgsRegex) === -1)) {
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

        if (linePrefix.search(/^\s*"/) === -1) {
          return undefined;
        }

        // check that cursor position is within either "findInCurrentFile/runInSearchPanel" setting
        let fullText = document.getText();
				const findSettingRegex   = /(?<setting>"findInCurrentFile")/;
				const searchSettingRegex = /(?<setting>"runInSearchPanel")/;

				let findSettingsMatch = fullText.match(findSettingRegex);
				let searchSettingsMatch = fullText.match(searchSettingRegex);

				let findSettingsText;
				let searchSettingsText;

				// limit fullText to start of "findInCurrentFile" to end of file
				if (findSettingsMatch.index) findSettingsText = fullText.substring(findSettingsMatch.index);
				if (searchSettingsMatch.index) searchSettingsText = fullText.substring(searchSettingsMatch.index);

				if (!findSettingsMatch.index || !searchSettingsMatch.index) return undefined;

				let settingsRange;
				let find = false;
				let search = false;

				// possible for index to be 0? Don't think so.
				if (findSettingsMatch.index)  // is cursor in the 'findInCurrentFile' setting
					settingsRange = _findSettingRange(findSettingsMatch.index, findSettingsText, document);

				if (!settingsRange.contains(position)) {// is cursor in the 'runInSearchPanel' setting
					settingsRange = _findSettingRange(searchSettingsMatch.index, searchSettingsText, document);
					if (settingsRange.contains(position)) search = true;
				}
				else find = true;

				if (!settingsRange.contains(position)) return undefined;  // cursor is neither setting

				// 	const re = /({)|(})/;
				// 	let brackets = 0;
				// 	let offset = findSettingsMatch.index;
				// 	let match;

				// 	// count braces until matching closing brace; will be end of this setting
				// 	do {
				// 		match = findSettingsText.match(re);
				// 		if (match[0] === '{') ++brackets;
				// 		if (match[0] === '}') --brackets;

				// 		if (brackets) {
				// 			offset += match.index + 1;
				// 			findSettingsText = findSettingsText.substring(match.index + 1);
				// 		}
				// 		else offset += match.index;
				// 	} while (brackets);

				// 	/** @type { vscode.Position } */
				// 	let settingStartPos;
				// 	let settingEndPos;

				// 	if (findSettingsMatch?.index) {
				// 		settingStartPos = document.positionAt(findSettingsMatch.index);  // start of setting
				// 		settingEndPos = document.positionAt(findSettingsMatch.index + offset);  // end of setting
				// 	}
				// 	else return undefined;

				// 	settingsRange = new vscode.Range(settingStartPos, settingEndPos);
				// }
				// if (!settingsRange.contains(position)) return undefined;  // cursor is not in the 'find-and-transform' setting

				if (linePrefix.search(/"restrictFind":\s*"$/) !== -1) {
					return [
						_makeCompletionItem("selections", position, "document"),
						_makeCompletionItem("document", position, "document")
					];
				}

				const findKeyArray = findCommands.getKeys();
				const findDefaults = findCommands.getDefaults();

				const searchKeyArray = searchCommands.getKeys();
				const searchDefaults = searchCommands.getDefaults();

        let completionItemArray = [];

				// does not filter out used keys  TODO
				if (linePrefix.search(/^\s*"$/) !== -1) {

					if (find) {
						for (const item in findKeyArray) {
							completionItemArray.push(_makeCompletionItem(findKeyArray[item], position, findDefaults[item]));
						}
					}
					else if (search) {
						for (const item in searchKeyArray) {
							completionItemArray.push(_makeCompletionItem(searchKeyArray[item], position, searchDefaults[item]));
						}
					}
        	return completionItemArray;
				}
				else return undefined;
      }
    },
    '"'  // trigger intellisense/completion
  );

  context.subscriptions.push(settingsCompletionProvider);
}

function _findSettingRange(index, settingsText, document) {

	const re = /({)|(})/;
	let brackets = 0;
	// let offset = index;
	let offset = 0;
	let match;

	// count braces until matching closing brace; will be end of this setting
	do {
		match = settingsText.match(re);
		if (match[0] === '{') ++brackets;
		if (match[0] === '}') --brackets;

		if (brackets) {
			offset += match.index + 1;
			settingsText = settingsText.substring(match.index + 1);
		}
		else offset += match.index;
	} while (brackets);

	/** @type { vscode.Position } */
	let settingStartPos;
	let settingEndPos;

	if (index) {
		settingStartPos = document.positionAt(index);  // start of setting
		settingEndPos = document.positionAt(index + offset);  // end of setting
	}
	else return undefined;

	return new vscode.Range(settingStartPos, settingEndPos);
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
				// filesToInclude: "",                      // default is $file = current file
				// preserveCase: true,                      // default is true
				// useExcludeSettingsAndIgnoreFiles: true,  // default is true
				// isCaseSensitive: true,                   // default is true
				// matchWholeWord: false,                   // default is false
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
	if (linePrefix.endsWith('"filesToInclude": "')) {
		return [
			_makeCompletionItem("${file}", position, "${file}", "01"),
			_makeCompletionItem("", position, "${file}", "02")
		];
	}
	else if (linePrefix.endsWith('"filesToExclude": "')) {
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

	let item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Text);

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
	// 	"restrictFind": "document",   							// else "selections"
	// 	"triggerSearch": true,                    	// default is true
	// 	"isRegex": true,                           	// default is true
	// 	"filesToInclude": "${file}",               	// default is ${file} = current file
	// 	"preserveCase": true,                      	// default is true
	// 	"useExcludeSettingsAndIgnoreFiles": true,  	// default is true
	// 	"isCaseSensitive": true,                   	// default is true
	// 	"matchWholeWord": false,                   // default is false
	// 	"filesToExclude": ""                			 	// default is ""
	// };

	const defaults = searchCommands.getDefaults();

	const priority = {
		"find": "01",
		"replace": "02",
		"restrictFind": "03",
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
	let completionArray = [];

	// doesn't account for commented options
	// have to use something other than 'includes'
	argArray.forEach(option => {
		if (!argsText.includes(`"${ option }"`))
				completionArray.push(_makeCompletionItem(option, position, defaults[`${ option }`], priority[`${ option }`]));
	});

	return completionArray;
}