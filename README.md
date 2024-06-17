# find-and-transform  

## Highlights  

* New for v5.1.0: can now use `${getInput}` multiple times in the same argument.  Example:s  

```json
"find": "const ${getInput} = \\U${getInput}",       // two input prompts, capitalize the second
"find": "$${ return ${getInput} * 3; }$$ $${ return ${getInput} * 4;} $$",

"find": "(${CLIPBOARD}) (${selectedText})",
"replace": "${1:+ ${getInput}} ${2:+ ${getInput}}"
// note that the replace runs separately for each match, so you would be prompted twice for EACH replacement
```

* New for v5.0.0: `${getInput}` can be used in many options - including inside a `$${ jsOperation }$$` - and the variable `${/}` (which indicates a path separator) has been added.  A `$${ jsOperation }$$` can be used in a `find` now.  

* New for v4.8: `preserveSelections` argument, do not move any cursors or change location of existing selections in any way.  

* New for v4.7: `runWhen` and `ignoreWhiteSpace` arguments, the `"restrictFind": "matchAroundCursor"` option and the `"find": "${getFindInput}"` variable.  

* Option deprecated: `${getFindInput}` is being replaced by `${getInput}` because now it can be used in a `replace`, `run`, `postCommands`, `cursorMoveSelect`, `filesToInclude` or `filesToExclude` value as well as a `find` value.  With v.5.0.0 both will continue to work, but you will get intellisense completions for `${getInput}` only.  

