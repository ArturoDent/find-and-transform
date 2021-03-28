const vscode = require('vscode');


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
						// 	"command": "find-and-tranform.run",
						// 	"args": {
						// 		"find"              : "<string>",
						// 		"replace"           : "<string>",
						// 		"restrictFind  "    : "selections"        // or "document"
						// 	}
						// }

					const linePrefix = document.lineAt(position).text.substr(0, position.character);

					if (linePrefix.endsWith('"find-and-transform.')) {
						return [
							_makeCompletionItem('run', position, null)
							// get commands from package.json or settings?
						];
					}

					// in 'args' options keys intellisense/completions
					const firstLine = document.lineAt(0);
					let curStartRange = new vscode.Range(position, firstLine.range.start);

					const lastCommandIndex = document.getText(curStartRange).lastIndexOf("find-and-transform");
					const commandLinePos = document.positionAt(lastCommandIndex);
					const commandSearch = [...document.lineAt(commandLinePos).text.matchAll(/find-and-transform\.(?<command>[^"]+)/g)];

					let command;
					if (commandSearch.length) command = commandSearch[0].groups?.command;
					else return undefined;  // notify no command TODO

					// next line after command should be "args": {}
					const lineAfterCommand = document.lineAt(commandLinePos.line + 1);
					if (lineAfterCommand.text.search(/"args"\s*:\s*{/g) === -1) return undefined;

					const argsStartingIndex = document.offsetAt(lineAfterCommand.range.start);
					let lastLine = document.lineAt(document.lineCount - 1);

					const argSearchRange = new vscode.Range(new vscode.Position(commandLinePos.line + 1, 0), lastLine.range.end);
					const argsClosingIndex = document.getText(argSearchRange).indexOf("}");

					const argsRange = new vscode.Range(lineAfterCommand.range.end, document.positionAt(argsClosingIndex + argsStartingIndex + 1));
					const argsText = document.getText(argsRange);

					if (!argsRange.contains(position) || linePrefix.search(/^\s*"/m) === -1) return undefined;

					// TODO: should restrict this to in the 'find-and-transform.run' keybinding
					if (argsRange.contains(position) && linePrefix.endsWith('"restrictFind": "')) {
						return [
							_makeCompletionItem("selections", position, "document"),
							_makeCompletionItem("document", position, "document")
						];
					}

					const argArray = ["find", "replace", "restrictFind"];

					// eliminate any options already used
					if (command === "run" && (linePrefix.search(/^\s*"(find|replace|restrictFind)"\s*:\s*"/) === -1)) {
						return _filterCompletionsItemsNotUsed(argArray, argsText, position);
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

				// "find-and-transform": {
				// 	"upcaseSelectedKeywords": [
				// 		{ "title": "Uppercase selected Keywords" },
				// 		{ "find": "((c[^e]+)eate|select|sum|drop|table|exists)" },
				// 		{ "replace": "+\\U$1+" }
				// 	]
				// }

        // get all text until the current `position` and check if it reads `\  {  "` before the cursor
        const linePrefix = document.lineAt(position).text.substr(0, position.character);

        if (linePrefix.search(/^\s*{\s*"/) === -1) {
          return undefined;
        }

        // check that cursor position is within the "find-and-transform" setting
        let fullText = document.getText();
				let settingRegex = /(?<setting>"find-and-transform")/;  // our 'find-and-transform' setting

				let settingsMatch = fullText.match(settingRegex);
				// limit fullText to start of "find-and-transform" to end of file
				if (settingsMatch.index) fullText = fullText.substring(settingsMatch.index);
				else return;

				const re = /({)|(})/;
				let brackets = 0;
				let offset = settingsMatch.index;
				let match;

				// count braces until matching closing brace; will be end of this setting
				do {
					match = fullText.match(re);
					if (match[0] === '{') ++brackets;
					if (match[0] === '}') --brackets;

					if (brackets) {
						offset += match.index + 1;
						fullText = fullText.substring(match.index+1);
					}
					else offset += match.index;
				} while (brackets);


				/** @type { vscode.Position } */
        let settingStartPos;
				let settingEndPos;

				if (settingsMatch?.index) {
					settingStartPos = document.positionAt(settingsMatch.index);  // start of setting
					settingEndPos = document.positionAt(settingsMatch.index + offset);  // end of setting
				}
				else return undefined;

				let settingsRange = new vscode.Range(settingStartPos, settingEndPos);
				if (!settingsRange.contains(position)) return undefined;  // cursor is not in the 'find-and-transform' setting

				if (linePrefix.search(/"restrictFind":\s*"$/) !== -1) {
					return [
						_makeCompletionItem("selections", position, "document"),
						_makeCompletionItem("document", position, "document")
					];
				}

				const keyArray = ["title", "find", "replace", "restrictFind"];
				const defaults = {
														"title": "",
														"find": "",
														"replace": "",
														"restrictFind": "document"
													};

        let completionItemArray = [];

				// does not filter out used keys
				if (linePrefix.search(/^\s*{\s*"$/) !== -1) {
					for (const item in keyArray) {
						completionItemArray.push(_makeCompletionItem(keyArray[item], position, defaults[item]));
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


/**
 * From a string input make a CompletionItemKind.Text
 *
 * @param {String} key
 * @param {vscode.Position} position
 * @param {String} defaultValue - default value for this option
 * @returns {vscode.CompletionItem} - CompletionItemKind.Text
 */
function _makeCompletionItem(key, position, defaultValue) {

	let item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Text);
	item.range = new vscode.Range(position, position);
	if (defaultValue) item.detail = `default: ${ defaultValue }`;
  return item;
}

/**
 * Make CompletionItem arrays, eliminate already used option keys found in the args text
 *
 * @param {String[]} argArray - options for forward or backward commands
 * @param {String} argsText - text of the 'args' options:  "args": { .... }
 * @param {vscode.Position} position - cursor position
 * @returns {Array<vscode.CompletionItem>}
 */
function _filterCompletionsItemsNotUsed(argArray, argsText, position) {

	const defaults = {
		"find": "",
		"replace": "",
		"restrictFind": "document"   // else "selections"
	}

	/** @type { Array<vscode.CompletionItem> } */
	let completionArray = [];

	// doesn't account for commented options
	// have to use something other than 'includes'
	argArray.forEach(option => {
		if (!argsText.includes(`"${option}"`)) completionArray.push(_makeCompletionItem(option, position, defaults[`${option}`]));
	});

	return completionArray;
}