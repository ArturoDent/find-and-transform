const { languages, CodeAction, CodeActionKind } = require('vscode');


/**
 * Create codeActions to use on save from settings
 * @param {import("vscode").ExtensionContext} context
 */
exports.makeCodeActionProvider = async function (context, codeActionCommands) {

	context.subscriptions.push(
		languages.registerCodeActionsProvider('*',
			{
				async provideCodeActions() {

					const commandArray = [];

					for await (const command of codeActionCommands) {
						commandArray.push(_createCommand(command));
					}
					return commandArray;
				}
			},
			{
				providedCodeActionKinds: [CodeActionKind.Source]
			})
	);
}

/**
 * Make a codeAction from a setting command
 * @param {Array} command - one command from the findInCurrentFile settings
 * @returns {CodeAction}
 */
function _createCommand(command) {
	const action = new CodeAction(`${command[1].title}`, CodeActionKind.Source.append(`${command[0]}`));
	action.command = { command: `findInCurrentFile.${command[0]}`, title: `${command[1].title}` };
	return action;
}