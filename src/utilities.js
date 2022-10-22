const { window, workspace, env, extensions, commands, Uri } = require('vscode');

const languageConfigs = require('./getLanguageConfig');
const path = require('path');
const os = require('os');
// import { window, workspace, env, extensions, commands, Uri } from 'vscode';

// import languageConfigs from './getLanguageConfig';
// import path from 'path';
// import os from 'os';

const findCommands = require('./transform');
const searchCommands = require('./search');
const globals = require('./extension');  // for outputChannel
// import findCommands from './transform';
// import searchCommands from './search';
// import globals from './extension';  // for outputChannel

/**
 * Get the full path to this extension  
 * @returns  
 */
exports.getPackageJSON = async function () {

	const extensionPath = extensions.getExtension('ArturoDent.find-and-transform').extensionPath;
  
  const packageJSONUri = Uri.file(path.join(extensionPath, 'package.json'));
  const packageContents = (await workspace.fs.readFile(packageJSONUri)).toString();
  const packageJSON = JSON.parse(packageContents);

	return packageJSON;
}

/**
 * Get the relative path to the workspace folder  
 * @param {string} filePath   
 * @returns {string} relativePath of file 
 */
exports.getRelativeFilePath = function (filePath) {

	const basename = path.basename(filePath);
	let relativePath = workspace.asRelativePath(filePath, false);

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
	return workspace.asRelativePath(dirname);
}


/**
 * Get the language configuration comments object for  the current file
 * @returns {Promise<object|undefined>} comments object
 */
exports.getlanguageConfigComments = async function (args) {
  
  const document = window.activeTextEditor.document;
   
  // do only if $LINE_COMMENT, $BLOCK_COMMENT_START, $BLOCK_COMMENT_END in find or replace
  let re = /\$\{LINE_COMMENT\}|\$\{BLOCK_COMMENT_START\}|\$\{BLOCK_COMMENT_END\}/;
  if (args.find?.search(re) !== -1 || args.replace?.search(re) !== -1) {
    const documentLanguageId = document.languageId;
    return await languageConfigs.get(documentLanguageId, 'comments');
  }
	else return undefined;
}

// TODO: test this with the search results tree view option - looks like nothing has changed
/**
 * Get the relative paths of the current search results 
 * for the next `runInSearchPanel` call  
 * @param {string} clipText - the previous clipboard text
 * @returns {Promise<string>} comma-joined string of paths or empty string
 */
exports.getSearchResultsFiles = async function (clipText) {
  
	await commands.executeCommand('search.action.copyAll');
  
	let results = await env.clipboard.readText();

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
    await env.clipboard.writeText(clipText);
		return "";
	}
} 


/**
 * Convert string to PascalCase.  
 * first_second_third => FirstSecondThird  
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/linesOperations/browser/linesOperations.ts}  
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
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/linesOperations/browser/linesOperations.ts}  
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
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/linesOperations/browser/linesOperations.ts}  
 * 
 * @param {string} value - string to transform to snakeCase
 * @returns {string} transformed value  
 */
exports.toSnakeCase = function (value) {
  
  // return value.replace(/(?<=\p{Ll})(\p{Lu})|(?<!\b|_)(\p{Lu})(?=\p{Ll})/gmu, '_$&').replace(/(?<=\p{L})[- ](?=\p{L})/gmu, '_').toLocaleLowerCase();

  const caseBoundary = /(\p{Ll})(\p{Lu})/gmu;
  const singleLetters = /(\p{Lu}|\p{N})(\p{Lu})(\p{Ll})/gmu;
  
  return (value
    .replace(caseBoundary, '$1_$2')
    .replace(singleLetters, '$1_$2$3')
    .toLocaleLowerCase()
  );
};


// TODO: check for \n, etc. not double-backslashed
// no capture ground in find but $1, etc. in replace (unless isRegEx = true)
// an apparent capture group in find, but isReg is miising (default is false)
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
    
    else if ((key === "preCommands" || key === "postCommands") && args[key]) {
      
      // if array, check each item for string or object
      if (Array.isArray(args[key])) {
        await Promise.all(args[key].map(async (value) => {
          if (!goodValues[key].includes(typeof value)) badValues.push({ [key]: value });
        }));
      }
      else if (args[key] && typeof args[key] !== "string" && typeof args[key] !== "object") badValues.push({ [key]: args[key] });
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
 * @returns void  - writes to outputChannel
 */
exports.writeBadArgsToOutputChannel = async function (argsBadObject) {

  const outputChannel = globals.outputChannel;
  // const outputChannel = window.createOutputChannel("find-and-transform");
  
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
  if (output) outputChannel.show(false);
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