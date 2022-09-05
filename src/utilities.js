const vscode = require('vscode');
const languageConfigs = require('./getLanguageConfig');
const path = require('path');
const os = require('os');

const findCommands = require('./transform');
const searchCommands = require('./search');


/**
 * Get the relative path to the workspace folder  
 * @param {string} filePath   
 * @returns {string} relativePath of file 
 */
exports.getRelativeFilePath = function (filePath) {

	const basename = path.basename(filePath);
	let relativePath = vscode.workspace.asRelativePath(filePath, false);

	if (basename === "settings.json" || basename === "keybindings.json") {
		if (os.type() === "Windows_NT") relativePath = filePath.substring(3);  // for Windows
		// else relativePath = filePath.substring(1); // test for linux/mac
	}
	// else {
	// 	const wsFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(filePath)).uri.path;
	// 	relativePath = path.posix.relative(wsFolder, filePath);
	// }

	return relativePath;
}

/**
 * Get the relative path to the workspace folder  
 * @param {string} filePath   
 * @returns {string} relativePath of folder
 */
exports.getRelativeFolderPath = function (filePath) {

	// const isWindows = process.platform === 'win32';
	// const env = process.env;
	// const homedir = os.homedir();

	const dirname = path.dirname(filePath);
	return vscode.workspace.asRelativePath(dirname);
}


/**
 * Get the language configuration comments object for  the current file
 * @returns {Promise<object|undefined>} comments object
 */
 exports.getlanguageConfigComments = async function (args) {
  // do only if $LINE_COMMENT, $BLOCK_COMMENT_START, $BLOCK_COMMENT_END in find or replace
  let re = /\$\{LINE_COMMENT\}|\$\{BLOCK_COMMENT_START\}|\$\{BLOCK_COMMENT_END\}/;
  if (args.find?.search(re) !== -1 || args.replace?.search(re) !== -1) {
    const documentLanguageId = vscode.window.activeTextEditor.document.languageId;
    return await languageConfigs.get(documentLanguageId, 'comments');
  }
	else return undefined;
}


/**
 * Get the relative paths of the current search results 
 * for the next `runInSearchPanel` call  
 * @param {string} clipText - the previous clipboard text
 * @returns {Promise<string>} comma-joined string of paths or empty string
 */
exports.getSearchResultsFiles = async function (clipText) {

	await vscode.commands.executeCommand('search.action.copyAll');
	let results = await vscode.env.clipboard.readText();

	if (results)  {
		results = results.replaceAll(/^\s*\d.*$\s?|^$\s/gm, "");
		let resultsArray = results.split(/[\r\n]{1,2}/);  // does this cover all OS's?

		let pathArray = resultsArray.filter(result => result !== "");
		pathArray = pathArray.map(path => this.getRelativeFilePath(path))
		return pathArray.join(", ");
	}
	else {
		// notifyMessage?
    // restore original clipboard content
    await vscode.env.clipboard.writeText(clipText);
		return "";
	}
} 


/**
 * Convert string to PascalCase.  
 * first_second_third => FirstSecondThird  
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/snippet/browser/snippetParser.ts}  
 * 
 * @param {string} value - string to transform to PascalCase  
 * @returns {string} transformed value  
 */
exports.toPascalCase = function(value) {

	const match = value.match(/[a-z0-9]+/gi);
	if (!match) {
		return value;
	}
	return match.map(word => {
		return word.charAt(0).toUpperCase()
			+ word.substring(1).toLowerCase();
	})
		.join('');
}


/**
 * Convert string to camelCase.  
 * first_second_third => firstSecondThird  
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/snippet/browser/snippetParser.ts}  
 * 
 * @param {string} value - string to transform to camelCase
 * @returns {string} transformed value  
 */
exports.toCamelCase = function (value) {

	const match = value.match(/[a-z0-9]+/gi);
	if (!match) {
		return value;
	}
	return match.map((word, index) => {
		if (index === 0) {
			return word.toLowerCase();
		} else {
			return word.charAt(0).toUpperCase()
				+ word.substring(1).toLowerCase();
		}
	})
		.join('');
};

/**
 * Convert string to snakeCase.  
 * first_second_third => firstSecondThird  
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/snippet/snippetParser.ts}  
 * 
 * @param {string} value - string to transform to snakeCase
 * @returns {string} transformed value  
 */
