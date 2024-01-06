/**
 * Get just the findInCurrentFile args keys, like "title", "find", etc.
 * @returns {Array}
 */
exports.getKeys = function () {
  // preserveCase ?
  return ["title", "description", "preCommands", "find", "replace", "run", "runWhen", "isRegex", "postCommands", "preserveSelections", 
  // return ["title", "description", "preCommands", "find", "replace (string)", "replace (js operation)","run", "runWhen", "isRegex", "postCommands", "preserveSelections", 
  "runPostCommands", "ignoreWhiteSpace", "matchCase", "matchWholeWord", "restrictFind", "reveal", "cursorMoveSelect"];
};


/**
 * Get just the findInCurrentFile args values, like true/false, "selections", etc.
 * @returns {Object}
 */
exports.getValues = function () {
  // preserveCase support
  return {
    title: "string", description: "string", find: "string", replace: "string", run: "string", preserveSelections: "boolean",  
    // title: "string", description: "string", find: "string", replace: ["string", "object"], run: "string", preserveSelections: "boolean",  
    runWhen: ["onceIfAMatch", "onEveryMatch", "onceOnNoMatches"], preCommands: ["string", "object"], postCommands: ["string", "object"],
    runPostCommands: ["onceIfAMatch", "onEveryMatch", "onceOnNoMatches"], isRegex: "boolean", matchCase: "boolean", matchWholeWord: "boolean", ignoreWhiteSpace: "boolean",
    restrictFind: ["document", "selections", "line", "once", "onceIncludeCurrentWord", "onceExcludeCurrentWord", "nextSelect", "nextMoveCursor", "nextDontMoveCursor",
      "previousSelect", "previousMoveCursor", "previousDontMoveCursor", "matchAroundCursor"],
    reveal: ["first", "next", "last"], cursorMoveSelect: "string"
  };
};


/**
 * Get the default values for all findInCurrentFile keys
 * @returns {Object} - {"title": "", "find": ""}
 */
exports.getDefaults = function () {
  return {
    "title": "",
    "description": "",
    "preCommands": "",
    "find": "",
    "ignoreWhiteSpace": false,
    "replace": "",
    
    // "replace (string)": "",
    // "replace (js operation)": 
    "run": "",
    "preserveSelections": false,
    "runWhen": "onceIfAMatch",
    "postCommands": "",
    "runPostCommands": "onceIfAMatch",
    "isRegex": false,
    "matchCase": false,
    "matchWholeWord": false,
    "restrictFind": "document",
    "reveal": "next",
    "cursorMoveSelect": ""
  };
  // "preserveCase": "false" ?
};
