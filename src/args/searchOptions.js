/**
 * Get just the runInSearchPanel args keys, like "title", "find", etc.
 * @returns {Array}
 */
exports.getKeys = function () {  // removed "isCaseSensitive" in favor of "matchCase"
  // return ["title", "preCommands", "find", "replace", "delay", "postCommands", "triggerSearch", "triggerReplaceAll",
  return ["title", "description", "preCommands", "find", "replace", "delay", "postCommands", "triggerSearch", "triggerReplaceAll",
    "isRegex", "ignoreWhiteSpace", "filesToInclude", "preserveCase", "useExcludeSettingsAndIgnoreFiles",
    // "matchWholeWord", "matchCase", "filesToExclude", "onlyOpenEditors", "clipText"];
    "matchWholeWord", "matchCase", "filesToExclude", "onlyOpenEditors"];
}

/**
 * Get just the runSearchInPanel args values, like true/false, "selections", etc.
 * @returns {object}
 */
exports.getValues = function () {    // removed "isCaseSensitive" in favor of "matchCase"
	return {
    title: "string", find: "string", replace: "string", isRegex: "boolean", ignoreWhiteSpace: "boolean",
    // matchCase: "boolean", preCommands: "string", postCommands: "string", delay: "number", clipText: "string",
    matchCase: "boolean", preCommands: "string", postCommands: "string", delay: "number", 
		matchWholeWord: "boolean", triggerSearch: "boolean", triggerReplaceAll: "boolean",
    useExcludeSettingsAndIgnoreFiles: "boolean", preserveCase: "boolean",
		filesToInclude: "string", filesToExclude: "string", onlyOpenEditors: "boolean", description: "string"
	};
}

/**
 * Get the default values for all runInSearchPanel keys
 * @returns {object} - {"title": "", "find": ""}
 */
exports.getDefaults = function () {
	return {
    "title": "",
    "description": "",
    "preCommands": "",
		"find": "",
    "replace": "",
    "delay": 2000,
    "postCommands": "",
		"triggerSearch": true,
		"triggerReplaceAll": false,
    "isRegex": true,
    "ignoreWhiteSpace": false,
		"filesToInclude": "",          // default is current workspace
		"preserveCase": false,
		"useExcludeSettingsAndIgnoreFiles": true,
		"isCaseSensitive": false,
		"matchWholeWord": false,
		"matchCase": false,
    "filesToExclude": "",
    // "clipText": "",
		"onlyOpenEditors": false
	};
}