exports.toSnakeCase = function (value) {

	const match = value.match(/[a-z0-9]+/gi);
	if (!match) {
		return value;
	}
	return match.map((word, index) => {
		if (index === 0) {
			return word.toLowerCase();
		} else {
			return word.charAt(0).toUpperCase()
				+ word.substring(1).toLowerCase();
		}
	})
		.join('');
};


/**
 * Check args of commands: keys and values
 *  
 * @param {Array} args from keybindings or settings
 * @param {string} fromWhere findBinding/findSetting/searchBinding/searchSetting
 * @returns {Promise<object>}  of badKeys or badValues 
 */
exports.checkArgs = async function (args, fromWhere) {

	let goodKeys;
	let goodValues;
	let badKeys = [];
	let badValues = [];

	if (fromWhere === "findBinding" || fromWhere === "findSetting") {
		goodKeys = findCommands.getKeys();     // an array
		goodValues = findCommands.getValues(); // an object
	}
	else if (fromWhere === "searchBinding" || fromWhere === "searchSetting") {
		goodKeys = searchCommands.getKeys();     // an array
		goodValues = searchCommands.getValues(); // an object
  }
  
	badKeys = Object.keys(args).filter(arg => !goodKeys.includes(arg));
	
  for (const key of goodKeys) {
    
    // "title" cannot be an array
    if (key === "title" && (args["title"] || args["title"] === "")) {
      if (Array.isArray(args["title"])) badValues.push({ [key]: `<value should not be an array>` });
      else if (args[key] && typeof args[key] !== "string") badValues.push({ [key]: args[key] });
    }
    
    else if (args[key] || args[key] === "" || typeof args[key] === "boolean") {
      // for key === 'restrictFind' and others that may come later
      if (Array.isArray(args[key]) && Array.isArray(goodValues[key])) {
        
        await Promise.all(args[key].map(async (value) => {
          if (!goodValues[key].includes(value)) badValues.push({ [key]: value });
        }));
      }
      else if (key === 'restrictFind') {
        if (!goodValues[key].includes(args[key])) badValues.push({ [key]: args[key] });
      }
      
      else if (Array.isArray(args[key])) {
        await Promise.all(args[key].map(async (value) => {
          if (typeof value !== goodValues[key]) badValues.push({ [key]: value });
        }));
      }
      else {
        if (typeof args[key] !== goodValues[key]) badValues.push({ [key]: args[key] });
        // if (badValue && typeof goodValues[key][0] === "boolean") console.log(`"${ args[key] }" is not an accepted value of "${ key }".  The value must be a boolean true or false (not a string).`);
        // else if (badValue && typeof goodValues[key][0] === "string") console.log(`"${ args[key] }" is not an accepted value of "${ key }". Accepted values are "${ goodValues[key].join('", "') }".`);
      }
      
    }
  }
	if (badKeys.length || badValues.length) return { fromWhere: fromWhere, badKeys: badKeys, badValues: badValues}
	else return {};
};

/**
 * Write bad keys and values to outputChannel
 *  
 * @param {Object} argsBadObject computed in utilities.checkArgs
 * @param {vscode.OutputChannel} outputChannel, global from extension.js
 * @returns void  - writes to outputChannel
 */
exports.writeBadArgsToOutputChannel = async function (argsBadObject, outputChannel) {

  let output;
  
  if (argsBadObject.badKeys.length) {
    output = Object.entries(argsBadObject.badKeys).map(badItem => {
      return `\n\t"${ badItem[1] }"`;
    });
    outputChannel.appendLine(`\nBad Keys: ${ output }`);
  }
  
  if (argsBadObject.badValues.length) {
    output = Object.entries(argsBadObject.badValues).map(badItem => {
      if (typeof Object.entries(badItem[1])[0][1] === "boolean" || typeof Object.entries(badItem[1])[0][1] === "number")
        return `\n\t"${ Object.entries(badItem[1])[0][0] }": ${ Object.entries(badItem[1])[0][1] }`;
      else return `\n\t"${ Object.entries(badItem[1])[0][0] }": "${ Object.entries(badItem[1])[0][1] }"`;
    });
    
    outputChannel.appendLine(`\nBad Values: ${ output }`);
    outputChannel.appendLine(`_________________________________`);
  }
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

	await vscode.window
		.showErrorMessage(`${ message }`, { modal: modal },
			// ...['Run As Is', 'Abort'])   // two buttons + Cancel
			...buttons[badObject.fromWhere])
		.then(selected => {
			if (selected === 'Run As Is') ignore = true;
			else ignore = false;
		});
	
	return ignore;
};