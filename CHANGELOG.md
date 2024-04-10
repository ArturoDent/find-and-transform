# CHANGELOG  

* 5.1.0 Enabled multiple `${getInput}`'s in an argument.  Added regex.js for commonly used regular expressions.  
&emsp;&emsp; - Fix lineNumber/Index matching.  
&emsp;&emsp; - Fix  `matchAroundCursor`  bug - set regex true.  
&emsp;&emsp; 5.1.3 Fix  next/previous  bug - calculate cursorIndex again.  

* 5.0.0 Much work on making the code more asynchronous.  
&emsp;&emsp; - `${getInput}` is replacing `${getFindInput}`.  It now works in `replace`, `run`, `postCommands`, `cursorMoveSelect`, `filesToInclude` and `filesToExclude` arguments.  
&emsp;&emsp; - `${/}` path separator variable added.  
&emsp;&emsp; - Work on matching empty lines.  

* 4.8.0 Added `preserveSelections` argument.  Completions work in `.code-workspace` (workspace settings) files.  
&emsp;&emsp; 4.8.2 Fixed escaping while using `${getFindInput}`.  
&emsp;&emsp; 4.8.3 Less escaping on variable replacements not in `replace/run`.  
&emsp;&emsp; 4.8.4 Work on capture groups in replace with no find and `isRegex` true or false.  

* 4.7.0 Added `ignoreWhiteSpace` argument.  
&emsp;&emsp; Added `${getFindInput}` variable for `find` queries.  
&emsp;&emsp; Added `runWhen` argument to control when the `run` operation is triggered.  
&emsp;&emsp; Added `"restrictFind": "matchAroundCursor"` option.  
&emsp;&emsp; 4.7.1 Added `runPostCommands` and `resolvePostCommandVariables`.  Added a command to enable opening readme anchors from completion details.  
&emsp;&emsp; 4.7.2 Added intellisense to `.code-workspace` settings.  

* 4.6.0 Handling of backslashes for `\n`, `\\n`, `\t` and `\\t` improved significantly in jsOperations.  
&emsp;&emsp; Fixed `lineNumber/Index` bug for `next...` and `previous...` `restrictFind` options.  
&emsp;&emsp; Removed activationEvents checking and updating - unnecessary now.  
&emsp;&emsp; 4.6.1 Reworked completionProvider for more intellisense, especially when manually invoked.  
&emsp;&emsp; 4.6.2 Incorporated `runCommands` for pre/postCommands.  

* 4.5.0 Added `$CURRENT_TIMEZONE_OFFSET` and `${CURRENT_TIMEZONE_OFFSET}` and `${ CURRENT_TIMEZONE_OFFSET }`.  

* 4.4.0 Introduced `reveal` argument for `findInCurrentFile` command.  Reveal `first/next/last` options.  
&emsp;&emsp; Escaped glob characters '?*[]' in file/folder names for `files to include` and `${resultsFiles}`.  
&emsp;&emsp; 4.4.5 `reveal` argument works for `"restrictFind": "line/once" now.  

* 4.3.0 Introduced `onceExcludeCurrentWord` and `onceIncludeCurrentWord` (`once` is deprecated).  
&emsp;&emsp; Made lineNumber/lineIndex matches work with the `once...` values.  

* 4.2.0 Introduced `args.run` to run js code as a side effect and not necessarily a replacement.  

* 4.1.0 Made all `next..` and `previous...` `restrictFind` options reveal.  
&emsp;&emsp; Made `cursorMoveSelect` work better with alternate-like regexes: `"$1|$2"` for example.  
&emsp;&emsp; Added `{n:/snakecase}` transform.  
&emsp;&emsp; Can do case modifications on conditionals and case transforms now.  `\\U${1:add this text}`.  
&emsp;&emsp; Check args of pre/postCommands works with command objects (i.e., with arguments).  

* 4.0.0 Added `previous...` options to `restrictFind`.  
&emsp;&emsp; Added the ability to use the vscode api in a javascript operation.  
&emsp;&emsp; More use of outputChannel, to check arguments.  
&emsp;&emsp; Can use `${getTextLines:(${lineIndex/Number}+-/*%n)}}`.  
&emsp;&emsp; Replace `forEach` with `await Promise.all(editor.selections.map(async (selection) => {` to get async.  

* 3.4.0  Refactor jsOPeration command parsing.  Bug fixes on search in file/folder commands.  

* 3.3.0  Move `postCommands` into individual transform functions.  Run them only if a find match.  
&emsp;&emsp; `cursorMoveSelect` in whole document restricted to find match ranges.  

* 3.2.0  Added the variables `${getDocumentText}` and `${getLineText:n}`.  
&emsp;&emsp; 3.2.5 Rename `${getLineText:n}` and add `${getLineText:n-p}` and `${getLineText:n,o,p,q}`.  
&emsp;&emsp; 3.2.6 Fix setting `filesToInclude` to  resolved `${resultsFiles}`.  

* 3.0.0  Enable multiple searches in `runInSearchPanel`.  
&emsp;&emsp; Added snippet variable resolution to  `runInSearchPanel`.  
&emsp;&emsp; Added a `delay` arg to `runInSearchPanel`.  
&emsp;&emsp; 3.1.0 Escape /'s in a replace.  Added outputChannel.  

* 2.4.0  Use capture groups in `find`.  
&emsp;&emsp; 2.4.2 Restrict number of capture groups to 9.  
&emsp;&emsp; 2.4.3 Fixed `cursorMoveSelect` and once/line.  Added ignore langID's.  

* 2.3.0  Can now execute vscode commands with arguments.  

* 2.2.0  Added the ability to run vscode commands **before** performing the find.  
&emsp;&emsp; Improved `^` and `$` regex line delimiter handling in `cursorMoveSelect`.  

* 2.1.0 Added intellisense for `find` snippet variables.  
&emsp;&emsp;Fixed `find` `${TM_CURRENT_LINE}` resolution.  

* 2.0.0 Work on ` $${<operation>}$$ `, adding `$$` to the end for parsing.  **Breaking change**.  
&emsp;&emsp; Added snippet-like cursor replacements.  
&emsp;&emsp; Added ability to have an **array of code** for jsOp `replace`.  
&emsp;&emsp; Added snippet variables like `${CURRENT_HOUR}`, `${LINE_COMMENT}`, `${TM_CURRENT_LINE}`, etc.  

* 1.1.0 Work on ` $${<operation>} `, adding `return`.  **Breaking change**.  

* 1.0.0 Added ability to do math and string operations on `findInCurrentFile` replacements.  
&emsp;&emsp; Can do multiple finds and replaces in a single keybinding or setting.  

* 0.9.8 Added more `lineNumber/Index` support.  Added `matchNumber/Index` variable.  
* 0.9.7 Added error checking for arguments.  Added support for `onlyOpenEditors` argument.  

-----------------------
