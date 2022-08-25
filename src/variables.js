// const vscode = require('vscode');


/**
 * @returns {Array} - all the available variables defined by this extension
 */
exports.getExtensionDefinedVariables = function() {

  return ["${getDocumentText}", "${getTextLines:\\(\\s*\\d+(\\s*[-+%*\/]\\s*\\d+)?\\s*\\)}", "${getTextLines:\\d+}",
    "${getTextLines:\\d+-\\d+}", "${getTextLines:\\d+,\\d+,\\d+,\\d+}", "${resultsFiles}"];
}


/**
 * @returns {Array} - all the available path variables
 */
exports.getPathVariables = function() {

  return [
    "${file}", "${relativeFile}", "${fileBasename}", "${fileBasenameNoExtension}", "${fileExtname}", "${fileDirname}",
    "${fileWorkspaceFolder}", "${workspaceFolder}", "${relativeFileDirname}", "${workspaceFolderBasename}", 
    "${selectedText}", "${pathSeparator}", "${lineIndex}", "${lineNumber}", "${CLIPBOARD}",     
    "${matchIndex}", "${matchNumber}"
  ];
}

/**
 * @returns {Array} - all the available snippet variables
 */
exports.getSnippetVariables = function() {

  return [
    "${TM_CURRENT_LINE}", "${TM_CURRENT_WORD}", 
    
    "${CURRENT_YEAR}", "${CURRENT_YEAR_SHORT}", "${CURRENT_MONTH}", "${CURRENT_MONTH_NAME}",
    "${CURRENT_MONTH_NAME_SHORT}", "${CURRENT_DATE}", "${CURRENT_DAY_NAME}", "${CURRENT_DAY_NAME_SHORT}",
    "${CURRENT_HOUR}", "${CURRENT_MINUTE}", "${CURRENT_SECOND}", "${CURRENT_SECONDS_UNIX}",
    "${RANDOM}", "${RANDOM_HEX}",
    "${BLOCK_COMMENT_START}", "${BLOCK_COMMENT_END}", "${LINE_COMMENT}"
  ];
}