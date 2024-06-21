const { window, workspace, Selection, Position, env, extensions, commands, Uri } = require('vscode');
const resolve = require('./resolveVariables');

const languageConfigs = require('./getLanguageConfig');
const path = require('path');
const os = require('os');

// let outputChannel;

const searchArgs = require('./args/searchOptions');
const findArgs = require('./args/findOptions');



/**
 * Check if selection is at the start of an empty line
 * @param {Selection} curPos 
 * @returns {Promise<boolean>}
 */
exports.isEmptySelectionOnOwnLine = async function (curPos) {
  
  const currentLineIsEmpty = window.activeTextEditor.document.lineAt(curPos.start.line).text.length === 0;
  if (!currentLineIsEmpty) return false;
  
  return curPos.start.isEqual(curPos.end) && curPos.start.character === 0;
};


/**
 * Get the number of empty lines in a selection
 * @param {Selection} sel 
 * @returns {Promise<number>}
 */
exports.getNumLinesOfSelection = async function (sel) {
  
  let numEmptyLines = 0;
  
  for ( let line = sel.start.line; line <= sel.end.line; line++ ) {
    if (window.activeTextEditor.document.lineAt(line).text.length === 0) numEmptyLines++;    
  }
  
  return numEmptyLines;
};

/**
 * Get the text of a selection
 * @param {Selection} sel 
 * @returns {Promise<number>}
 */
exports.getTextOfSelection = async function (sel) {
  
  let numEmptyLines = 0;
  
  for ( let line = sel.start.line; line <= sel.end.line; line++ ) {
    if (window.activeTextEditor.document.lineAt(line).text.length === 0) numEmptyLines++;    
  }
  
  return numEmptyLines;
};

/**
 * Trigger a QuickInput to get args.find/replace/run/cursorMoveSelect from the user.
 * @param {string} type - called by find/replace/run/cursorMoveSelect
 * @returns {Promise<String>}
 */
exports.getInput = async function (type) {
  
  if (type === "ignoreLineNumbers") type = "find query - for ${getInput}";
  else if (type === "find") type = "find query - for ${getInput}";
  else if (type === "findSearch") type = "search query - for ${getInput}";
  
  const title = type[0].toLocaleUpperCase() + type.substring(1);
  let prompt = "";
  let placeHolder = "";
  
  // add preCommands if its variables are ever resolved
  
  if (type === "find") placeHolder = "A string, number or regex to find.";
  else if (type === "replace") placeHolder = "A string, number or regex for the replacement.";
  else if (type === "run") placeHolder = "Enter the text or number to be used in the run operation.";
  else if (type === "cursorMoveSelect") placeHolder = "Enter the text or regex to select.";
  else if (type === "postCommands") placeHolder = "Enter the text to be used within the postCommands.";
  else if (type === "filesToInclude") placeHolder = "Enter a glob to be used within the 'files to include' search option.";
  else if (type === "filesToExclude") placeHolder = "Enter a glob to be used within the 'files to exclude' search option.";

  const options = { title, placeHolder };  
  return await window.showInputBox(options);
};


/**
 * Escape the glob characters '?*[]' for the 'files to include' input 
 * from the 'find-and-transform.searchInFolder/File/Results' commands.
 * 
 * @param {string} path
 * @returns {Promise<String>}
 */
exports.escapePathsForFilesToInclude = async function (path) {
  if (!path) return "";
  return path.replace(/([?*[\]])/g, '[$1]');
};

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

// works with the search results tree or list view option
/**
 * Get the relative paths of the current search results 
 * for the next `runInSearchPanel` call  
 * @param {string} clipText - the previous clipboard text
 * @returns {Promise<string>} comma-joined string of paths or empty string
 */
