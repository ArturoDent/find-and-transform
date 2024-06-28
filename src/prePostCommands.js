const { commands, window, Selection } = require('vscode');
const registerCommands = require('./registerCommands');
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
    await commands.executeCommand('runCommands', { commands: userCommands });
}

/**
 * Run the args.postCommands and args.runPostCommands, no return
 * 
 * @param {Object} args
 * @param {Array} foundMatches
 * @param {Selection[] | readonly Selection[]} foundSelections
 * @param {Selection} selection - editor.selection
 * 
 */
exports.runPost = async function (args, foundMatches, foundSelections, selection) {
  
  let postCommands = args.postCommands;
  const editor = window.activeTextEditor;
  
  await _prePostHasVariable(args.postCommands);
  
  // does this work for a single object? No
  const argHasText = (command) => {
    return command?.args?.text;  // && check if variable in text?  'snippet' as well TODO
    // return command?.args?.text || command?.args?.lineNumber;  // && check if variable in text?
  }
  
  const resolvePostCommands = (Array.isArray(args.postCommands) && args.postCommands?.some(argHasText)) || args.postCommands?.args?.text;
  

  // handles array or a single object
  // if ((Array.isArray(args.postCommands) && args.postCommands?.some(argHasText)) || args.postCommands?.args?.text) {

  if (foundMatches.length) {
    if (args.runPostCommands === "onEveryMatch") {
      let index = 0;
      for await (const foundSelection of foundSelections) {
        if (resolvePostCommands) {
          editor.selections = [foundSelection];  // TODO: if preserveSelections ?
          postCommands = await _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, index);
        }
        await this.run(postCommands, "postCommands"); 
        index++;
      };
    }
    
      // TODO: how to check for escaping out of ${getInput} and so do not run postCommand?
    
    else if (!args.runPostCommands || args.runPostCommands === "onceIfAMatch") { // uses first match and first selection = editor.selection
      if (resolvePostCommands) {
        editor.selections = [foundSelections[0]];  // if preserveSelections ?
        postCommands = await _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, 0);
      }
      await this.run(postCommands, "postCommands");
    }
  }
  else if (args.runPostCommands === "onceOnNoMatches") {
    if (resolvePostCommands) postCommands = await _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, 0);
    // postCommands = await _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, 0);
    await this.run(postCommands, "postCommands");  // no matches, run once
  }
};



/**
 * Does the command object (could be preCommands or postCommands) contain any variables to be resolved.
 * Like ${getInput} for example, loop through all arguments to each command
 *
 * @param {Object} commands - an array of commands or a single command
 * @returns 
 **/
async function _prePostHasVariable (commands) {
  
  if (typeof commands === 'string') return false;
  
  // if array, loop through all commands
  // if !== array, loop through each argument to that command
  
  if (Array.isArray(commands)) {
    
    // for (const args of command)
    // for (const [command, args] of command)
    
    
    for await (const command of commands) {
      
      const args = command.args;
      console.log(args);
      
      // for (const [command1, args] of command) {
      
      //   console.log(command1, args);
      // }
    }
      
    //   for await (const argValue of Object.values(command?.args)) {
        
    //     // if (typeof argValue === 'string')
    //     console.log(argValue);
    //   }
    // }
  }

}



/**
 * Resolve any variables in the args.postCommands
 * 
 * @param {Object} args
 * @param {Array} foundMatches
 * @param {Selection[] | readonly Selection[]} foundSelections
 * @param {Selection} selection - the editor.selection
 * @param {Number} index - which postCommand in array it is
 * @returns {Promise<Object>} args - with any variables resolved in each postCommand
 */
async function _resolvePostCommandVariables(args, foundMatches, foundSelections, selection, index) {
  
  // selection is not used
  const editor = window.activeTextEditor;
  
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