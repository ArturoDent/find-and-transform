const {commands, window, Selection} = require('vscode');
// const registerCommands = require('./registerCommands');
const resolve = require('./resolveVariables');



/**
 * From drivers.js: for preCommands and search postCommands
 * Execute the pre/post commands, which are vscode commands and may have args
 * @param {string | string[] | object} userCommands
 * @param {string}  preOrPost - "preCommands" or "postCommands"
 */
exports.run = async function (userCommands, preOrPost) {

  // no variable resolution here, or getInput

  if (preOrPost === "postCommands") await new Promise(r => setTimeout(r, 300));  // slight pause before postCommands

  // resolve variables here, like $1?

  if (typeof userCommands === 'string') await commands.executeCommand(userCommands);

  else if (typeof userCommands === 'object' && !Array.isArray(userCommands))
    await commands.executeCommand(userCommands.command, userCommands.args);

  else if (Array.isArray(userCommands) && userCommands.length)
    // there is a bug in runCommands or copy/paste, see https://github.com/microsoft/vscode/issues/190831
    await commands.executeCommand('runCommands', {commands: userCommands});
};

/**
 * Poll document.getText().length until two consecutive reads agree, to work around
 * the same command/document timing lag noted above (a command like "type" can
 * resolve its promise before its edit is fully reflected in the document) - used by
 * onEveryMatch's cumulative-offset tracking, which needs an accurate length delta
 * between each postCommand run.
 * @param {import("vscode").TextDocument} document
 * @param {number} [timeoutMs]
 * @returns {Promise<number>} the settled length
 */
async function _settledDocumentLength(document, timeoutMs = 2000) {

  let length = document.getText().length;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 50));
    const newLength = document.getText().length;
    if (newLength === length) return length;
    length = newLength;
  }
  return length;
}

/**
 * Run the args.postCommands and args.runPostCommands, no return
 * 
 * @param {Object} args
 * @param {Array} foundMatches
 * @param {import("vscode").Selection[] | readonly import("vscode").Selection[]} foundSelections
 * @param {import("vscode").Selection} selection - editor.selection
 * 
 */
exports.runPost = async function (args, foundMatches, foundSelections, selection) {

  let postCommands = args.postCommands;
  const editor = window.activeTextEditor;
  if (!editor) return;


  // await _prePostHasVariable(args.postCommands);

  // does this work for a single object? No
  const argHasText = (command) => {
    return command?.args?.text;  // && check if variable in text?  'snippet' as well TODO
    // return command?.args?.text || command?.args?.lineNumber;  // && check if variable in text?
  };

  const resolvePostCommands = (Array.isArray(args.postCommands) && args.postCommands?.some(argHasText)) || args.postCommands?.args?.text;


  // handles array or a single object
  // if ((Array.isArray(args.postCommands) && args.postCommands?.some(argHasText)) || args.postCommands?.args?.text) {

  if (args.runPostCommands === "onceAlways") {
    if (resolvePostCommands) postCommands = await _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, 0);
    await exports.run(postCommands, "postCommands");  // ignore matches, run once
  }

  else if (foundMatches.length) {
    if (args.runPostCommands === "onEveryMatch") {
      let index = 0;
      // foundSelections are all computed up front, against the document as it was
      // BEFORE any postCommand ran - so once postCommands for an earlier match have
      // actually edited the document (e.g. a "type" command replacing a
      // shorter/longer match), every later foundSelection's position is stale by
      // however much the document has grown or shrunk so far. Track that drift as a
      // running character-offset delta and shift each selection by it before using it.
      //
      // Captured as raw character offsets up front, once - re-deriving an offset
      // from a *stored* Position later (via document.offsetAt(storedPosition)) is
      // unreliable once the document has since shrunk, because offsetAt() silently
      // clamps a Position that's now out of range to the document's current end
      // instead of erroring, which quietly truncates later selections. Working in
      // plain offset arithmetic from here on sidesteps that entirely.
      let cumulativeOffset = 0;
      const document = editor.document;
      const originalOffsets = foundSelections.map(sel => ({
        start: document.offsetAt(sel.start),
        end: document.offsetAt(sel.end),
      }));

      for (const { start, end } of originalOffsets) {

        const adjustedSelection = new Selection(
          document.positionAt(start + cumulativeOffset),
          document.positionAt(end + cumulativeOffset)
        );

        if (resolvePostCommands) {
          editor.selections = [adjustedSelection];  // TODO: if preserveSelections ?
          postCommands = await _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, index);
        }

        const lengthBeforeThisPostCommand = await _settledDocumentLength(document);
        await exports.run(postCommands, "postCommands");
        cumulativeOffset += await _settledDocumentLength(document) - lengthBeforeThisPostCommand;

        index++;
      };
    }

    // TODO: how to check for escaping out of ${getInput} and so do not run postCommand?

    else if (!args.runPostCommands || args.runPostCommands === "onceIfAMatch") { // uses first match and first selection = editor.selection
      if (resolvePostCommands) {
        editor.selections = [foundSelections[0]];  // if preserveSelections ?
        postCommands = await _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, 0);
      }
      await exports.run(postCommands, "postCommands");
    }
  }
  else if (args.runPostCommands === "onceOnNoMatches") {
    if (resolvePostCommands) postCommands = await _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, 0);
    // postCommands = await _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, 0);
    await exports.run(postCommands, "postCommands");  // no matches, run once
  }
};



/**
 * Does the command object (could be preCommands or postCommands) contain any variables to be resolved.
 * Like ${getInput} for example, loop through all arguments to each command
 *
 * @param {Object} commands - an array of commands or a single command
 * @returns 
 **/
// async function _prePostHasVariable (commands) {

//   if (typeof commands === 'string') return false;

//   // if array, loop through all commands
//   // if !== array, loop through each argument to that command

//   if (Array.isArray(commands)) {

//     for await (const command of commands) {
//       const args = command.args;
//     }
//   }
// }



/**
 * Resolve any variables in the args.postCommands
 * 
 * @param {Object} args
 * @param {Array} foundMatches
 * @param {import("vscode").Selection[] | readonly import("vscode").Selection[]} foundSelections
 * @param {import("vscode").Selection} selection - the editor.selection
 * @param {Number} index - which postCommand in array it is
 * @returns {Promise<Object>} args - with any variables resolved in each postCommand
 */
async function _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, index) {

  // selection is not used
  // const editor = window.activeTextEditor;

  // Object.assign() makes a shallow (reference) copy only
  // const tempArgs = JSON.parse(JSON.stringify(args));  // to make a deep copy
  const tempArgs = structuredClone(args);

  await _loopPostCommands(args, foundMatches[index], foundSelections[index], selection, index);

  // for multiple commands within a single args.postCommands
  async function _loopPostCommands(args, foundMatch, foundSelection, selection, index) {

    // if not an array or simply an object {}
    if (Array.isArray(tempArgs.postCommands)) {

      let commandNumber = 0;
      for await (const command of tempArgs.postCommands) {

        if (command?.args?.text)
          tempArgs.postCommands[commandNumber].args.text = await resolve.resolveVariables(tempArgs, "postCommands", foundMatch, foundSelection, null, commandNumber);


        // if (command?.args?.lineNumber)
        //   tempArgs.postCommands[commandNumber].args.lineNumber = await resolve.resolveVariables(tempArgs, "postCommands", foundMatch, foundSelection, null, commandNumber);

        commandNumber++;
      };
    }

    else tempArgs.postCommands.args.text = await resolve.resolveVariables(tempArgs, "postCommands", foundMatch, foundSelection, selection, index);
  };

  return tempArgs.postCommands;
}