exports.getSearchResultsFiles = async function (clipText) {
  
  if (!clipText) clipText = await env.clipboard.readText();
  
	await commands.executeCommand('search.action.copyAll');
  
	let results = await env.clipboard.readText();

	if (results)  {
		results = results.replaceAll(/^\s*\d.*$\s?|^$\s/gm, "");
		let resultsArray = results.split(/[\r\n]{1,2}/);  // does this cover all OS's?

		let pathArray = resultsArray.filter(result => result !== "");
    pathArray = pathArray.map(path => this.getRelativeFilePath(path));
    
    // restore original clipboard content
    await env.clipboard.writeText(clipText);
    
		// return await module.exports.escapePathsForFilesToInclude( pathArray.join(", ") );
		return await this.escapePathsForFilesToInclude( pathArray.join(", ") );
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
 * first-second-third => FirstSecondThird
 * firstSecondThird => FirstSecondThird
 * 
 * NOT from {@link https://github.com/microsoft/vscode/blob/273e4b0d7bd19bf8b9383d8de2e6fd01a3883852/src/vs/editor/contrib/snippet/browser/snippetParser.ts#L399}  
 * 
 * @param {string} value - string to transform to PascalCase  
 * @returns {string} transformed value  
 */
exports.toPascalCase = function(value) {
  
  // the code form vacode GH does not work for 'howManyCows' ??
  // const match = value.match(/[a-z0-9]+/gi);  
	// if (!match) {
	// 	return value;
	// }
	// return match.map(word => {
	// 	return word[0].toLocaleUpperCase() + word.substring(1).toLocaleLowerCase();
	// })
  // 	.join('');
  
  value = value.trim();  // whitespaces are removed
  // split on uppercase letter that is followed by a lowercase letter or a '-' or an '_'
  const words = value.split(/(?=[A-Z])|[-_]/);
  const capitalizedWords = words.map(word => word.charAt(0).toUpperCase() + word.slice(1));
  return capitalizedWords.join('');
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
  
  value = value.trim();

	const match = value.match(/[a-z0-9]+/gi);
	if (!match) {
		return value;
	}
	return match.map((word, index) => {
		if (index === 0) {
			return word.toLocaleLowerCase();
		} else {
			return word[0].toLocaleUpperCase() + word.substring(1).toLocaleLowerCase();
		}
	})
		.join('');
};

/**
 * Convert string to snakeCase.  
 * firstSecondThird => first_second_third
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/linesOperations/browser/linesOperations.ts}  
 * 
 * @param {string} value - string to be transformed
 * @returns {string} transformed value  
 */
exports.toSnakeCase = function (value) {
  
  value = value.trim();
  
  const caseBoundary = /(\p{Ll})(\p{Lu})/gmu;
  const singleLetters = /(\p{Lu}|\p{N})(\p{Lu})(\p{Ll})/gmu;
  
  return (value
    .replace(caseBoundary, '$1_$2')
    .replace(singleLetters, '$1_$2$3')
    .toLocaleLowerCase()
  );
};


// no capture group in find but $1, etc. in replace (unless isRegEx = true)
// an apparent capture group in find, but isReg is missing (default is false)
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
  
  const simpleKeys = ["restrictFind", "reveal", "runWhen", "runPostCommands"];

	if (fromWhere === "findBinding" || fromWhere === "findSetting") {
		goodKeys = findArgs.getKeys();     // an array
		goodValues = findArgs.getValues(); // an object
	}
	else if (fromWhere === "searchBinding" || fromWhere === "searchSetting") {
		goodKeys = searchArgs.getKeys();     // an array
		goodValues = searchArgs.getValues(); // an object
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
      
      else if (simpleKeys.includes(key)) {
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

// /**
//  * Write bad keys and values to outputChannel
//  *  
//  * @param {Object} argsBadObject computed in utilities.checkArgs
//  * @returns void  - writes to outputChannel
//  */
// exports.writeBadArgsToOutputChannel = async function (argsBadObject) {

//   let output;
  
//   if (!this.outputChannel) this.outputChannel = window.createOutputChannel("find-and-transform");
//     // @ts-ignore
//   else if (this.outputChannel) this.outputChannel.clear();

//   if (argsBadObject.badKeys.length) {
//     output = Object.entries(argsBadObject.badKeys).map(badItem => {
//       return `\n\t"${ badItem[1] }"`;
//     });
//     this.outputChannel.appendLine(`\nBad Keys: ${ output }`);
//   }
  
//   if (argsBadObject.badValues.length) {
//     output = Object.entries(argsBadObject.badValues).map(badItem => {
//       if (typeof Object.entries(badItem[1])[0][1] === "boolean" || typeof Object.entries(badItem[1])[0][1] === "number")
//         return `\n\t"${ Object.entries(badItem[1])[0][0] }": ${ Object.entries(badItem[1])[0][1] }`;
//       else return `\n\t"${ Object.entries(badItem[1])[0][0] }": "${ Object.entries(badItem[1])[0][1] }"`;
//     });
    
//     this.outputChannel.appendLine(`\nBad Values: ${ output }`);
//     this.outputChannel.appendLine(`_________________________________`);
//   }
//   if (output) this.outputChannel.show(false);
// };

// /**
//  * 
//  * @param {object} badObject - badKeys and badValues
//  * @param {boolean} modal - show a modal dialog
//  * @param {string} name - setting name, if any
//  * @returns {Promise<boolean>} - ignore
//  */
// exports.showBadKeyValueMessage = async function (badObject, modal, name) {
	
// 	let message = "";
// 	let ignore = false;

// 	let origin = {
// 		findBinding: `Keybinding: `,
// 		findSetting: `From the 'findInCurrentFile' setting "${name}" : `,
// 		searchBinding: `Keybinding: `,
// 		searchSetting: `From the 'runInSearchPanel' setting "${ name}" : `
// 	}
// 	let buttons = {
// 		findBinding: ['Run As Is'],   // one button + Cancel,
// 		findSetting: ['Run As Is', 'Stop'],
// 		searchBinding: ['Run As Is'],
// 		searchSetting: ['Run As Is', 'Stop']
//   }
  
// 	if (badObject.badKeys.length === 1) message = `${ origin[badObject.fromWhere] } this key does not exist: "${ badObject.badKeys[0] }".`;
// 	else if (badObject.badKeys.length > 1) message = `${ origin[badObject.fromWhere] } these keys do not exist: "${ badObject.badKeys.join('", "') }".`;

// 	if (badObject.badValues) {
// 		for (const item of badObject.badValues) {
// 			message += ` ${ origin[badObject.fromWhere] } key has a bad value: "${ Object.entries(item)[0][0] }": "${ Object.entries(item)[0][1] }".`;
// 		}
// 	}	

// 	await window
// 		.showErrorMessage(`${ message }`, { modal: modal },
// 			// ...['Run As Is', 'Abort'])   // two buttons + Cancel
// 			...buttons[badObject.fromWhere])
// 		.then(selected => {
// 			if (selected === 'Run As Is') ignore = true;
// 			else ignore = false;
// 		});
	
// 	return ignore;
// };

// /**
//  * Write text to outputChannel
//  *  
//  * @param {string} text - to be added
//  * @returns void
//  */
// exports.writeToOutputChannel = function (text) {
  
//   if (!this.outputChannel) this.outputChannel = window.createOutputChannel("find-and-transform");
//     // @ts-ignore
//   else if (this.outputChannel) this.outputChannel.clear();
  
//   this.outputChannel.appendLine(text);
//   this.outputChannel?.show(false);
// }


// /**
//  * Dispose of the outputChannel
//  *  
//  * @returns void
//  */
// exports.disposeOutputChannel = async function () {
  
//   if (!this.outputChannel) return;
//   else return this.outputChannel.dispose();
// }

/**
 * Get the first/next after cursor/last selection from all matches/foundSelections.  Will wrap.
 * @param {Array<Selection>} foundSelections 
 * @param {Position} cursorPosition 
 * @param {string} whichReveal - first/next/last
 * @returns {Promise<Selection>}
 */
exports.getSelectionToReveal = async function (foundSelections, cursorPosition, whichReveal) {
  
  if (foundSelections.length === 1) return foundSelections[0];
  
  if (whichReveal === "first") return foundSelections[0];
  else if (whichReveal === "last") return foundSelections.at(-1);
  else if (whichReveal === "next") {   // so next = default, should wrap
    const next = foundSelections.find(found => {
      return (found.active.line > cursorPosition.line) ||
        ((found.active.line === cursorPosition.line) && (found.active.character > cursorPosition.character));  // same line
    });
    return next || foundSelections[0];  // so it wraps
  }
  else if (!whichReveal) return null;
};


// from https://stackoverflow.com/questions/33631041/javascript-async-await-in-replace

/**
 * An async version of replaceAll.  Called in resolveVariables.resolveVariables().
 * 
 * @param {string} toResolve - string to resolve
 * @param {RegExp} regexp
 * @param {Function} replacerFunction
 * 
 * @returns {Promise<string>}
 */
exports.replaceAsync = async function (toResolve, regexp, replacerFunction) {
  
  if (!toResolve) return;
  
  const replacements = await Promise.all(
      Array.from(toResolve.matchAll(regexp),
          async match => await replacerFunction(...match)  // no difference
        // match => replacerFunction(...match)
    )
  );
  let i = 0;
  return toResolve.replace(regexp, () => replacements[i++]);
};



/**
 * An async version of replaceAll.  Called in resolveVariables.resolveVariables() and search.js.
 * Specifically for extension-derived variable resolution, notably ${getInput}
 * 
 * @param {string} toResolve - string to resolve
 * @param {RegExp} regex
 * @param {Function} asyncFn - the async replacer function
 * 
 * @returns {Promise<string>}
 */
exports.replaceAsync2 = async function (toResolve, regex, asyncFn, args, caller) {
 
 const matches = toResolve.match(regex);
 
  if (matches) {
  //  const replacement = await resolve.resolveExtensionDefinedVariables(matches[0], args, caller);
   const replacement = await asyncFn(matches[0], args, caller);
   toResolve = toResolve.replace(matches[0], replacement);
   toResolve = await this.replaceAsync2(toResolve, regex, asyncFn, args, caller);
 }
 
  return toResolve;
}