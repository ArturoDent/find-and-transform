const { window } = require('vscode');

let outputChannel;



/**
 * Write text to outputChannel
 *  
 * @param {string} text - to be added
 * @returns void
 */
exports.write = function (text) {
  
  if (!this.outputChannel) this.outputChannel = window.createOutputChannel("find-and-transform");
    // @ts-ignore
  else if (this.outputChannel) this.outputChannel.clear();
  
  this.outputChannel.appendLine(text);
  this.outputChannel?.show(false);
}


/**
 * Clear the outputChannel
 * @returns void
 */
exports.clear = async function () {
  
  // hide() closes the Panel too!
  
  if (!this.outputChannel) return;
  else return this.outputChannel.clear();
};


/**
 * Hide the outputChannel
 * @returns void
 */
exports.hide = async function () {
  
  if (!this.outputChannel) return;
  else return this.outputChannel.hide();
};


/**
 * Dispose of the outputChannel
 * @returns void
 */
exports.dispose = async function () {
  
  if (!this.outputChannel) return;
  else return this.outputChannel.dispose();
};



/**
 * Write bad keys and values to outputChannel
 * @param {Object} argsBadObject computed in utilities.checkArgs
 * @returns void  - writes to outputChannel
 */
exports.writeBadArgs = async function (argsBadObject) {

  let output;
  
  if (!this.outputChannel) this.outputChannel = window.createOutputChannel("find-and-transform");
    // @ts-ignore
  else if (this.outputChannel) this.outputChannel.clear();

  if (argsBadObject.badKeys.length) {
    output = Object.entries(argsBadObject.badKeys).map(badItem => {
      return `\n\t"${ badItem[1] }"`;
    });
    this.outputChannel.appendLine(`\nBad Keys: ${ output }`);
  }
  
  if (argsBadObject.badValues.length) {
    output = Object.entries(argsBadObject.badValues).map(badItem => {
      if (typeof Object.entries(badItem[1])[0][1] === "boolean" || typeof Object.entries(badItem[1])[0][1] === "number")
        return `\n\t"${ Object.entries(badItem[1])[0][0] }": ${ Object.entries(badItem[1])[0][1] }`;
      else return `\n\t"${ Object.entries(badItem[1])[0][0] }": "${ Object.entries(badItem[1])[0][1] }"`;
    });
    
    this.outputChannel.appendLine(`\nBad Values: ${ output }`);
    this.outputChannel.appendLine(`_________________________________`);
  }
  if (output) this.outputChannel.show(false);
};

/**
 * 
 * @param {object} badObject - badKeys and badValues
 * @param {boolean} modal - show a modal dialog
 * @param {string} name - setting name, if any
 * @returns {Promise<boolean>} - ignore
 */
exports.showBadKeyValueMessage = async function (badObject, modal, name) {
	
	let message = "";
	let ignore = false;

	let origin = {
		findBinding: `Keybinding: `,
		findSetting: `From the 'findInCurrentFile' setting "${name}" : `,
		searchBinding: `Keybinding: `,
		searchSetting: `From the 'runInSearchPanel' setting "${ name}" : `
	}
	let buttons = {
		findBinding: ['Run As Is'],   // one button + Cancel,
		findSetting: ['Run As Is', 'Stop'],
		searchBinding: ['Run As Is'],
		searchSetting: ['Run As Is', 'Stop']
  }
  
	if (badObject.badKeys.length === 1) message = `${ origin[badObject.fromWhere] } this key does not exist: "${ badObject.badKeys[0] }".`;
	else if (badObject.badKeys.length > 1) message = `${ origin[badObject.fromWhere] } these keys do not exist: "${ badObject.badKeys.join('", "') }".`;

	if (badObject.badValues) {
		for (const item of badObject.badValues) {
			message += ` ${ origin[badObject.fromWhere] } key has a bad value: "${ Object.entries(item)[0][0] }": "${ Object.entries(item)[0][1] }".`;
		}
	}	

	await window
		.showErrorMessage(`${ message }`, { modal: modal },
			// ...['Run As Is', 'Abort'])   // two buttons + Cancel
			...buttons[badObject.fromWhere])
		.then(selected => {
			if (selected === 'Run As Is') ignore = true;
			else ignore = false;
		});
	
	return ignore;
};