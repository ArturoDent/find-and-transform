const vscode = require('vscode');
const path = require('path');
const os = require('os');

const findCommands = require('./transform');
const searchCommands = require('./search');


/**
 * Get the relative path to the workspace folder  
 * @param {String} filePath   
 * @returns {String} relativePath  
 */
exports.getRelativeFilePath = function (filePath) {

	const basename = path.basename(filePath);
	let relativePath = vscode.workspace.asRelativePath(filePath, false);

	if (basename === "settings.json" || basename === "keybindings.json") {
		if (os.type() === "Windows_NT") relativePath = filePath.substring(4);  // for Windows
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
 * @param {String} filePath   
 * @returns {String} relativePath  
 */
exports.getRelativeFolderPath = function (filePath) {

	// const isWindows = process.platform === 'win32';
	// const env = process.env;
	// const homedir = os.homedir();

	const dirname = path.dirname(filePath);
	return vscode.workspace.asRelativePath(dirname);
}


/**
 * Get the relative paths of the current search results 
 * for the next `runInSearchPanel` call  
 * 
 * @returns array of paths or undefined  
 */
exports.getSearchResultsFiles = async function () {

	await vscode.commands.executeCommand('search.action.copyAll');
	let results = await vscode.env.clipboard.readText();

	// handle no results
	if (results)  {
		results = results.replaceAll(/^\s*\d.*$\s?|^$\s/gm, "");
		let resultsArray = results.split(/[\r\n]{1,2}/);  // does this cover all OS's?

		let pathArray = resultsArray.filter(result => result !== "");
		pathArray = pathArray.map(path => this.getRelativeFilePath(path))

		return pathArray.join(", ");
	}
	else {
		// notifyMessage
		return undefined;
	}
} 


/**
 * Convert string to PascalCase.  
 * first_second_third => FirstSecondThird  
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/snippet/snippetParser.ts}  
 * 
 * @param {String} value   
 * @returns {String} transformed value  
 */
exports.toPascalCase = function(value) {

	const match = value.match(/[a-z0-9]+/gi);
	if (!match) {
		return value;
	}
	return match.map(word => {
		return word.charAt(0).toUpperCase()
			+ word.substr(1).toLowerCase();
	})
		.join('');
}


/**
 * Convert string to camelCase.  
 * first_second_third => firstSecondThird  
 * from {@link https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/snippet/snippetParser.ts}  
 * 
 * @param {String} value  
 * @returns {String} transformed value  
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
				+ word.substr(1).toLowerCase();
		}
	})
		.join('');
};


/**
 * Check args of commands: keys and values
 *  
 * @param {Array} args from keybindings or settings
 * @param {String} fromWhere findBinding/findSetting/searchBinding/searchSetting
 * @returns {Object}  of badKeys or badValues 
 */
exports.checkArgs = function (args, fromWhere) {

	let goodKeys;
	let goodValues;
	let badKeys = [];
	let badValues = [];
	// let badValueKey;


	if (fromWhere === "findBinding" || fromWhere === "findSetting") {
		goodKeys = findCommands.getKeys();  // an array
		goodValues = findCommands.getValues(); // an object
	}
	else if (fromWhere === "searchBinding" || fromWhere === "searchSetting") {
		goodKeys = searchCommands.getKeys();  // an array
		goodValues = searchCommands.getValues(); // an object
	}
	badKeys = Object.keys(args).filter(arg => !goodKeys.includes(arg));
	
	// if (!badKey) {
		for (const key of goodKeys) {
			if (args[key]) {  // and not the empty string "" TODO
				if (typeof goodValues[key] === "string") {
					if (typeof args[key] !== "string") badValues.push({ [key]: args[key] });
				}
				else {
					let badValue = !goodValues[key].includes(args[key]);
					if (badValue) {
						// badValues[key] = args[key];
						badValues.push({ [key] : args[key] });
					}
					// if (badValue && typeof goodValues[key][0] === "boolean") console.log(`"${ args[key] }" is not an accepted value of "${ key }".  The value must be a boolean true or false (not a string).`);
					// else if (badValue && typeof goodValues[key][0] === "string") console.log(`"${ args[key] }" is not an accepted value of "${ key }". Accepted values are "${ goodValues[key].join('", "') }".`);
				}
			}
		}
	// }
	if (badKeys.length || badValues.length) return { fromWhere: fromWhere, badKeys: badKeys, badValues: badValues}
	return {};
};

/**
 * 
 * @param {Object} badObject badKeys and badValues
 * @param {Boolean} modal show a modal dialog
 * @param {String} name setting name, if any
 * @returns {Promise<Boolean>} ignore
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
}