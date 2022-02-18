const vscode = require('vscode');

/**
 * Create codeActions to use on save from settings
 * @param {vscode.ExtensionContext} context
 */
exports.makeCodeActionProvider = async function (context, codeActionCommands) {

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider('*',
			{
				provideCodeActions() {

					const commandArray = [];

					for (const command of codeActionCommands) {
						commandArray.push(_createCommand(command));
					}
					return commandArray;
				}
			},
			{
				providedCodeActionKinds: [vscode.CodeActionKind.Source]
			})
	);
}

/**
 * Make a codeAction from a setting command
 * @param {Array} command - one command from the findInCurrentFile settings
 * @returns {vscode.CodeAction}
 */
function _createCommand(command) {
	const action = new vscode.CodeAction(`${command[1].title}`, vscode.CodeActionKind.Source.append(`${command[0]}`));
	action.command = { command: `findInCurrentFile.${command[0]}`, title: `${command[1].title}` };
	return action;
}