* Option deprecated: `once` as a value for the `restrictFind` argument.  It is being replaced by `onceExcludeCurrentWord` which functions exactly as `once` does, and `onceIncludeCurrentWord` which works a little differently.  See more below within [once restrictFind Values](#details-on-the-restrictfind-and-cursormoveselect-arguments).  

------------

1. &nbsp; Find and transform text in a single file with many kinds of transforms.  
2. &nbsp; Search across files with pre-defined options.
3. &nbsp; Do a series of find and replaces in the current file.
4. &nbsp; Do a series of finds and a replace across files, using only the results files from previous searches. See [Multiple searches across files.](searchInPanel.md#multiple-searches).  

5. &nbsp; Execute javascript code, like math or string operations, on replacements.  
&nbsp;&nbsp;Execute standalone javascript code for side effects, see example below.  

6. &nbsp; Use the vscode api or node packages like `path`, `os`, `fs`, etc. in a replacement.  

7. &nbsp; Supports using path or snippet variables in the Search Panel or in a Find in the current file.  
8. &nbsp; Replacements can include case modifiers, like `\U`, conditionals, as in if found capture group 1 add other text, snippet-like transforms like `${1:/pascalcase}` and more.  

9. &nbsp; Save named settings or keybindings for finds or searches.  

10. &nbsp; After replacing some text, optionally move the cursor to a next designated location with `cursorMoveSelect`.
11. &nbsp; All `findInCurrentFile` commands can be used in `"editor.codeActionsOnSave": []`. &emsp; See &nbsp;[running commands on save](codeActions.md).

12. &nbsp; Insert any resolved value, like a javascript math or string operation, at the cursor(s). No `find` is necessary.

13. &nbsp; I can put a numbered capture group, like `$1` into a `find`?  See [Make easy finds with cursors.](#using-numbered-capture-groups-in-a-find).  
14. `${getDocumentText}` and `${getTextLines:n}` to get text anywhere in the document to use for replacement terms.  
15. `${getInput}`: &nbsp;&nbsp;&nbsp; `"${getInput}"` will trigger an input box for the `find` query, `replace`, `run`, `postCommands`, `cursorMoveSelect`, `filesToInclude` and `filestoExclude` text where you can enter a string or a regular expression.  Even within a js operation.  

-----------------

Below you will find information on using the `findInCurrentFile` command - which performs a find within the current file, like using the Find Widget but with the ability to save these file/replaces as settings or keybindings and many more variables and javascript operations are supported.  Some of the information here will be useful to using the `runInSearchPanel` as well - so you should read both.  See  [Search using the Panel](searchInPanel.md).  

-----------------

### Table of Contents

&emsp; &emsp; [1. `preCommands` and `postCommands`](#precommands-and-postcommands)  

&emsp; &emsp; [2. `enableWarningDialog` Setting](#contributed-setting)  

&emsp; &emsp; [3. Using Newlines](#using-newlines)  

&emsp; &emsp; [4. `findInCurrentFile` Arguments](#what-arguments-can-a-findincurrentfile-setting-or-keybinding-use)  

&emsp; &emsp; [5. Using numbered capture groups in a `find`](#using-numbered-capture-groups-in-a-find)

&emsp; &emsp; [6. How to Insert a value at the Cursor](#how-to-insert-a-value-at-the-cursor)  

&emsp; &emsp; [7. Running Multiple finds or replaces](#running-multiple-finds-and-replaces-with-a-single-keybinding-or-setting)  

&emsp; &emsp; [8. Running Javascript Code in a Replacement](#running-javascript-code-in-a-replacement)  

&emsp; &emsp; &emsp; [a. Math Operations in Replacements](#doing-math-on-replacements)  
&emsp; &emsp; &emsp; [b. String Operations in Replacements](#doing-string-operations-on-replacements)  
&emsp; &emsp; &emsp; [c. Using the vscode api or other packages, like path, in Replacements](#using-the-vscode-api-on-replacements)  
&emsp; &emsp; &emsp; [d. More Operations in Replacements](#doing-other-javascript-operations-on-replacements)  

&emsp; &emsp; [9. Running Javascript Code as a Side Effect](#running-javascript-code-as-a-side-effect)  

&emsp; &emsp; [10. Special Variables](#special-variables)  

&emsp; &emsp; &emsp; [a. Path Variables: Launch or Task-like Variables](#launch-or-task-variables-path-variables)  
&emsp; &emsp; &emsp; [b. Snippet Variables: Snippet-like Variables](#snippet-variables)  
&emsp; &emsp; &emsp; [c. Case Modifiers: `\\U$1`](#case-modifier-transforms)  
&emsp; &emsp; &emsp; [d. Conditional Replacements: `${1:+add this text`](#conditional-replacements-in-findincurrentfile-commands-or-keybindings)  
&emsp; &emsp; &emsp; [e. Snippet Transforms: `${3:/capitalize}`](#snippet-like-transforms-replacements-in-findincurrentfile-commands-or-keybindings)  
&emsp; &emsp; &emsp; [f. More Examples of Variable Transforms](#examples)  

&emsp; &emsp; [11. Using `restrictFind` with the `matchAroundCursor` option](#using-restrictfind-with-the-matcharoundcursor-option)  

&emsp; &emsp; [12. Using `restrictFind` and `cursorMoveSelect`](#details-on-the-restrictfind-and-cursormoveselect-arguments)  

&emsp; &emsp; &emsp; [a. Some `"restrictFind": "next...` option examples](#some-restrictfind-next-option-examples)  

&emsp; &emsp; [13. Settings Examples](#sample-settings)  

&emsp; &emsp; [14. Keybinding Examples](#sample-keybindings)  

&emsp; &emsp; &emsp; [a. `lineNumber` and `lineIndex`](#using-linenumber-or-lineindex-in-the-find)  
&emsp; &emsp; &emsp; [b. Nearest Words at Cursors](#nearest-words-at-cursors)  
&emsp; &emsp; &emsp; [c. simple find and replace](#find-and-replace-keys-with-no-restrictfind)  
&emsp; &emsp; &emsp; [d. restrictFind: selections](#find-and-replace-with-restrictfind-selections)  
&emsp; &emsp; &emsp; [e. find argument but no replace](#find-but-no-replace-key)  
&emsp; &emsp; &emsp; &emsp; [i. find, no replace, restrictFind: selections](#find-and-no-replace-with-restrictfind-selections)  
&emsp; &emsp; &emsp; [f. no find argument but with a replace](#with-a-replace-key-but-no-find-key)  

&emsp; &emsp; [15. Demonstrating `cursorMoveSelect` after replacement](#demonstrating-cursormoveselect-after-replacement)  

&emsp; &emsp; [16. `matchNumber` and `matchIndex`](#matchnumber-and-matchindex)  

&emsp; &emsp; [17. `reveal` Options](#reveal-options)  

&emsp; &emsp; [18. `ignoreWhiteSpace` Option](#using-the-ignorewhitespace-argument)  

&emsp; &emsp; [19. `preserveSelections` Option](#using-the-preserveselections-argument)  

<br/>

-----------------

## preCommands and postCommands

```jsonc
{
  "key": "alt+r",                      // whatever keybinding you want
  "command": "findInCurrentFile",
  "args": {
    
    "preCommands": [                 
      "cursorHome",                    // move cursor to start of text
      {
        "command": "type",             // insert "howdy " at cursor
        "args": {
          "text": "howdy "             // same args as a keybinding would have
        }
      },
      "cursorEndSelect"                // select from cursor to end of line
    ],
    
    // ... other options, like find/replace, etc.
    // and you can 'find' text that you might have inserted in the preCommands
    
    "postCommands": "editor.action.insertCursorAtEndOfEachLineSelected",
    
    "runPostCommands": "onceIfAMatch/onceOnNoMatches/onEveryMatch"  // default is "onceIfAMatch"
  }
}    
```

Above is an example of the `preCommands` and `postCommands` arguments.  

`preCommands` are run before any `find` or `replace` occurs.  It can be a single string or an object or an array of strings/objects.  The arguments `preCommands` and `postCommands` can appear anywhere in the arguments.  All the arguments can be in any order.  

`postCommands` are run after the find and any replace has occurred.  The `runPostCommands` argument controls how the `postCommands` are run: one time no matter how many find matches there may be (this is the default), one time only if there were no find matches, or run the `postCommands` once for each find match - this last option is currently **EXPERIMENTAL** and will not work in all possible situations.  

Use the commands from vscode's Keyboard Shortcuts context menu and `Copy Command ID` - the same command ID's you would use in a keybinding.  And the same for the `args` of each of those commands - see the `type` example above.  

`preCommands` are particularly useful when you want to move the cursor to a different word or **insertion point** (like moving the cursor to the beginning of the line and then insert something) before doing anything else.  

 For example, some replacements are much easier to do when the current line is selected first.  That way, when the replacement occurs it replaces the entire line.  Otherwise you would first have to select that line and then run the keybinding.  The following example only works if the current line is selected first.  

 In the example below there is **no `find` argument**.  As you will learn, when that is the case this extension will make the `find` from the current word at the cursor or the current selection.  It can do that for multiple cursors too.  

 Note also in the demo that cursors are placed at the end of all the lines thanks to the `postCommand`.  The keybinding used in the demo is below.  The replacement is fairly complicated - it is a small bit of javascript code that can perform many operations to create a complicated replacement.  More on javascript operations later.  

 ```jsonc
 {
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
        
    "preCommands": [                                 // select entire line where there is a cursor
      "cursorHome", 
      "cursorEndSelect"    
    ],
    
    "postCommands": "editor.action.insertCursorAtEndOfEachLineSelected",
    
    "replace": [
      "$${",                      // run these math and string operations to create the replacement
      
        "const ch = '/';",
        "const spacer = 3;",                                  // spaces around the text at the center
        "const textLength = '${TM_CURRENT_LINE}'.length;",
        "const isOdd = textLength % 2;",
        "const surround = Math.floor((80 - (2 * spacer) - textLength) / 2);",
        
        "let result = ch.padEnd(80, ch) + '\\n';",
        "result += ch.padEnd(surround, ch) + ''.padEnd(spacer, ' ');",
        "result += '${TM_CURRENT_LINE}'.padEnd(textLength + spacer, ' ') + ch.padEnd(surround, ch);",
        
        "if (isOdd) result += ch;",                          // add one if textLength is odd
        "result += '\\n' + ch.padEnd(80, ch);",
        "return result;",
      
      "}$$"
    ],
    "isRegex": true,
    "restrictFind": "line"                     // run on a line or lines with cursors only
  }
 }
 ```

 &emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/surroundPad.gif?raw=true" width="800" height="300" alt="surround and pad selected text"/>  

-----------------

## Contributed Setting

This extension contributes one setting relevant to the `findInCurrentFile` settings and keybindings:  

* `"find-and-transform.enableWarningDialog"` **default = true**

This setting controls whether the extension will attempt to find errors in your keybinding or settings argument keys or values.  

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "trouble",
    "replace": "howdy",
    "isRegex2": true,              // error, no "isRegex2" key, should be "isRegex"
    "restrictFind": "twice",       // error, no such value allowed for "restrictFind"
    "matchCase": "true",           // error, should be a boolean not a string
    "matchCase": true              // correct
    }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/enableWarningDialogSetting.jpg?raw=true" width="500" height="150" alt="enable warning dialog setting"/>  

If the `enableWarningDialog` is set to true, errors will be presented in a notification message either when attempting to run a keybinding, a setting command or on save of a setting if there are bad arguments.  Not all errors can be detected though so don't rely solely on this.  

The dialogs are modal for the keybindings, and non-modal for the settings.  The command can then be run or aborted.  

------------------  

## Using newlines

* Find: Use `\r?\n` with `isRegex` set to true is probably the safest across operating systems.  But in a `[]` in a regex just use `[\n]`, not `[\r?\n]`.  
* Replace: `\n` is probably sufficient, if not, try `\r\n`.  
* In a javascript operation replacement, make sure it is included in backticks so the newline is interpreted as a string ``` $${ `first line \n second line` }$$ ```.  
* If you use a variable like `${getDocumentText}` or anything that **might** have newlines in the text, surround that variable with backticks like this example:

```jsonc
"replace": [
  "$${",
    "const previousLines = `${getTextLines:0-2}`;",  // or
    "return `${getDocumentText}`.toLocaleUpperCase();",
  "}$$"
],
```

These forms work for newlines in a jsOperation `replace` or `run`:  

1. ``` `\\n` ``` inside backticks

2. ``` `\n` ```  inside backticks

3. `'\\n'` inside single quotes, double-escaped

* `'\n'` (inside single quotes) **DOES NOT Work** in a `"replace": "$${ jsOperation }$$"` or `"run": "$${ jsOperation }$$"` (but will in a simple `replace`).  This is because `\n` needs  to be double-escaped in a jsOperation, unless it is in backticks.  

```jsonc
// a simple replace, i.e., no $${ some jsOp }$$ // use \n only
"replace": "seed\nhow\ndy more\t\t\ttstuff",  // only single-esacped \n and \t work in a simple replace
```

Newline examples that work and don't work:  

```js
  "replace": "howdy\nthere",  // works, a simple replace
  
  "replace": "$${return 'first line \n second line'; }$$",  // \n does not work surrounded by single quotes in a jsOp
  "replace": "$${return 'first line \\n second line'; }$$", // \\n works surrounded by single quotes
  "replace": "$${return `first line \n second line`; }$$",  // \n works surrounded by backticks
  "replace": "$${return `first line \\n second line`; }$$", // \\n works surrounded by backticks
  ```
  
  I suggest using backticks whenever there is a newline or tab, `\t`, involved or the resolved variable could contain newlines or tabs.  

--------

* If you use newlines in a replace, the `cursorMoveSelect` option will try to properly calculate the new selection positions.  This is tricky, especially for the end of a selection(s) where newlines have been added - in a replacement - where there were none before.  

<br/>  

-----------------  

## What arguments can a `findInCurrentFile` setting or keybinding use:

> These are all discussed in more detail elsewhere.  

```jsonc
{                                     // in keybindings.json 
  "key": "alt+r",
  "command": "findInCurrentFile",  
  
  "args": {
    "description": "some string",      // for your information only, no function
    
    "find": "(trouble)",               // can be plain text, a regexp or a special variable
    
    "preserveSelections": true,        // keep all cursor locations and selections unchanged, discussed below
    
    "ignoreWhiteSpace": true,           // default = false, makes the find work across newlines and other whitespace 
    
    "replace": "\\U$1",                // text, variables, conditionals, case modifiers, operations, etc.
    
    "replace": "$${ someOperation }$$",
    
    "replace": [                       // run code, including the vscode extension api
      "$${",                           // and do a replace with the result
        "operation;",                  // insert at the cursor or replace selections
        "operation;",
        "operation;",
        "return result;",
      "}$$",
    ],
    
    "run": [                           // run code, including the vscode extension api
      "$${",                           // but do not do a replace with the result
        "operation;",
        "operation;",
        "operation;",
      "}$$",
    ],
    
    "runWhen": "onceIfAMatch",         // default, trigger the "run" operation only once no matter how many matches
    "runWhen": "onEveryMatch",         // trigger the "run" operation for each successful find match
    "runWhen": "onceOnNoMatches",      // only trigger the "run" operation if there is no find match
    
    "isRegex": true,                   // boolean, will apply to 'cursorMoveSelect' as well as the find query
    "matchWholeWord": true,            // boolean, same as above
    "matchCase": true,                 // boolean, same as above
    "restrictFind": "selections",      // restrict find to document, selections, line, once... on line or next
    
    "reveal": "first/next/last",       //  the default is for no reveal
    
    "cursorMoveSelect": "^\\s*pa[rn]am"     // select this text/regexp after making the replacement
  }
}
```

```jsonc
"findInCurrentFile": {                        // in settings.json

  "upcaseSelectedKeywords": {
  
    "description": "some string",             // for your information only, no function
  
    "title": "Uppercase Selected Keywords",   // used for Command Palette, required
    
    "find": "(Hello) (World)",
    "replace": "\\U$1--${2:-WORLD}",          // conditional, if no capture group 2, add "WORLD"
    
    "isRegex": true,                          // default = false
    "matchCase": false,                       // default = false
    "matchWholeWord": true,                   // default = false
    "restrictFind": "selections",             // default = document
    
    "cursorMoveSelect": "Select me"
  }
}
```

> Note that the `preserveCase` option is not yet supported.  

> **Defaults**: If you do not specify an argument, its default will be applied.  So `"matchCase": false` is the same as no `"matchCase"` argument at all.  

> **Important**: Some checking for bad `args` keys and values will be done by this extension for both `findInCurrentFile` and `runInSearchPanel` commands.  For example, if you used `"restrictFind": "selection"` (instead of the proper `"restrictFind": "selections"`) or `"matchCases": false` (should be `"matchCase": false`) - a error message will be printed to the **Output** (under the dropdown *find-and-transform* option) notifying you of the errors and the current command will be aborted with no action.  So any bad `args` option will stop execution and nothing will be done.  

-----------

## Using numbered capture groups in a `find`

### &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; &emsp;  &emsp; &emsp; Example : `"find": "\\$1(\\d+)"`

> Any numbered capture group, like the double-escaped `\\$1` above, will be **replaced in the find query by the first selection** in the current file (`\\$2` will be replaced by the second selection and so on).  You can easily make generic find regex's this way, that are determined by your selections not by hard-coding them first.  After these replacements, the `find` is run.  

a. This works for both find in a file or search across files, keybindings or settings.  
b. The first selection, which can be just a cursor in a word, is really the first selection made in the file - it may actually appear before or after the second selection!  
c. The selections can be words or longer parts of text.  
d. If you use a numbered capture group higher than the number of selections, those are replaced with `""`, the empty string.  

```jsonc
{
  "key": "alt+r",                    // as a keybinding in keybindings.json  
  "command": "findInCurrentFile",    // or "runInSearchPanel" to search across files
  "args": {
    
    "find": "\\$1(\\d+)",            // double-escaping necessary
    
    // "find": "(\\$1|\\$2)-${lineNumber}"  // group 1 or group 2 followed by its line number
    
    // "find": "\\$1(\\d+)\\$2",     // up to 9 capture groups
    // "replace": "",                // if no replace, matches will be highlighted
    
    // "isRegex": true necessary if other parts of the find use regexp's, like \\d, etc.
    "isRegex": true                  // not necessary for the \\$n's + other plain text
  }
},

{
  "key": "alt+b",
  "command": "runInSearchPanel",     // uses the Search Panel
  "args": {

    "find": "\\$1\\.decode\\([^)]+\\)",
       
    "triggerSearch": true
    // "replace": "?????",           // not necessary
    // "filesToInclude": "${relativeFileDirname} or other path variables",
    // "filesToExclude": "<other path variables>",
    // "onlyOpenEditors": true
    // other options: matchCase/matchWholeWord/preserveCase/useExcludeSettingsAndIgnoreFiles
  }
},
```

Make it into a setting:  

```jsonc
"findInCurrentFile": {                          // in settings.json or a .code-workspace file (in its settings object)
  "findRequireDecodeReferences": {
    "title": "Find in file: package function references",
    "find": "\\$1\\.decode\\([^)]+\\)",
    "isRegex": true,
  }
},

"runInSearchPanel": { 
  "searchRequireDecodeReferences": {
    "title": "Search files: package function references",
    // "preCommands": "editor.action.clipboardCopyAction",
    "find": "\\$1\\.decode\\([^)]+\\)",
    "isRegex": true,
    "triggerSearch": true,
    
    // "filesToInclude": "${fileDirname}"
    // "onlyOpenEditors": true
    // and more options
  }
},
```

And then those settings' commands can be triggered by the Command Palette or by a keybinding like:

```jsonc
{
  "key": "alt+k",
  "command": "findInCurrentFile.findRequireDecodeReferences"
}
```

--------------------

## How to insert a value at the cursor

If you do not want to find something and replace it but just want to insert some value at the cursor use a keybinding or setting like the following:

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",  
  "args": {
                                                             // no find key!!
    "replace": "\\U${relativeFileDirname}",                  // insert at cursor
    "replace": "Chapter ${matchNumber}",                     // Chapter 1, Chapter 2, etc. for each cursor
    "replace": "Chapter $${ return ${matchNumber} * 10 }$$", // Chapter 10, Chapter 20, etc.
  }
}
```  

There are two ways to use this - when there is no `find`:

1. The cursor is at a word (or a word is selected, same thing).  The `find` is constructed from that word/selection and the `replace` will replace any matches.  

2. The cursor is not at any word - on a blank line or separated by spaces from any word.  Then there is **no find** constructed and the `replace` is just inserted where the cursor(s) are located.

Demo using `"replace": "Chapter ${matchNumber}"` and no `find`:

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/insertionsDemo.gif?raw=true" width="300" height="250" alt="insertions at cursor demo"/>

Explanation for above:  In the first case, the cursor is placed on `Chapter`, so that is the `find` and each occurrence of it is replaced with `Chapter ${matchNumber}`.  In the second case, multiple cursors are placed on empty lines so there is no find, in which case `"Chapter ${matchNumber}"` is inserted at each cursor.  

---------

## Running multiple finds and replaces with a single keybinding or setting

The `find` and `replace` fields can either be one string or an array of strings.  Examples:  

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",  
  
  "args": {
  
    "find": "(trouble)",                      // single string - runs once
    "find": ["(trouble)"],                    // an array of one string is allowed - runs once

    "replace": "\\U$1",                       // replace "trouble" with "TROUBLE"

    "find": ["(trouble)", "(more trouble)"],  // as many comma-separated strings as you want

    "replace": ["\\U$1", "\\u$1"],            //  replace "trouble" with "TROUBLE" and
                                              //  replace "more trouble" with "More trouble" 

    "isRegex": true
  }
}
```
  
1. If there are more `find` strings than `replace` strings: then the last `replace` value will be used for any remaining runs.  
2. If there are more `replace`'s than `find`'s: then a generated find (see more at the "words at cursors" discussion below) using the cursor selections will be used for any remaining runs.  This is usually the prior replacement text.  

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",  
  
  "args": {
  
    "find": ["(trouble)", "(more trouble)"],  // two finds

    "replace": "\\U$1",                       // \\U$1 will be used for both replaces so
                        // replace "trouble" with "TROUBLE" and "more trouble" with "MORE TROUBLE"

    "isRegex": true
  }
}
```

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",  
  
  "args": {
  
    "find": "(trouble)",                       // one find

    "replace": ["\\U$1", "\\u$1"],             // more replaces than finds
                        // replace "trouble" with "TROUBLE" on first run and
                        //  on second run replace any selected words with their capitalized version

    "isRegex": true
  }
}
```

You might want to run two or more commands in a sequence like this to accomplish some replacements that are difficult  to do in one regexp but much simpler with two find/replaces in sequences.  Like:

```jsonc
"find":    ["(${relativeFile})", "(${fileExtname})"],
"replace": ["\\U$1", ""],
"isRegex": true
```

On the first pass above, the fileName will be uppercased.  On the second run, the file extension (like `.js`) will be matched and replaced with nothing (the empty string) and so will be removed.  

```jsonc
"find": ["(someWord)", "(WORD)"],
"replace": ["\\U$1", "-\\L$1"],
"isRegex": true,
"matchCase": true
```

On the first pass above, "someWord" will be replaced with "SOMEWORD".  On the second pass, find "WORD" and replace it with "-word".  So you will replace "someWord" with "SOME-word" after both runs.  Yes, you could make a single regex to do this in one run, but in more complicated cases using two or more runs can make it simpler.  

-------------

## Running Javascript Code in a Replacement  

It is difficult to debug errors in javascript code you write in a replacement as below.  If your keybinding or setting generates an error, you will get a warning message notifying you of the failure.  And if you check your `Output` tab, and chose `find-and-transform` from the dropdown menu, you may get some helpful information on the nature of the error.  

You can also put `console.log(...)` statements into the replacement code.  It wil lbe logged to your `Help/Toggle Developer Tools/Console`.  

### Doing math on replacements

Use the special syntax **` $${<some math op>}$$ `** as a replace or find value.  Everything between the brackets will be evaluated as a javascript function so you can do more than math operations, e.g., string operations (see below).  This does **not** use the `eval()` function.  Examples:  

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {
    "find": "(?<=<some preceding text>)(\\d+)(?=<some following text>)",  // postive lookbehind/ahead
    
    "find": "$${return ${getInput} * 3;}$$",       // do math on the getInput and match it
    
    "find": "(howdy)-(${lineNumber})",
    "replace": "${1:/capitalize}-$${return $2 * 10;}$$",  // howdy-3 => Howdy-30 (on line 3)
    
    
    "replace": "$${return $1 + $1}$$",             // will double the digits found in capture group 1  
    "replace": "$${return 2 * $1 }$$",             // will double the digits found in capture group 1  

    "replace": "$${return $1 + $2}$$",             // add capture group 1 to capture group 2  

    "replace": "$${return $1 * 2 + `,000` }$$",    // double group 1, append `,000` to it.  1 => 2,000  

    "replace": "$${return $1 * Math.PI }$$",       // multiply group 1 by Math.PI 
    
    "replace": "$${const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738)); return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long' }).format(date)}",
                                                   // insert: Saturday, 19 December 2020 at 20:23:16 GMT-7
                                                   
    "replace": [                                   // same output as above
      "$${",                                       // put opening wrapper - '$${' on its own line!
        "const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738));",
        "return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long' }).format(date)",
      "}$$"                                        // put closing wrapper - '}$$' on its own line!
    ],     

    "isRegex": true  
  }
}
```  

> **IMPORTANT**: you must use semicolons at the end of statements - except for the final `return` statement (or if the only statement is a `return something`).  Anything with multiple statements must use semicolons.  The operations will be loaded into a `Function` which uses `"use strict"` which requires semicolons.  

### A `jsOperation` written as an array of statements:  

 &nbsp; &nbsp; &nbsp; If you use the expanded form of replacement with a `jsOperation` written as an array (as in the last example immediately above), that entire array will be transformed into a single long array item like `$${ <multiple statements> }$$` and so it will then become a single replace array item.  So this replacement:

 ```jsonc
"replace":  [
  "$${",
    "let a = 10;",
    ...
    "return 'howdy';",
  "}$$",
  
  "$${",
    "let v = 12;",
    ...
    "return 'pardner';",
  "}$$"
]
 ```

 will become  

 ```jsonc
"replace":  [
  "$${ let a = 10; ... return 'howdy'; }$$",
  "$${ let v = 12; ... return 'pardner'; }$$"
]
```

The above is 2 `replace`'s.  The first one will be applied to the first `find`.  And the second `replace` will be applied to the second `find`.  

-------------  

### Doing string operations on replacements

You can also do string operations inside the special syntax ` $${<operations>}$$ `.  But you will need to ***"cast"*** the string in backticks, single quotes or escaped double quotes like so:  

```text

$${ return `$1`.substring(3) }$$  use backticks (I recommend backticks) or  

$${ return '$1'.substring(3) }$$  or  use single quotes

$${ return \"$1\".includes('tro') }$$  escape the double quotes
```

> You **must** use one of the above if the value, like a capture group or some variable, could contain newlines.  

> Any term that you wish to be interpreted **as a string** must be enclosed in ticks or quotes.  So in the first example below to replace the match with the string `howdy` I used backticks.  This is only necessary within the operations syntax `$${<operations>}$$`, otherwise it is interpreted as an unknown variable by javascript.  

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {

    "find": "(trouble) (brewing)",

    "replace": "$${ return `howdy` }$$",                 // replace trouble brewing => howdy  
    "replace": "howdy",                                  // same result as above   

    "replace": "$${ return `$1`.indexOf('b') * 3 }$$",   // trouble brewing => 12  

    "replace": "$${ return `$1`.toLocaleUpperCase() + ' C' + `$2`.substring(1).toLocaleUpperCase() }$$",
    // trouble brewing => TROUBLE CREWING  

    "replace": "$${ return `$1`.replace('ou','e') }$$",  // trouble => treble 
    
    // using a capture group in replace/replaceAll, see note below 
    "replace": "$${ return `$1`.replace('(ou)','-$1-') }$$",  

    "replace": "$${ return '$1'.split('o')[1] }$$",      // trouble => uble  

    "find": "(tr\\w+ble)",                               // .includes() returns either 'true' or 'false'  
    "replace": "$${ return '$1'.includes('tro') }$$",    // trouble will be replaced with true, treble => false  

    "find": "(tr\\w+ble)",                               // can have any number of $${...}$$'s in a replacment
    "replace": "$${ return '$1'.includes('tro') }$$--$${ return '$1'.includes('tre') }$$",
                                                         // trouble => true--false, treble => false--true

    "isRegex": true  
  }
}
```

* Note: If, in a javascript operation you have a `<sring>.replace(/../, '$n')` (or `replaceAll`) with a capture group in the replacement like:

```jsonc
"replace": [
  "$${",           // put opening jsOperation wrapper on its own line
  
  "if (`${fileBasenameNoExtension}`.includes('-')) {",
    "let groovy = `${fileBasenameNoExtension}`.replace(/(-)/g, \"*$1*\");",  // $1 here
    "console.log(groovy);",          // check the value in Toggle Developer Tools/Console
    "return groovy[0].toLocaleUpperCase() + groovy.substring(1).toLocaleLowerCase();",
  "}",
  "else {",
    "let groovy = `${fileBasename}`.split('.');",
    "groovy = groovy.map(word => word[0].toLocaleUpperCase() + word.substring(1).toLocaleLowerCase());",
    "return groovy.join(' ');",
  "}",
  
  "}$$"           // put closing jsOperation wrapper on its own line
],
```

that capture group will be from the `replace/replaceAll` as you would expect.  Other capture groups in a javascript operation will reflect the capture groups from the `find` argument.  

> You can combine math or string operations within **` $${<operations>}$$ `**.  

-------------  

### Using the vscode api on replacements

If you wish to use [the vscode api](https://code.visualstudio.com/api/references/vscode-api) in a replacement you can do so easily. For instance, to insert the current filename capitalized you could use this keybinding:

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {

    "replace": [
      "$${",

        "const str = path.basename(document.fileName);",
        "return str.toLocaleUpperCase();",
      
      "}$$"
    ]
  }
}
```

1. `document` = `vscode.window.activeTextEditor.document` and is provided as simply `document`.  
2. Any other node api can be used as `vscode.<more here>`.  
Do not do `const vscode = require('vscode');` it has already been declared and you will get this error:
`SyntaxError: Identifier 'vscode' has already been declared`.  You can declare it as something simpler like `const vsc = require('vscode');` just not as `vscode` again.  
3. `path` is also provided without needing to import it.  So don't `const path = require('path');` = error.  
4. You should be able to `require` the `typescript` and `jsonc-parser` libraries without needing to install them on your machine.  
5. If you get `[object Promise]` as the output of the replacement, you are trying to access an asynchronous method (or `thenable` return) - which will not work.  

```jsonc
"replace": [
  "$${",
    "let str = '';",
        // print a list of open file names in the active tabGroup
    "const tabs = vscode.window.tabGroups.activeTabGroup.tabs;",
    "tabs.forEach(tab => str += tab.label + '\\n');",  // note double-escaped newline
    "return str;",
  "}$$"
]
```

```jsonc
{
  "key": "alt+c",
  "command": "findInCurrentFile",  
  "args": {
    "replace": [   // print a list of full paths for open text documents by editor group
      "$${",

        "let str = '';",
        "const groups = vscode.window.tabGroups.all;",
        "groups.map((group, index) => {",
          "str += 'Group ' + (index+1) + '\\n';", 
          "group.tabs.map(tab => {",
            "if (tab.input instanceof vscode.TabInputText) str += '\\t' + tab.input.uri.fsPath + '\\n';",
            // "str += tab.label + '\\n';",
          "});",
        "str += '\\n';",
        "});",
        "vscode.env.clipboard.writeText( str );",
        "return '';",
        
      "}$$",
    ],
      
    // create a new file and paste into it
    "postCommands": ["workbench.action.files.newUntitledFile", "editor.action.clipboardPasteAction"]
  }
}
```

> For the above example which prints out the full path, there is no `find` so the replacement - just an empty string - will just be inserted at the cursor.  So make sure the cursor is not in or at a word boundary or that word will be treated as the `find` query and be replaced by an empty string.  There must be a `return` of some kind for a `replace` javascript operation.  

> It probably makes more sense to put the above javascript operation into a `"run"` argument if you are only going to use it as a side effect, like here where you store it in the clipboard to paste into a different file.  Then you don't care where the cursor is or whether there is any selected text already.  

Output of above replacement in a newly created file:

```text
Group 1
  c:\Users\Fred\AppData\Roaming\Code\User\keybindings.json
  c:\Users\Fred\AppData\Roaming\Code\User\settings.json
  c:\Users\Fred\OneDrive\Test Bed\test5.js
  c:\Users\Fred\OneDrive\Test Bed\zip\changed2.txt_bak
  c:\Users\Fred\OneDrive\Test Bed\zip\config.json

Group 2
  c:\Users\Fred\OneDrive\Test Bed\zip\test3.txt

```

```jsonc
"find": "${getTextLines:(${lineIndex}-1)}",  // get the line above the cursor

"replace": [
    "$${",                                     // get the line above the cursor
    
      "const sel = vscode.window.activeTextEditor.selection;",
      "const previousLine = document.lineAt(new vscode.Position(sel.active.line - 1, 0)).text;",
      
      // the below also works
      // "const previousLine = document.getText(new vscode.Range(sel.active.line-1, 0, sel.active.line-1, 100));",
      
      // below is the simplest
      "const previousLine = document.lineAt(new vscode.Position(${lineIndex}-1, 0)).text;",

      "return previousLine.toUpperCase();",
    
    "}$$"
],
```

The below will get the line above the cursor, put it into a capture group because it is surrounded by `()`, and capitalize it throughout the document (since there is no `restrictFind` value, `document` is the default).

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {
    "description": "capitalize the line above the cursor everywhere it occurs",
    
    "find": "(${getTextLines:(${lineIndex}-1)})",
    "replace": "\\U$1",
    "isRegex": true
  }
}
```

To capitalize only the preceding line:

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {
    "description": "capitalize the preceding line only",
    
    "find": "(${getTextLines:(${lineIndex}-1)})",
    "replace": "\\U$1",
    "restrictFind": "previousSelect",  // this makes it work on the preceding line only, will wrap at top of file
    // "restrictFind": "nextSelect",   // capitalize next instance of the find, will wrap at end of file
    "isRegex": true                    // must be here to treat the find as a regex
  }
}
```

```jsonc
"replace": [
  "$${",
    "const os = require('os');", 
    "return os.arch();",
  "}$$"
]
```

```jsonc
"replace": [
  "$${",

    "const { basename } = require('path');",  // you can re-import to rename or extract
    // "const path = require('path');",       // error: path is already declared
    "return basename(document.fileName);",
  
  "}$$"
]
```

```jsonc
"replace": [
  "$${",

    // change the current editor's fileName
    "const fsp = require('node:fs/promises');",
    "fsp.rename(document.fileName, path.join(path.dirname(document.fileName), 'changed2.txt'));",
    
    "return '';",   // return an empty string, else "undefined" is returned and inserted at the cursor(s)
  "}$$"
]
```

* While this last example does work, it seems odd to use a find and replace extension to change fileNames and run such commands that may have nothing to do with text replacements or insertions.  I can see a case where you want to change the fileName based on some text found in the current file though...

Better is to use the built-in `vscode.workspace.fs` for file operations:

```jsonc
"replace": [
  "$${",

    "const thisUri = vscode.Uri.file(document.fileName);",
    // the new filename could be derived from some text in the current file
    "const newUri = vscode.Uri.file(document.fileName + '_bak');",
    // this will rename the current file and it remains open
    "vscode.workspace.fs.rename(thisUri, newUri);",
  
    "return '';",  // return empty string
  
  "}$$"
]
```  

----------------

### Doing other javascript operations on replacements

> In a `replace` there **must be one or more `return` statements** inside the ` $${...}$$ ` for whatever you want returned.  

> Remember if you want a variable or capture group treated as a string, surround it with ticks or single quotes.  

> \`\\\U$1\` works in a javascript operation, \\\U\`$1\` does not work.  

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {

    "find": "(trouble) (brewing)",
    
    // replace the find match with the clipboard text length
    "replace": "$${ return '${CLIPBOARD}'.length }$$",

    "find": "(trouble) (times) (\\d+)",
    // replace the find match with capture group 1 uppercased + capture group 2 * 10 
    // trouble times 10 => TROUBLE times 100  
    "replace": "$${ return `\\U$1 $2 ` + ($3*10) }$$",
    
    "find": "(\\w+) (\\d+) (\\d+) (\\d+)",
    // dogs 1 3 7 => Total dogs: 11
    "replace": "$${ return `Total $1: ` + ($2 + $3 + $4) }$$",

    // compare the clipboard text length to the selection text length
    "replace": "$${ if (`${CLIPBOARD}`.length < `${selectedText}`.length) return true; else return false }$$",

    // the find match will be replaced by:
    // if the clipboard matches the string, return capture group 2 + the path variable
    "replace": "$${ return `${CLIPBOARD}`.match(/(first) (pattern) (second)/)[2] +  ` ${fileBasenameNoExtension}` }$$",
  
    "isRegex": true  
  }
}
```

<br/>  

```jsonc
"replace": [
  "$${",                                                  // opening jsOp wrapper on its own line
  "if (`${fileBasenameNoExtension}`.includes('-')) {",
                                                          // must use let or const for variables
    "let groovy = `${fileBasenameNoExtension}`.replace(/-/g, \" \");",
    "return groovy[0].toLocaleUpperCase() + groovy.substring(1).toLocaleLowerCase();",
  "}",
                                              // blank lines have no effect, indentation is irrelevant
  "else {",
    "let groovy = `${fileBasename}`.split('.');",
    "groovy = groovy.map(word => word[0].toLocaleUpperCase() + word.substring(1).toLocaleLowerCase());",
    "return groovy.join(' ');",
  "}", 
   
  "}$$",                                                 // closing jsOp wrapper on its own line
  
  "$${return 'second replacement'}$$",                   // 2nd replacement
  
  "\\U$1"                                                // 3rd replacement
  ```  
  
  All the code between each set of opening and closing wrappers will be treated as a single javascript replacement.  You can also put it all on one line if you want, like the `"$${return 'second replacement'}$$"` above.  The above `replace` will be treated as:
  
  ```jsonc
  "replace": ["a long first replacement", "2nd replacement", "3rd replacement"]
  ```

As long as you properly wrap your blocks of code, you can intermix single replacements or other code blocks.  You can have as many as you need.  See the discussion above about running multiple finds and replaces in a series.

A `settings.json` example:  

```jsonc
"findInCurrentFile": {                       // in settings.json
  "addClassToElement": {
    "title": "Add Class to Html Element",
    "find": ">",
    "replace": [
      "$${",
      "return ' class=\"\\U${fileBasenameNoExtension}\">'",
      "}$$"
    ],
    "isRegex": true,                        // not actually necessary here
    "restrictFind": "selections"            // replace only for those `>` in a selection
  }
}
```

Explanation for above: Find `>` and add `class="uppercased filename">` to it.  

------------------  

## Running Javascript Code as a side effect  

You may want to run some javascript code, including the vscode api's, but **NOT** to replace anything.  You may want to construct a string to paste somewhere or gather filenames for example.  Consider this example (in your `settings.json`):

```jsonc
"findInCurrentFile": {
  "buildMarkdownTOC": {             
    "title": "Build Markdown Table of Contents",  // will be in the Command Palette
    
    "find": "(?<=^###? )(.*)$",     // these will be selected
    
    "run": [                        // this will be run after the find selections and before any replace
      "$${",
        "const headers = vscode.window.activeTextEditor.selections;",
        "let str = '';",

        "headers.forEach(header => {",
          "const selectedHeader = document.getText(header);",
          "str += `* [${selectedHeader}](#${selectedHeader.toLocaleLowerCase().split(' ').join('-')})\\n`;",
        "});",

        "str = str.slice(0, -1);",   // remove last \n from str
        "vscode.env.clipboard.writeText(str);",  // note that a return statement isn't necessary for "run"
      "}$$"
    ],
    
    "isRegex": true,
    "postCommands": [
      "cursorTop", 
      "editor.action.insertLineAfter",  
      "editor.action.insertLineAfter", 
      "editor.action.clipboardPasteAction"
    ]
  }
}
```

This setting will select all the headers with 2 or more `##`'s, and then the `run` code will use those selections to construct a table of contents.  That will be saved to the clipboard.  

And lastly, the `postCommands` will move the cursor to the top, insert 2 blank lines and then paste the table of contents.  

This is demonstrated at [Stack Overflow: run custom code on selected text](https://stackoverflow.com/questions/64748430/is-there-a-way-to-run-custom-js-code-on-the-selected-text-in-vscode), with a keybinding shown as well.  

This pattern of a `find` - which will select all the matches as limited by the `restrictFind` option - and then those selections (or the capture groups from the `find` regex, can be acted on in a `run` operation is a very powerful method.  

> The `run` argument will be performed after any `find` and after any `replace`.  So you could, for example, use the `vscode.window.activeTextEditor.selections` that your `find` matches and selects and manipulate those new selections.  

------------------------

## Special variables

### Variables defined by this extension for use in args  

```diff
${resultsFiles}            ** explained below ** Only available in a 'runInSearchPanel' command

- ${getFindInput}                 deprecated, use ${getInput} 

+ ${getInput}              to enter the Find query or replacement text or cursorMoveSelect text or postCommand text
+                           or filesToInclude or filesToExclude via an INPUT BOX rather than in the keybinding/setting

${getDocumentText}         get the entire text of the current document
  
${getTextLines:n}          get the text of a line, 'n' is 0-based, so ${getLineText:1} gets the second line of the file

${getTextLines:n-p}        get the text of lines n through p inclusive, example  ${getTextLines:2-4}  

${getTextLines:(n-n)}      get the text of a line n-n, example  ${getTextLines:(${lineIndex}-1)} : get previous line
                           use the parentheses, if you want to do math to resolve to a line.  Can use `+-/*%`.  
                           
${getTextLines:n,p,q,r}    get the text from line `n`, column `p` through line `q`, column `r` inclusive, 
                           example  ${getTextLines:2,0,4,15}      
```

> INTELLISENSE: can be used in the keybindings or settings showing where the variables can be used. You will also get intellisense for any unused args (like `find`, `isRegex`, `matchCase`, etc.).  You can always get more intellisense by triggering it manually with <kbd>Ctrl/Cmd</kbd>+<kbd>Space</kbd> at many locations in your keybindings or settings.  

<br/>  

> ` ${resultsFiles}` is a specially created variable that will scope the next search to those files in the previous search's results. In this way you can run successive searches narrowing the scope each time to the previous search results files.  See &nbsp;  [Search using the Panel](searchInPanel.md).

* Here is an example using `${getDocumentText}`:  

```jsonc
{
  "key": "alt+e",
  "command": "findInCurrentFile",
  "args": {

    "replace": [
      "$${",
        // note the variables should be wrapped in backticks, so they are interpreted as strings
        "const fullText = `${getDocumentText}`;",
        // "const fullText = `${vscode.window.activeTextEditor.document.getText()}`;", // same as above
        // "const fullText = `${document.getText()}`;",                                // same as above
        
        // "const fullText = `${getLineText:3}`;",   // if you knew which line you wanted to get
         
        "let foundClass = '';",      
        "const match = fullText.match(/class ([^\\s]+) extends/);",
        "if (match?.length) foundClass = match[1];",
        
        "return `export default connect(mapStateToProps, mapDispatchToProps)(${foundClass})`;",
        
      "}$$"
    ],
    
    "postCommands": "cancelSelection"
  },
},
```

Notice there is no `find`, so that the result of the `replace` will be inserted at the cursor(s).  In this case, the `replace` will get the entire text and then `match` it looking for a certain class name as a capture group.  If found, it will be added to a value that is returned.  See this [Stack Overflow question](https://stackoverflow.com/questions/55281939/snippets-in-vs-code-that-use-text-found-in-the-file-with-a-regular-expression/55291542#55291542) to see this in action.  

The `${getDocumentText}` variable allows you to look anywhere in a document for any text or groups of text that you can find with a regex.  You are not limited  to the current line or the clipboard or selection for example.  

* Here is an example using `${getInput}`:  

```jsonc
{
  "key": "alt+c",
  "command": "findInCurrentFile",  
  "args": {
    "description": "I want to enter the Find query in an input box.",  // whatever text you want
    
    "find": "${getInput}",     // enter plain text or a regular expression in the input box that pops up
    
    "find": "${getInput} stuff \\U${getInput}",    // can use multiple ${getInput} variables

    // you can mix text with what you will input
    "find": "before ${getInput} after",
    
    // ${getInput} inside a js operation
    "find": "$${return '${getInput}' + 'end';}$$", // treat '${getInput}' as a string and add 'end' to it and match
    
    "find": "(${getInput})",                    // wrap in a capture group to use later
    "isRegex": true,                            // treat $1 as a capture group and do string operations on it
    "replace": "${BLOCK_COMMENT_START} $${return '$1'.toLocaleUpperCase();}$$ ${BLOCK_COMMENT_START}",
    // "replace": "${BLOCK_COMMENT_START} \\U$1 ${BLOCK_COMMENT_START}", // simpler version of above

    "isRegex": true,               // if you want that input treated as a regular expression ***
    
    "replace": "everything is fine",
    
    "replace": "${getInput} is my replacement",  // input text added to any other replace text
    
    // make sure to surround the '${getInput}' value with backticks if you want it treated as a string in a jsOperation
    "replace": "$${return '${getInput}' was added;}$$",
    
    // no backticks around ${getInput} because we will enter a number, it would be an error to enter a string
    "replace": "$${return ${getInput} * ${lineNumber};}$$",
    
    
    // below: on every match an input box will be presented, any text entered there will be written to a new file
    
    "run": [
      "$${",
        "vscode.env.clipboard.writeText('${getInput}');",               // get and write input to the clipBoard
        "vscode.commands.executeCommand('workbench.action.files.newUntitledFile');",  // open a new file
        "vscode.commands.executeCommand('editor.action.clipboardPasteAction');",      // paste to the new file
      "}$$",
    ],
    
    "runWhen": "onEveryMatch",
    
    // below: for every find match, an input box will be shown, the text you enter will be inserted at rhe cursor(s)
    
    "postCommands": [
      {
        "command": "type",
        "args": {
          "text": " from the input: ${getInput}"
        }
      }
    ],
    
    "runPostCommands": "onEveryMatch",
    
    "cursorMoveSelect": "${getInput}"   // the input text will be selected after any replacement    
  }
```

When using a regex in a `${getInput}` do not double-escape any characters like `\n` or `\s`.  Just use the same regex you would use in the Find Widget.  

------------  

### Launch or task variables: path variables

These can be used in the `find` or `replace` fields of the `findInCurrentFile` command or in the `find`, `replace`, and perhaps most importantly, the `filesToInclude` and `filesToExclude` fields of the `runInSearchPanel` command:

```text
${file}                    easily limit a search to the current file, full path
${fileBasename}
${fileBasenameNoExtension}
${fileExtname}
${relativeFile}            current file relative to the workspaceFolder

${fileDirname}             the current file's parent directory, full path
${relativeFileDirname}     the current file's parent directory only

${fileWorkspaceFolder}
${workspaceFolder}
${workspaceFolderBasename}
${pathSeparator}
${/}                       same as ${pathSeparator}

${selectedText}            can be used in the find/replace/cursorMoveSelect fields  
${CLIPBOARD}

${lineIndex}               line index starts at 0
${lineNumber}              line number start at 1

${matchIndex}              0-based, replace with the find match index - first match, second, etc.   
${matchNumber}             1-based, replace with the find match number

```

These variables should have the same resolved values as found at &nbsp; [vscode's pre-defined variables documentation](https://code.visualstudio.com/docs/editor/variables-reference#_predefined-variables).  

> These path variables can also be used in a conditional like `${1:+${relativeFile}}`.  If capture group 1, insert the relativeFileName.  

> Examples are given below using `lineIndex/Number` and `matchIndex/Number`.  

### Snippet variables

```text
${TM_CURRENT_LINE}               The text of the current line for each selection.
${TM_CURRENT_WORD}               The word at the cursor for each selection or the empty string.
${CURRENT_YEAR}                  The current year.
${CURRENT_YEAR_SHORT}            The current year's last two digits.
${CURRENT_MONTH}                 The month as two digits (example '02').
${CURRENT_MONTH_NAME}            The full name of the month (example 'July').
${CURRENT_MONTH_NAME_SHORT}      The short name of the month (example 'Jul').
${CURRENT_DATE}                  The day of the month as two digits (example '08').
${CURRENT_DAY_NAME}              The name of day (example 'Monday').
${CURRENT_DAY_NAME_SHORT}        The short name of the day (example 'Mon').
${CURRENT_HOUR}                  The current hour in 24-hour clock format.
${CURRENT_MINUTE}                The current minute as two digits.
${CURRENT_SECOND}                The current second as two digits.
${CURRENT_SECONDS_UNIX}          The number of seconds since the Unix epoch.
${CURRENT_TIMEZONE_OFFSET}       Modified from Date.prototype.getTimezoneOffset() 
                                     and see https://github.com/microsoft/vscode/issues/151220  
                                     Thanks to https://github.com/microsoft/vscode/pull/170518 and 
                                     https://github.com/MonadChains 
                                     
${RANDOM}                        Six random Base-10 digits.
${RANDOM_HEX}                    Six random Base-16 digits.  

${BLOCK_COMMENT_START}           Example output: in PHP `/*` or in HTML `<!--`.
${BLOCK_COMMENT_END}             Example output: in PHP `*/` or in HTML `-->`.
${LINE_COMMENT}                  Example output: in PHP `//`.
```

These snippet variables are used just like the path variables mentioned above.   With `\\U${CURRENT_MONTH_NAME}` to uppercase the current month name for example.  

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "replace": "$${ return ${CURRENT_HOUR} - 1 }$$"
  }
}
```

Explanation: The above keybinding (or it could be a command) will insert the result of (current hour - 1) at the cursor, **if** the cursor is not at a word - so on a empty line or with a space separating the cursor from any other word.   Otherwise, if the cursor is on a word that word will be treated as the `find` and all its occurrences (within the `restrictFind` scope: entire document/selections/onceIncludeCurrentWord/onceExcludeCurrentWord/line/next..) will be replaced by (current hour - 1).  

To insert a timestamp try this keybinding:

```jsonc
 
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "replace": "${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE}T${CURRENT_HOUR}:${CURRENT_MINUTE}:${CURRENT_SECOND}${CURRENT_TIMEZONE_OFFSET}",
  }
}
```

Result for the above would be `2023-02-24T03:52:55-08:00` for a locale with UTC-8.  Since there is no `find` argument just make sure your cursor is not at a word when this is triggered (or that word will be replaced, which may be what you want in some cases).  

And the same as a setting in your `settings.json`:

```jsonc
"findInCurrentFile": {
  "AddTimeStampWithTimeZoneOffset": {  // this line cannot have spaces

    // this will appear in the Command Palette as 'Find-Transform: Insert a timestamp with timezone offset'
    "title": "Insert a timestamp with timezone offest",   // whatever you want here
    "replace": "${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE}T${CURRENT_HOUR}:${CURRENT_MINUTE}:${CURRENT_SECOND}${CURRENT_TIMEZONE_OFFSET}"
  }
}
```

The above will, after a reload, appear in the Command Palette as 'Find-Transform: Insert a timestamp with timezone offset' which text you can change as you want.  

-----------

* Note that vscode can do fancy things with snippet comment variables like `${LINE_COMMENT}` by examining the language of individual tokens so that, for example, css in js would get its correct comment characters if within the css part of the code.  This extension cannot do that and will get the proper comment characters for the file type only.  

-----------

### Case modifier transforms

 The find query and the replace transforms can include ***case modifiers*** like:  

```text
Can be used in the `replace` field:  

\\U$n   uppercase the entire following capture group as in `\\U$1`
\\u$n   capitalize the first letter only of the following capture group: `\\u$2`
\\L$n   lowercase the entire following capture group:  `\\L$2`
\\l$n   lowercase the first letter only of the following capture group: `\\l$3`

Can be used in either the `replace` or `find` fields:  

\\U${relativeFile} or any launch/task-like variable listed above
\\u${any launch variable}
\\L${any launch variable}
\\l${any launch variable}
```

These work in **both** the `findInCurrentFile` and `runInSearchPanel` commands or keybindings.  

Example:

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
                                          // find the lowercased version of the relativeFileName
    "find": "(\\L${relativeFile})",       // note the outer capture group

    "replace": "\\U$1",                   // replace with the uppercased version of capture group 1

    "matchCase": true,                    // this must be set or the find case will be ignored!
    "isRegex": true
  }
}
```

<br/>

> Note, the above case modifiers must be double-escaped in the settings or keybindings.  So `\U$1` should be `\\U$1` in the settings.  VS Code will show an error if you do not double-escape the modifiers (similar to other escaped regexp items like `\\w`).

### Conditional replacements in `findInCurrentFile` commands or keybindings

Vscode **snippets** allow you to make conditional replacements, see [vscode's snippet grammar documentation](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_grammar).  However you cannot use those in the find/replace widget.  This extension allows you to use those conditionals in a `findInCurrentFile` command or keybinding.  Types of conditionals and their meaning:

```text
${1:+add this text}  If found a capture group 1, add the text. `+` means `if`  
${1:-add this text}  If *NO* capture group 1, add the text. `-` means `else`
${1:add this text}   Same as `else` above, can omit the `-`  
${1:?yes:no}    If capture group 1, add the text at `yes`, otherwise add the text at `no` `?` means `if/else`
```

Examples:

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "(First)|(Second)|(Third)",   // your regexp with possible capture groups
    
    "replace": "${3:-yada3} \\U$1",       // if no group 3, add "yada3" then upcase group 1
    
                                          // groups within conditionals must be surrounded by backticks `$2`
    "replace": "${2:+abcd `\\U$2` efgh}",      // if group 2, add capitalized group 2 plus surrounding text
    
    "replace": "${1:+aaa\\}bbb}",         // must double-escape closing brackets if want it as text
    
    "replace": "\\U${1:+aaa-bbb}",        // to capitalize the entire replacement
    
    "replace": "${1:+*`$1``$1`*}${2:+*`$2``$2`*}",      // lots of combinations possible
    
    "replace": "$0",                      // can use whole match as a replacement

    "replace": "",                        // the match will be replaced with nothing, i.e., an empty string
    
    "replace": "${2:?yada2:yada3}\\U$1",  // if group 2, add "yada2", else add "yada3"
                                          // then follow with upcased group 1
    
    "replace": "${2:?`$3`:`$1`}",         // if group 2, add group 3, else add group 1
    
    "isRegex": true
  }
}
```

1. Groups within conditionals (which is not possible even in a vscode snippet), must be surrounded by backticks.  
2. If you want to use the character `}` in a replacement within a conditional, it must be double-escaped `\\}`.  

### Snippet-like transforms: replacements in `findInCurrentFile` commands or keybindings

The following can be used in a `replace` field for a `findInCurrentFile` command:

```text
${1:/upcase}      if capture group 1, transform it to uppercase (same as `\\U$1`)  
${2:/downcase}    if capture group 2, transform it to uppercase (same as `\\L$1`)  
${3:/capitalize}  if capture group 3, transform it to uppercase (same as `\\u$1`)  

${1:/pascalcase}  if capture group 1, transform it to pascalcase  
    (`first_second_third` => `FirstSecondThird` or `first second third` => `FirstSecondThird`)

${1:/camelcase}   if capture group 1, transform it to camelcase  
    (`first_second_third` => `firstSecondThird` or `first second third` => `firstSecondThird`)   
    
${1:/snakecase}   if capture group 1, transform it to snakecase  
    (`firstSecondThird` => `first_second_third`, so camelcase only to snakecase) 
```  

### Examples:

If you wanted to find multiple items and then transform each in its own way **one match at a time**:  

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "(first)|(Second)|(Third)",
    "replace": "${1:+ Found first!!}${2:/upcase}${3:/downcase}",
    "isRegex": true,
    "restrictFind": "nextSelect"  // one match at a time
    // 'nextMoveCursor' would do the same, moving the cursor but not selecting
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/individualTransforms.gif?raw=true" width="500" height="200" alt="apply transforms one by one"/>

Explanation for above:  

1. `"restrictFind": "nextSelect"` do the following one at a time, selecting each in turn  
2. If you want to skip transforming a match, just move the cursor beyond it (<kbd>rightArrow</kbd>).  

3. `${1:+ Found first!!}` if find a capture group 1, replace it with text "Found First!!"  
4. `${2:/upcase}` if find a capture group 2, uppercase it  
5. `${3:/downcase}` if find a capture group 3, lowercase it  

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "description": "transform existing fileBaseName in the text to SCREAMING_SNAKE_CASE",
    
    "find": "(${fileBasenameNoExtension})",
    "replace": "\\U${1:/snakecase}",

    "isRegex": true  // necessary because the {1:/snakecase} needs to refer to some capture group
  }
}
```

Here is a neat trick to insert a SCREAMING_SNAKE_CASE version of the `${fileBasenameNoExtension}` at the cursor(s):  

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "description": "insert the fileBaseName and change to SCREAMING_SNAKE_CASE",
    
    "replace": ["${fileBasenameNoExtension}", "\\U${1:/snakecase}"],

    "isRegex": true  // necessary because the ${1:/snakecase} needs to refer to some capture group
  }
}
```

The above works by performing 2 replacements (with no find).  First, insert at the cursor(s) the `${fileBasenameNoExtension}` and second, replace that (since it is pre-selected) with the capitalized, snake-case version.  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/screamingFileName.gif?raw=true" width="500" height="200" alt="insert screaming snake case filename"/>

----------------

> **Careful**: with `isRegex` set to true and you use settings like:

```jsonc
"args": {
  "find": "(trouble)",                 // only a capture group 1
  // "find": "trouble",                // no capture groups!, same bad result
  
  "replace": "\\U$2",                  // but using capture group 2!!, so replacing with nothing
  // "replace": "${2:/pascalcase}",    // same bad result, refers to capture group 2 that doesn't exist
  
  "isRegex": true
}
```

You would effectively be replacing the match `trouble` with nothing, so all matches would disappear from your code.  This **is** the correct result, since you have chosen to match something and replace it with something else that may not exist.  

> If `isRegex` is set to `false` (the same as not setting it at all), the replace value, even one like `\\U$2` will be interpreted as literal plain text.  

---------------

## Using `restrictFind` with the `matchAroundCursor` option  

 Example keybinding:  

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "<(Element)(>[\\s\n\\S]*?<\/)(Element)>",  // $1 and $3 capture groups = Element
    "isRegex": true,
    "replace": "<\\U$1$2\\U$3>",                       // \\U$1 = capitalize group 1
    "restrictFind": "matchAroundCursor"
  }
}
```

The above keybinding would select the entire Element and capitalize groups 1 and 3, so the result would look like  

```plaintext
<ELEMENT>
  stuff
  more stuff
</ELEMENT>
```

* `matchAroundCursor` will select any find match that surrounds the cursor.  In the above example the cursor only needs to be somewhere within the text that matches the find.  Ths option can be used for quickly extracting a block of text with a SINGLE regular expression.  And then that block of text can be manipulated in a `replace` or `run` argument.  

* You can also use the `cursorMoveSelect` argument with the `matchAroundCursor` result.  

For example this `run` argument will take the selected text - like from the `find` match - and create a new file with that text pasted in:

```jsonc
    "run": [
      "$${",
        "let block = '```';",                    // start a code fence
        "block += document.languageId;",         // use the current editor's languageId as the code fence language
        "block += `\\n\\t${selectedText}\\n`;",  // strip off trailing newline(s)?
        "block += '```';",                       // end a code fence
        
        "vscode.env.clipboard.writeText(block);",     // write that text to the clipBoard
        "vscode.commands.executeCommand('workbench.action.files.newUntitledFile');",  // open a new file
        "vscode.commands.executeCommand('editor.action.clipboardPasteAction');",      // paste to the new file
        
        // go back to original file
        "vscode.commands.executeCommand('workbench.action.openPreviousRecentlyUsedEditor');",
      "}$$",
    ],
```

---------------

## Details on the `restrictFind` and `cursorMoveSelect` arguments

Example keybinding:  

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "FIXME",                       // or use the word at the cursor
    "replace": "DONE",
    "restrictFind": "nextDontMoveCursor"
    // "cursorMoveSelect": "FIXME"         // will be ignored with the 'next...` options
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/nextDontMoveFind.gif?raw=true" width="650" height="300" alt="notification to save after changing settings"/>

These will all **reveal** the replacement so you can see the change, but not necessarily move the cursor.  

1. `"restrictFind": "nextDontMoveCursor"` make the next replacement but leave the cursor at the original position.  
2. `"restrictFind": "nextMoveCursor"` make the next replacement and move the cursor to end of next replaced match. Does not select.
3. `"restrictFind": "nextSelect"` make the next replacement and select it.  

4. `"restrictFind": "previousDontMoveCursor"` make the previous replacement but leave the cursor at the original position.  
5. `"restrictFind": "previousMoveCursor"` make the previous replacement and move the cursor to start of previous replaced match. Does not select.
6. `"restrictFind": "previousSelect"` make the previous replacement and select it.  

> The `next...` and `previous...` options will **wrap**.  This means for example if there is no match in the document after the cursor that the first match from the beginning of the document will be used (when using a `next...` option).  

> When using the **above** `restrictFind` options the `cursorMoveSelect` option will be ignored.  

> And these options above do not currently work with multiple selections.  Only the first selection made in the document will be used as a `find` value - so the order you make selections matters.  If you made multiple selections from the bottom of the document up, the first selection made (which would appear after other selections) would be used.  

You can use the `cursorMoveSelect` option with the below `restrictFind` options.  

1. `"restrictFind": "document"` the **default**, make all replacements in the document, select all of them.  

2. `"restrictFind": "onceIncludeCurrentWord"` make the next replacement from the beginning of the current word on the **same line** only.  
3. `"restrictFind": "onceExcludeCurrentWord"` make the next replacement **after the cursor** on the **same line** only.  

4. `"restrictFind": "line"` make all replacements on the current line where the cursor is located.
5. `"restrictFind": "selections"` make all replacements in the selections only.  

Note that for all of the above, the replacement text might include more or fewer newlines so that although the `find` did occur on one line, the `cursorMoveSelect` match might actually occur on a different line.  That is okay, the entire replacement text will be matched against, whether some of it is on the same line or a subsequent line.  

```plaintext
 New `once...` restrictFind Values.  `once` deprecated:
```

The `once` argument to `restrictFind` is being **deprecated** in favor of two related values: `onceExcludeCurrentWord` and `onceIncludeCurrentWord`.  `onceExcludeCurrentWord` functions exactly as `once` does, the searched text begins strictly at the cursor position - even if that is in the middle of a word.  That does allow you to use that `${TM_CURRENT_WORD}` in a find or replace and not actually change the current word, but the next instance.  But sometimes you do want to change the current word and then `onceIncludeCurrentWord` is what you want.  Then the entire word at the cursor is part of the search text and it will be selected or replaced according to your keybinding/setting.  

-------------

The `cursorMoveSelect` option takes any text as its value, including anything that resolves to text, like `$` or any variable.  That text, which can be a result of a prior replacement, will be searched for after the replacement and the cursor will move there and that text will be selected.  If you have `"isRegex": true` in your command/keybinding then the `cursorMoveSelect` will be interpreted as a regexp.  `matchCase` and `matchWholeWord` settings will be honored for both the `cursorMoveSelect` and `find` text.  

```jsonc
{
"key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "(trouble)",
    "replace": "\\U$1",
    "isRegex": true,
    
    // "matchWholeWord": true,           // applies to both find and cursorMoveSelect
    // "matchCase": true,                // applies to both find and cursorMoveSelect
    
                                         // select only if at beginning of line: ^
    "cursorMoveSelect": "^\\s*pa[rn]am", // will be interpreted as a regexp since 'isRegex' is true
    "restrictFind": "line",              // select 'pa[rn]am' on the current line after making the replacement(s) 
    
    // "restrictFind": "selections",     // select 'pa[rn]am' only in the selection(s)
   
    //  "restrictFind": "line",
    // "cursorMoveSelect": "^"           // cursor will go to beginning of line
    // "cursorMoveSelect": "$"           // cursor will go to end of line (after replacement, which may include newlines)
    
    //  "restrictFind": "onceIncludeCurrentWord/onceExcludeCurrentWord",
    // "cursorMoveSelect": "^"           // cursor will go to beginning of the first match (after replacement)
    // "cursorMoveSelect": "$"           // cursor will go to end of the first match (after replacement)
    
    // "restrictFind": "selections", 
    // "cursorMoveSelect": "^"           // cursor will go to beginning of each selection
    // "cursorMoveSelect": "$"           // cursor will go to end of each selection
    
    // selections are directional, 
    // the cursor will go to the start or end (the end is where the cursor was in the original selection)
  }
}
```

Note `^` and `$` work for `restrictFind` selections/line/onceIncludeCurrentWord/onceExcludeCurrentWord/document.  

1. `cursorMoveSelect` will select **all** matches in each `selections` **only** if there was a match in the same selection.  

2. `cursorMoveSelect` will select the first `cursorMoveSelect` match using `restrictFind` : `onceIncludeCurrentWord`  or `onceExcludeCurrentWord` **only** if there was a match on the same line before a `cursorMoveSelect` match.  So a `find` match first and then a `cursorMoveSelect` match after that on the same line.  

3. `cursorMoveSelect` will select all `cursorMoveSelect` matches in the `document` **only** if there was a find match and only within the range of the find match!!  This may seem like a limitation but it makes possible some nice funtionality using `postCommands`.  

4. `cursorMoveSelect` will select all matches on a line using `restrictFind` : `line` **only** if there was a match on the same line.  

<br/>

> When you use the `cursorMoveSelect` argument for a `restrictFind: document` or the `nextMoveCursor` or `nextSelect` options for the `restrictFind` key, it is assumed that you actually want to go there and see the result.  So the editor will be scrolled to reveal the line of that match if it is not curently visible in the editor's viewport.  For `selections/line/onceIncludeCurrentWord/onceExcludeCurrentWord` no scrolling will occur - it is assumed that you can see the resulting match already (the only way that wouldn't typically be true is if you had a long selection that went off-screen).  

> Note: if there is no find and no replace or a find but no replace, the `cursorMoveSelect` argument is ignored.  

-----------

### Some `"restrictFind": "next...` option examples

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "FIXME",
    "replace": "DONE!",
    "restrictFind": "nextMoveCursor"
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/nextMoveCursorFind.gif?raw=true" width="650" height="300" alt="nextMoveCursor with find and replace"/>

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "FIXME",
    "replace": "DONE!",
    "restrictFind": "nextSelect"
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/nextSelectFind.gif?raw=true" width="650" height="300" alt="nextSelect with find and replace"/>

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    // "find": "FIXME",                 // !! no find or replace !!
    // "replace": "DONE",
    "restrictFind": "nextMoveCursor"    // or try `nextSelect` here  
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/nextMoveCursorNoFindNoReplace.gif?raw=true" width="650" height="300" alt="nextMoveCursor with no find or replace"/>

Explanation for above: With no `find` argument, the current nearest word to the cursor (see more on this below) will be used as the `find` value.  So, in the above example `FIXME` will be used as the find query.  And with `nextMoveCursor` the cursor will move to the next match.  `nextSelect` could be used here as well.  

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {

    // "find": "$",             // go to the end '$' of each line one at a time

    // go to the end '$' of each line if it isn't an empty line - using a positive lookbehind - one at a time
    "find": "(?<=\\w)$",

    "replace": "-${lineNumber}",  // insert the lineNumber (1-based) at the match (the end of a line)
    // "replace": "${lineIndex}",   // insert the lineIndex (0-based) at the match (the end of a line)

    "isRegex": true,
    "restrictFind": "nextSelect"
      // note in the demo that nextSelect/nextMoveCursor/nextDontMoveCursor will wrap back to start of the file  
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/lineNumberAtEndWrap.gif?raw=true" width="600" height="400" alt="demo of putting the lineNumber at the end of lines with content and wrapping to start of file"/>

Explanation for above: Find the end of non-empty lines and append '-' and that line number.  `nextSelect` => do one at a time.  

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {
    
    // "description": "capitalize 'first' or 'second' one at a time",
    
    "find": "(first|second)",
    "replace": "\\U$1",
    "isRegex": true,
    "matchCase": true,     // necessary if not moving the cursor, so don't select the same entry
    
    "restrictFind": "nextSelect"
  }
}
```

-------------------

## Sample Settings

> Note: commands that you create in the settings can be removed by deleting or commenting out the associated settings and re-saving the `settings.json` file and reloading VS Code.  

In your `settings.json`:  

```jsonc
"findInCurrentFile": {                   // perform a find/replace in the current file or selection(s)

  "upcaseSwap2": {                       // <== the "name" that can be used in a keybinding, no spaces
    "title": "swap iif <==> hello",      // title that will appear in the Command Palette
    "find": "(iif) (hello)",
    "replace": "_\\u$2_ _\\U$1_",        // double-escaped case modifiers
    "isRegex": true,
    "restrictFind": "selections"
  },
  "capitalizeIIF": {
    "title": "capitalize 'iif'",         // all settings must have a "title" field
    "find": "^(iif)",
    "replace": "\\U$1",
    "isRegex": true
  },
  "addClassToElement": {
    "title": "Add Class to Html Element",
    "find": ">",
    "replace": " class=\"@\">",
    "restrictFind": "selections",
    "cursorMoveSelect": "@"               // after the replacement, move to and select this text
  }
}

// perform a search/replace using the Search Panel, optionally in current file/folder/workspace/etc.

"runInSearchPanel": {                     // use this as first part of command name in keybindings

  "removeDigits": {                           // used in the keybindings so no spaces allowed
    "title": "Remove digits from Art....",
    "find": "^Arturo \\+ \\d+",                    // double-escaped '+' and '\d'
    "replace": "",
    "triggerSearch": "true",
    "isRegex": true
  }
}
```  

> If you do not include a `title` value, one will be created using the name (like `removeDigits` in the last example immediately above. Then you can look for `Find-Transform:removeDigits` in the Command Palette.  Since in the last example a `title` was supplied, you would see `Find-Transform: Remove digits from Art....` in the Command Palette.  All the commands are grouped under the `Find-Transform:` category.  

In a `.code-workspace` file (for multi-root workspaces):

```json
{
  "folders": [
    {
      "path": ".."
    },
    {
      "path": "../../select-a-range"
    }
  ],
  "settings": {
    "findInCurrentFile": {
      "bumpSaveVersion": {      // use this name in the codeActionsOnSave setting
        "title": "bump the save version on each save",
        "find": "(?<=#### Save Version )(\\d+)",
        "replace": "$${ return $1 + 1 }$$",
        "isRegex": true,
        "ignoreWhiteSpace": false,
        "matchCase": false
      }
    },
    "runInSearchPanel": {
      "inSearchPanel": {
        "title": "some title",
        "ignoreWhiteSpace": false,
        "delay": 2000,
        "isRegex": true,
        "matchCase": false,
        "useExcludeSettingsAndIgnoreFiles": true,
        "triggerSearch": true
      }
    }
  }
}
```

<br/>

-------------------

## Sample Keybindings

Examples of keybindings (in your `keybindings.json`):  

```jsonc
// below: keybindings generated from commands in the settings  

{
  "key": "alt+u",
  "command": "findInCurrentFile.upcaseKeywords"       // from the settings
}                                     // any "args" here will be ignored, they are in the settings

 
// below: a generic "findInCurrentFile" keybinding command, no need for any settings to run these

{                                         
  "key": "alt+y",
  "command": "findInCurrentFile",       // note no second part of a command name
  "args": {                             // must set the "args" here since no associated settings command

    "find": "^(this)",                  // note the ^ = beginning of selection because restrictFind = selections
                                        // or ^ = beginning of line within a selection 

    // "find": "^(${CLIPBOARD})",       // same result as above if 'this' on the clipboard
                        // remember to have the matching capture group used in the replace in your find!

    "replace": "\\U$1", 
    // "replace": "${1:/upcase}",       // same as '\\U$1'

    "isRegex": true,
    "matchCase": true,
    "restrictFind": "selections",
    "cursorMoveSelect": "THIS"          // this text will be selected; "$" goes to the end of ALL the selections
  }
}
```  

### Using `${lineNumber}` or `${lineIndex}` in the `find`:

```jsonc
{                                         
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": { 

    "find": "(${lineNumber})",          // find the matching line number on its line
                                        // so find a 1 on line 1, find a 20 on line 20
    
    "replace": "$${ return `found ` + ($1*10) }$$",
                                        // a 1 on line 1 => 'found 10'
                                        // a 20 on line 20 => 'found 200'
                                        
                                        // demo below
    "replace": "$${ if ($1 <= 5) return $1/2; else return $1*2; }$$",
          // if a number is on its lineNumber, like a 5 on line number 5 = a find match
          // if that match <= 4 return that lineNumber  / 2
          // else return that lineNumber * 2
          
    "isRegex": true,
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/ifLineNumberMatch.gif?raw=true" width="150" height="250" alt="line Number match"/>

------------

When you save a change to the **settings**, you will get the message notification below.  This extension will detect a change in its settings and create corresponding commands.  The commands will not appear in the Command  Palette **without saving the new setting** and reloading vscode.  

<br/>

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/reloadMessage.jpg?raw=true" width="525" height="150" alt="notification to save after changing settings"/>

<br/>  

-----------

An example of keybinding with **NO associated setting**, in `keybindings.json`:  

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",           // note no setting command here, like findInCurrentFIle.removeDigits
  "args": {
    
    // multiline regexp ^ and $ are supported, "m" flag is automatically applied to all searches  
    // if finding within a selection(s), '^' refers to the start of a selection, NOT the start of a line
    // if finding within a selection(s), '$' refers to the end of a selection, NOT the end of a line
    
    "find": "^([ \\t]*const\\s*)(\\w*)",   // note the double escaping
    
    "replace": "$1\\U$2",                  // capitalize the word following "const"
    "isRegex": true,
    
    "restrictFind": "selections"           // find only in selections
  }
}
```  

<br/>

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/genericRunCommandKeybinding.gif?raw=true" width="650" height="300" alt="demo of generic findInCurrentFile keybinding"/>  

<br/>

In this way you can specify a keybinding to run a generic `findInCurrentFile` command with all the arguments right in the keybinding and nowhere else.  There is no associated setting and you do not need to reload vscode for this version to work.  You can have an unlimited number of keybindings (with separate trigger keys and/or `when` clauses, of course) using the `findInCurrentFile`  version.

The downside to this method is that these `findInCurrentFile` keybinding-only versions cannot be found through the Command Palette.  

--------------------

### `"nearest words at cursors"`

> Important:  &nbsp; What are &nbsp; **`"nearest words at cursors"`**? &nbsp; In VS Code, a cursor immediately next to or in a word is a selection (even though no text may actually be selected!).  This extension takes advantage of that: if you run a `findInCurrentFile` command with no `find` arg it will treat any and all "nearest words at cursors" as if you were asking to find those words.  Actual selections and "nearest words at cursors" can be mixed by using multiple cursors and they will all be searched for in the document.  It appears that a word at a cursor is defined generally as this: `\b[a-zA-Z0-9_]\b` (consult the word separators for your given language) although some languages may define it differently.  

<br/>

> If a cursor is on a blank line or next to a non-word character, there is no "nearest word at cursor" by definition and this extension will simply return the empty string for such a cursor.  

> So with the cursor at the start or end of `FIXME` or anywhere within the word, `FIXME` is the word at the cursor.  `FIXME-Soon` consists of two words (in most languages).  If the cursor followed the `*` in `FIXME*` then `FIXME` is **not** the word at the cursor.  

This is demonstrated in some of the demos below.  

* Generic `run` command in `keybindings.json`, no `find` or `replace` keys in the `args`

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile"
},
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/noFindNoReplaceDemo.gif?raw=true" width="650" height="300" alt="demo of no find and no replace keys in args"/>

Explanation for above: With no `find` key, find matches of selections or nearest words at cursors (multi-cursors work) and select all those matches.  Blue text are selections in the demo gif.

> Important: If there is no `find` key and there are **mutiple selections** then this extension will create a `find` query using **all** those selections.  The generated `find` will be in the form of `"find": "(word1|word2|other selected text)`.  Note the use of the alternation pipe `|` so any of those selected words can be found.  Thus, the find in file or find across files must have the regex flag enabled.  Therefore, if you have multiple selections with no `find` key, `"isRegex": true` will be automatically set - possibly overriding what you had the settings or keybinding.  

> That should only be a problem if you select text that gets generated into a `find` term that itself contains regexp special characters, like `.?*^$`, etc.  They will not be treated as literal characters but as their usual regexp functionality.  

> If you are using no `find` but are selecting text that you want treated as a regular expression (like `\n text (\d)`) do not double-escape those special regex characters.  Just use the same regex you would use in the Find Widget.  Remember to have `isRegex` set to true in this case.  

> Finally, if you select multiple instances of the same text the generated `find` term will have any duplicates removed.  `Set.add()` is a beautiful thing.  

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {
    "matchCase": true,
    "restrictFind": "nextSelect"
  }
}
```

The above will repeatedly select the next matching word under the cursor (the 'matchCase' option is up to you).  

---------------

### `find` and `replace` keys with no `restrictFind`

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {
    "find": "(create|table|exists)",
    "replace": "\\U$1",
    "isRegex": true
  }
}
```  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/findReplaceDemo.gif?raw=true" width="650" height="250" alt="demo of find and replace keys in args"/>  

Explanation for above: Find and replace each with its value in the `args` field.  Since there is no `restrictFind` key, the default `document` will be used.  

----------------

### `find` and `replace` with `"restrictFind": "selections"`

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {
    "find": "(create|table|exists)",    // find each of these words
    "replace": "_\\U$1_",               // capitalize _capture group 1_
    "isRegex": true,
    "restrictFind": "selections",
    "cursorMoveSelect": "TABLE"         // will select 'TABLE' only if it is within a selection 
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/findReplaceSelectionDemo1.gif?raw=true" width="700" height="300" alt="demo of using restrictFind 'selection' and 'cursorMoveSelect"/>  

Explanation for above: Using `restrictFind` arg set to `selections`, find will only occur within any selections.  Selections can be multiple and selections do include "nearest words at cursors". Using `cursorMoveSelect` to select all instances of `TABLE`.  

> Note a subtle difference in the above demo.  If you make an actual full selection of a word or words, only text within that selection will be searched.  But if you make a "nearest word"-type selection (a cursor in or next to a word) then all matching words in the document will be searched for, even if they are not in a selection of their own.  If you want to restrict the search to a selection, make an actual selection - do not rely on the nearest word functionality.  

#### If `restrictFind` is not set to anything, it defaults to `document`.  So the entire document will be searched and any selections will be ignored, since a `find` has been set.  Remember if no `find` is set, then any selections will be interpreted as the `find` values.  

The above keybinding is no different than this setting (in your `settings.json`):  

```jsonc
"findInCurrentFile": {
  "upcaseSelectedKeywords": {
    "title": "Uppercase selected Keywords",     // a "title" is required in the settings
    "find": "(create|table|exists)",
    "replace": "_\\U$1_",
    "isRegex": true,
    "restrictFind": "selections",
    "cursorMoveSelect": "TABLE"
  }
}
```

except that a **reload of vscode is required** prior to using the generated command from this setting (no reload necessary for the keybinding) and the `title`, in this case `"Uppercase selected Keywords"` will appear and be searchable in the Command Palette (not true for keybinding "commands").  

--------------------

### `find` but no `replace` key

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {
    "find": "(create|table|exists)",
    "isRegex": true
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/findNoReplaceDemo.gif?raw=true" width="650" height="250" alt="demo of find and no replace keys in args"/>

Explanation for above: Will find according to the `find` value and select all those matches.  No replacement.  

-------------

### `find` and no `replace` with `"restrictFind": "selections"

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {
    "find": "(create|table|exists)",
    // "replace": "_\\U$1_",
    "isRegex": true,
    "restrictFind": "selections"
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/findNoReplaceSelectionDemo.gif?raw=true" width="650" height="250" alt="demo of using restrictFind arg to 'selection'" with no replace/>  

Explanation for above: Using `restrictFind` arg set to `selections`, find will only occur within any selections.  All find matches within selections will be selected.  

If you have set `"restrictFind": "document"` any actual selections in the file will be ignored and the find/replace will be applied to the entire file.  

------------

### with a `replace` key but NO `find` key

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {
    // "find": "(create|table|exists)",
    "replace": "\\U$1",
    "isRegex": true,
    "matchWholeWord": true
  }
}
```  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/noFindReplaceDemo.gif?raw=true" width="750" height="300" alt="demo of replace but no find keys in args"/>  

Explanation for above: With no `find` value find all the words at the cursors or selections and apply the replacement.  

In a keybinding/setting with no find BUT a capture group in the replace, like in the last example, the `isRegex` argument can work in two ways:  

1. `true`: the word at the cursor (or more likely the selection) is treated as a regex.  So it may contain special regular expression characters like `*^$?!.[]()\`.  Example: `find*me` so that `findme` or `finddddme` or `finme` are found.  

2. `false`: the word at the cursor (or more likely the selection) is NOT treated as a regex.  It is treated as plain text, so any special regex characters will be **escaped** so that a regex match can be performed on that text - necessary since the replace may contain a capture group reference, like `$1`.  Example: `find*me` becomes `find\*me` so that the literal text `find*me` is searched for.  

---------------

## Demonstrating `cursorMoveSelect` after replacement

```jsonc
"findInCurrentFile": {              // in settings.json
  "addClassToElement": {
    "title": "Add Class to Html Element",
    "find": ">",
    "replace": " class=\"@\">",
    "isRegex": true,
    "restrictFind": "onceExcludeCurrentWord", 
    "cursorMoveSelect": "@"         // select the next '@'
  }
}
```

```jsonc
{                                   // a keybinding for the above setting
  "key": "alt+q",                   // whatever you want
  
      // should get intellisense for available settings commands after typing `findInCurrentFile.`  
  "command": "findInCurrentFile.addClassToElement"
  
  // "when": ""                     // can be used here
  // "args": {}                     // will be ignored, the args in the settings rule  
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/cursorMoveOnce.gif?raw=true" width="650" height="300" alt="demo of using cursorMoveSelect arg with restrictFind of 'onceExcludeCurrentWord'"/>

Explanation for above: Find the first `>` within selection(s) and replace them with ` class=\"@\">`.  Then move the cursor(s) to `@` and select it.  `cursorMoveSelect` value can be any text, even the regexp delimiters `^` and `$`.  

* `"restrictFind": "onceExcludeCurrentWord"` => find the FIRST instance of the `find` query AFTER the cursor (so if your cursor is in the middle of a word, only part of that word is **after** the cursor), replace it and then go to and select the `cursorMoveSelect` value if any.  Works the same for multiple cursors.  

* `"restrictFind": "onceIncludeCurrentWord"` => find the FIRST instance of the `find` query from the BEGINNING of the current word (so if your cursor is in the middle of a word, that entire word will be searched), replace it and then go to and select the `cursorMoveSelect` value if any.  Works the same for multiple cursors.

* `"restrictFind": "line"` => find all instances of the `find` query on the entire line with the cursor, replace them and then go to and select All `cursorMoveSelect` values if any.  Works on each line if multiple cursors.  But it only considers the line where the cursor(s) is, so if there is a multi-line selection, only the line with the cursor is searched.  

----------------------

## `${matchNumber}` and `${matchIndex}`

These variables can be used in the `replace` and/or `cursorMoveSelect` positions.  You cannot use them in `find`.  

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {
    "find": "text$",                        // find lines that end with text
    "replace": "text_${matchIndex}",        // replace with 'text_' than match index 0-based
    "isRegex": true,

    "cursorMoveSelect": "${matchIndex}"    // now select each of those matchNumbers
    //     if you don't want the text to be selected, just right or left arrow to lose the selections
    //     but maintain all the multiple cursors.
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/matchIndex.gif?raw=true" width="600" height="400" alt="demo of using ${matchIndex} with cursorMoveSelect"/>

Explanation for above: The match in this case is "text$" ('text' at the end of a line).  The first instance of a match has `matchNumber` = 1 and that will be used in the replacement.  `${matchIndex}` is the same but 0-based.  

```jsonc  
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {  
    "find": "(text)",                       // capture group 1
    "replace": "\\U$1_${matchNumber}",      // upcase group 1 and add _ then that match number
    "isRegex": true,

    "cursorMoveSelect": "${matchNumber}"    // select the matchNumber part of each instance 
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/main/images/matchNumberCase.gif?raw=true" width="600" height="400" alt="demo of using ${matchNumber} with case transform"/>

-------------------

## `reveal` Options

The `reveal` argument to the `findInCurrentFile` command can take three options:

1. `"reveal": "first"`  scroll the viewport to show the first find match in the document, if necessary.
2. `"reveal": "next"`   scroll the viewport to show the next find match in the document **after** the cursor, if necessary.
3. `"reveal": "last "`  scroll the viewport to show the last find match in the document, if necessary.

If you do not want the editor to scroll to reveal any find match, simply do not include a `reveal` option at all.  Certain other arguments like `"restrictFind": "nextMoveCursor/previousMoveCursor/previousSelect/nextSelect/nextDontMoveCursor/previousDontMoveCursor"` etc. will always scroll to reveal, eben if there is no `reveal` argument.  

* Note: The `reveal` argument will do nothing if you have a `cursorMoveSelect` argument in your keybinding or setting.  `cursorMoveSelect` will take precedence.  

-------------------  

## Using the `ignoreWhiteSpace` argument  

The `ignoreWhiteSpace` argument, a boolean, will change the `find` value so that any whitespace in the `find` will be treated as if it is `\s*`.  And the `find` regex will otherwise be modified so that you do not need to explicity specify a `\n` character to get newlines to be recognized.  In other words, any whitespace characters in the `find` value will result in the `find` regex working across lines.  With these arguments:

```jsonc
"find": "someWord-A someWord-B",  
"ignoreWhiteSpace": true,  
"isRegex": true
```

text like these will be matched:

```plaintext
someWord-A        someWord-B
```

```plaintext
  someWord-A

  someWorb-B
```

 So it will match any consecutive 'someWord-A' and 'someWord-B' as long as there is only some kind of whitespace between them, be that spaces, tabs, newlines, etc.  

 And the `ignoreWhiteSpace` argument can be used in a search across files too.  

-------------------  

## Using the `preserveSelections` argument  

This is a boolean option - default is `false`.  

Normally, all find matches are selected, thus losing any cursor positions or other selections that might have existed before running the command.  This does allow other options like `replace` or `run` or even `postCommands` to use these find matches, i.e., selections, in many interesting ways.

But, you may not need that functionality (which is the default).  Perhaps you are doing a find and replace with no need to examine the find matches at all and so wish to preserve all existing selections and cursor positions.  If so, set `"preserveSelections: true`. Although, one nice advantage of selecting the find matches is to make it more obvious where changes actually occurred in the document.  

For certain options, `preserveSelections` has no effect.  For instance, if you have a `find` and no `replace` (or no `find` and no `replace`) then the find matches will be selected regardless of the `preserveSelections` setting.  If you use the `cursorMoveSelect` argument then naturally any of its matches will be selected.  If you are using one of the `next/previous` options, then `preserveSelections` has no effect as those options call for a new selection or already prevent the cursor from moving.  

-------------------  

> Note: Regex lookbehinds that are **not fixed-length** (also called fixed-width sometimes), like `(?<=^Art[\w]*)` are not supported in the Search Panel.  But non-fixed-length lookbehinds are supported in vscode's Find in a file (as in using the Find widget) so they can be used in `findInCurrentFile` settings or keybindings.  

This works:  

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {
    "find": "(?<=^Art[\\w]*)\\d+",        // not fixed-length, but okay in findInCurrentFile
    "replace": "###",
    "isRegex": true
  }
}
```

but the same keybinding in `runInSearchPanel` **will error and not produce any results**:  

```jsonc
{
  "key": "alt+y",
  "command": "runInSearchPanel",          // runInSearchPanel
  "args": {
    "find": "(?<=^Art[\\w]*)\\d+",        // not fixed-length: ERROR will not run
    "replace": "###",
    "isRegex": true
  }
}
```

The above command will put `(?<=^Art[\w]*)\d+` into the Search Panel find input and `###` into the replace but will error when actually triggered.  

-----------------------

### Matching empty lines

You can match all empty lines in the document with this keybinding:

```json
{
  "key": "alt+l",
  "command": "findInCurrentFile",
  "args": {
    
    "replace": "Found empty line.  Match number: ${matchNumber}"    // replace is optional
  }
}
```

And put your cursor on any empty line.  They will be matched and replaced.  If you don't have a `replace`, then all the empty lines will have a cursor placed on them.  This only works when searching the entire document.  

With the following keybinding, you can easily go to the next matching word (note there is no `find`).  So if your cursor starts on an empty line, it will match the next empty line.  If your cursor started on a word, then the cursor would go to that word.

```json
{
  "key": "alt+l",
  "command": "findInCurrentFile",
  "args": {
    
    // also works with the nextMoveCursor or nextDontMoveCursor or previousMoveCursor or previousDOntMoveCursor
    "restrictFind": "nextSelect",                                   // or previousSelect, etc.
    
    "replace": "Found empty line."    // replace is optional
    // but moving to a replace will change the 'word at cursor' and thus the find!!
    // so if you are using a replace, 'nextDontMoveCursor' may be the better choice so the cursor 
    // stays on the blank line (after replacement)
  }
}
```

And, if you want to put a cursor on all empty lines within your selections, use this keybinding:

```json
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {
    "find": "^$",
    "isRegex": true,
    "restrictFind": "selections"
  }
}
```

-----------------------

## TODO

* Add more error messages, e.g., if a capture group used in replace but none in the find.
* Internally modify `replace` key name to avoid `string.replace` workarounds.  
* Explore adding a command `setCategory` setting.  Separate category for Search Panel commands?  
* Support the  `preserveCase` option in  `findInCurrentFile`.  
* Check `cursorMoveSelect` and `${TM_CURRENT_LINE}` interaction.  
* `async/await` all code so `postCommands` are more reliable (and can use built-in `runCommands`).  
* Deal with redundant "Extensions have been modified on disk.  Please reload..." notification.  
* Investigate arg keys in package.json rather than completionProvider.  
* Implement successive `${getFindInput}` input boxes.  
* Get empty line match work in `selections`.  
* Match any number of blank lines.  

## Release Notes

See [CHANGELOG](CHANGELOG.md) for notes on prior releases.  

* 5.2.0 Switched from CompletionProvider to JSON Schema for keybindings/settings.  
&emsp;&emsp; - Fix [\\n] being replaced with [\r?\n] in regex's.  
&emsp;&emsp; 5.2.1 - Fix next/previous `^/$/^$`. More vscode.EndOfLine.CRLF in resolveFind.  

* 5.1.0 Enabled multiple `${getInput}`'s in an argument.  Added regex.js for commonly used regular expressions.  
&emsp;&emsp; - Fix lineNumber/Index matching.  
&emsp;&emsp; - Fix  `matchAroundCursor`  bug - set regex true.  
&emsp;&emsp; 5.1.3 Fix next/previous  bug - calculate cursorIndex again.  

* 5.0.0 Much work on making the code more asynchronous.  Using `replaceAsync`.  
&emsp;&emsp; - `${getInput}` is replacing `${getFindInput}`.  It now works in `replace`, `run`, `postCommands`, `cursorMoveSelect`, `filesToInclude` and `filesToExclude` arguments.  
&emsp;&emsp; - `${/}` path separator variable added.  
&emsp;&emsp; - Work on matching empty lines.  
&emsp;&emsp; - Work on keeping track of multiple replacements with newlines.  

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

<br/>

-----------------------
