# find-and-transform  

### Highlights:

1. &nbsp; Find and transform text in a single file with many kinds of transforms.  
2. &nbsp; Search across files with pre-defined options.
3. &nbsp; Do a series of find and replaces in the current file.
3. &nbsp; Do a series of finds and a replace across files, using only the results files from previous searches. See [Multiple searches across files.](searchInPanel.md#multiple-searches).  TODO check
5. &nbsp; Execute javascript code, like math or string operations, on replacements.
6. &nbsp; Supports using path or snippet variables in the Search Panel or the Find in File Widget fields.
7. &nbsp; Save named settings or keybindings for finds or searches.
8. &nbsp; After replacing some text, optionally move the cursor to a next designated location with `cursorMoveSelect`.
9. &nbsp; All `findInCurrentFile` commands can be used in `"editor.codeActionsOnSave": []`. &emsp; See &nbsp;[running commands on save](codeActions.md).
10. &nbsp; Do a second (or third, fourth, etc.) search using only the files found in a previous search. See `${resultsFiles}` in [Search using the Panel](searchInPanel.md).
11. &nbsp; Insert any resolved value, like a javascript math or string operation, at the cursor(s). No `find` is necessary.
12. &nbsp; Replacements can include case modifiers, like `\U`, conditionals, as in if found capture group 1 add other text, snippet-like transforms like `${1:/pascalcase}` and more.  
13. &nbsp; I can put a numbered capture group, like `$1` into a `find`?  See [Make easy finds with cursors.](#using-numbered-capture-groups-in-a-find).  
14. `${getDocumentText}` and `${getTextLines:n}` to get text anywhere in the document to use for replacement terms.  


-------------

Below you will find information on using the `findInCurrentFile` command - which performs a find within the current file, like using the Find Widget but with the ability to save these file/replaces as settings or keybindings and many more variables and javascript operations supported.  Some of the information here will be useful to using the `runInSearchPanel` as well - so you should read both.  See  [Search using the Panel](searchInPanel.md).  

-----------------

### Table of Contents   

&emsp; &emsp; [1. `preCommands` and `postCommands`](#precommands-and-postcommands)   

&emsp; &emsp; [2. `enableWarningDialog` Setting](#contributed-setting)  

&emsp; &emsp; [3. Using Newlines](#using-newlines)  

&emsp; &emsp; [4. `findInCurrentFile` Arguments](#what-arguments-can-a-findincurrentfile-setting-or-keybinding-use)  

&emsp; &emsp; [5. Using numbered capture groups in a `find`](#using-numbered-capture-groups-in-a-find)

&emsp; &emsp; [6. How to Insert a value at the Cursor](#how-to-insert-a-value-at-the-cursor)  

&emsp; &emsp; [7. Running Multiple finds or replaces](#running-multiple-finds-and-replaces-with-a-single-keybinding-or-setting)  

&emsp; &emsp; [8. Running Javascript Code in a Replacement](#running-javacript-code-in-a-replacement)  

&emsp; &emsp; &emsp; [a. Math Operations in Replacements](#doing-math-on-replacements)  
&emsp; &emsp; &emsp; [b. String Operations in Replacements](#doing-string-operations-on-replacements)  
&emsp; &emsp; &emsp; [c. More Operations in Replacements](#doing-other-javascript-operations-on-replacements)  

&emsp; &emsp; [9. Special Variables](#special-variables)  

&emsp; &emsp; &emsp; [a. Path Variables: Launch or Task-like Variables](#launch-or-task-variables-path-variables)  
&emsp; &emsp; &emsp; [b. Snippet Variables: Snippet-like Variables](#snippet-variables)  
&emsp; &emsp; &emsp; [c. Case Modifiers: `\\U$1`](#case-modifier-transforms)  
&emsp; &emsp; &emsp; [d. Conditional Replacements: `${1:+add this text`](#conditional-replacements-in-findincurrentfile-commands-or-keybindings)  
&emsp; &emsp; &emsp; [e. Snippet Transforms: `${3:/capitalize}`](#snippet-like-transforms-replacements-in-findincurrentfile-commands-or-keybindings)  
&emsp; &emsp; &emsp; [f. More Examples of Variable Transforms](#examples)   

&emsp; &emsp; [10. Using `restrictFind` and `cursorMoveSelect`](#details-on-the-restrictfind-and-cursormoveselect-arguments)  

&emsp; &emsp; &emsp; [a. Some `"restrictFind": "next...` option examples](#some-restrictfind-next-option-examples)  

&emsp; &emsp; [11. Settings Examples](#sample-settings)  

&emsp; &emsp; [12. Keybinding Examples](#sample-keybindings)  

&emsp; &emsp; &emsp; [a. `lineNumber` and `lineIndex`](#using-linenumber-or-lineindex-in-the-find)  
&emsp; &emsp; &emsp; [b. Nearest Words at Cursors](#nearest-words-at-cursors)  
&emsp; &emsp; &emsp; [c. simple find and replace](#find-and-replace-keys-with-no-restrictfind)  
&emsp; &emsp; &emsp; [d. restrictFind: selections](#find-and-replace-with-restrictfind-selections)    
&emsp; &emsp; &emsp; [e. find argument but no replace](#find-but-no-replace-key)  
&emsp; &emsp; &emsp; &emsp; [i. find, no replace, restrictFind: selections](#find-and-no-replace-with-restrictfind-selections)    
&emsp; &emsp; &emsp; [f. no find argument but with a replace](#with-a-replace-key-but-no-find-key)   

&emsp; &emsp; [13. Demonstrating `cursorMoveSelect` after replacement](#demonstrating-cursormoveselect-after-replacement)   

&emsp; &emsp; [14. `matchNumber` and `matchIndex`](#matchnumber-and-matchindex) 

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
  }
}    
```
Above is an example of the `preCommands` and `postCommands` arguments.  This functionality is in preview as of v2.3.0, particularly the `postCommands` as a lot of asynchronous code runs after the `preCommands` have finished.  So be very cautious with the `postCommands` for now.      

`preCommands` are run before any `find` or `replace` occurs.  It can be a single string or an object or an array of strings/objects.  The arguments `preCommands` and `postCommands` can appear anywhere in the arguments.  All the arguments can be in any order.  

`postCommands` are run after the find and replace has occurred.  And will only run **if** there has been a successful find match.  So if there is no find match, no `postCommand` will run.  

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
 
 &emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/surroundPad.gif?raw=true" width="800" height="300" alt="surround and pad selected text"/>  

-----------------

<br/>

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/enableWarningDialogSetting.jpg?raw=true" width="500" height="150" alt="enable warning dialog setting"/> 

If the `enableWarningDialog` is set to true, errors will be presented in a notification message either when attempting to run a keybinding, a setting command or on save of a setting if there are bad arguments.  Not all errors can be detected though so don't rely solely on this.  

The dialogs are modal for the keybindings, and non-modal for the settings.  The command can then be run or aborted.  

------------------  
## Using newlines

* Find: Use `\r?\n` with `isRegex` set to true is probably the safest across operating systems.     
* Replace: `\n` is probably sufficient, if not, try `\r\n`.  
* In a javascript operation replacement, make sure it is included in ticks or quotes so the newline is interpreted as a string ` $${ 'first line \n second line' }$$ `.   

* If you use newlines in a replace, the `cursorMoveSelect` option will not be able to properly calculate the new selection position.   

<br/>  

-----------------  

## What arguments can a `findInCurrentFile` setting or keybinding use:

```jsonc
{                                     // in keybindings.json 
  "key": "alt+r",
  "command": "findInCurrentFile",  
  
  "args": {
  
    "find": "(trouble)",               // can be plain text, a regexp or a special variable
    "replace": "\\U$1",                // text, variables, conditionals, case modifiers, operations, etc.
    
    "isRegex": true,                   // boolean, will apply to 'cursorMoveSelect' as well as the find query
    "matchWholeWord": true,            // boolean, same as above
    "matchCase": true,                 // boolean, same as above
    "restrictFind": "selections",      // restrict find to document, selections, line, once on line or next
    
    "cursorMoveSelect": "^\\s*pa[rn]am"     // select this text/regexp after making the replacement
  }
}
```

```jsonc
"findInCurrentFile": {                        // in settings.json

  "upcaseSelectedKeywords": {
  
    "title": "Uppercase Selected Keywords",   // used for Command Palette
    
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

<br/>

-----------

##  Using numbered capture groups in a `find`  
<br/>  

### &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; &emsp;  &emsp; &emsp; Example : `"find": "\\$1(\\d+)"`  
<br/>  

> Any numbered capture group, like the double-escaped `\\$1` above, will be **replaced by the first selection** in the current file (`\\$2` will be replaced by the second selection and so on).  You can easily make generic find regex's this way, that are determined by your selections not by hard-coding them first.  After these replacements, the `find` is run.   

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
    
    // "find": "\\$1(\\d+)\\$2",     // up to 9 capture groups
    // "replace": "",                // if no replace, matches will be highlighted
    
    // "isRegex": true necessary if other parts of the find use regexp's, like \\d, etc.
    "isRegex": true,                 // not necessary for the \\$n's + other plain text
  }
},

{
  "key": "alt+b",
  "command": "runInSearchPanel",     // uses the Search Panel
  "args": {

    "find": "\\$1\\.decode\\([^)]+\\)",
       
    "triggerSearch": true,
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
"findInCurrentFile": {                          // in settings.json
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

<br/>

--------------------

## How to insert a value at the cursor

If you do not want to find something and replace it but just want to insert some value at the cursor use a keybinding or setting liek the following:

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",  
  "args": {
                                                                  // no find key!!
    "replace": "\\U${relativeFileDirname}",                       // insert at cusor
    "replace": "Chapter ${matchNumber}",                          // Chapter 1, Chapter 2, etc.
    "replace": "Chapter $${ return ${matchNumber} * 10 }$$",      // Chapter 10, Chapter 20, etc.
  }
}
```  

There are two ways to use this - when there is no `find`:

1. The cursor is at a word (or a word is selected, same thing).  The `find` is constructed from that word/selection and the `replace` will replace any matches.  

2.  The cursor is not at any word - on a blank line or separated by spaces from any word.  Then there is **no find** constructed and the `replace` is just inserted where the cursor(s) are located.

Demo using `"replace": "Chapter ${matchNumber}"` and no `find`:

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/insertionsDemo.gif?raw=true" width="300" height="250" alt="insertions at cursor demo"/>

Explanation:  In the first case, the cursor is placed on `Chapter`, so that is the `find` and each occurrence of it is replaced with `Chapter ${matchNumber}`.  In the second case, multiple cursors are placed on empty lines so there is no find, in which case `"Chapter ${matchNumber}"` is inserted at each cursor.  
 
-----

<br/>

## Running multiple finds and replaces with a single keybinding or setting

The `find` and `replace` fields can either be a string of one find or an array of strings.  Examples:  

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
  

1.  If there are more `find` strings than `replace` strings: then the last `replace` value will be used for any remaining runs.  
2.  If there are more `replace`'s than `find`'s: then a generated find (see more at the "words at cursors" discussion below) using the cursor selections will be used for any remaining runs.   

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

<br/>

## Running Javacript Code in a Replacement  

It is difficult to debug errors in javascript code you write in a replacement as below.  If your keybinding or setting generates an error, you will get a warning message notifying you of the failure.  And if you check your `Output` tab, and chose `find-and-transform` from the dropdown menu, you may get some helpful information on the nature of the error.  

You can put `console.log(...)` statements into the replacement code.  It wil lbe logged to your `Help/Toggle Developer Tools/Console`. 

<br/> 

### Doing math on replacements

Use the special syntax **` $${<some math op>}$$ `** as a replace value.  Everything between the brackets will be evaluated as a javascript function so you can do more than math operations, e.g., string operations (see below).  [This does not use the `eval()` function.]  Examples:   

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {
    "find": "(?<=<some preceding text>)(\\d+)(?=<some following text>)",  // postive lookbehind/ahead

    "replace": "$${return $1 + $1}$$",             // will double the digits found in capture group 1  
    "replace": "$${return 2 * $1 }$$",             // will double the digits found in capture group 1  

    "replace": "$${return $1 + $2}$$",             // add capture group 1 to capture group 2  

    "replace": "$${return $1 * 2 + `,000` }$$",    // double group 1, append `,000` to it.  1 => 2,000  

    "replace": "$${return $1 * Math.PI }$$",       // multiply group 1 by Math.PI 
    
    "replace": "$${const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738)); return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long' }).format(date)}",
                                                   // insert: Saturday, 19 December 2020 at 20:23:16 GMT-7
                                                   
    "replace": [                                   // same output as above
      "$${",                                       // put opening "wrapper" on its own line!
        "const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738));",
        "return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long' }).format(date)",
      "}$$"                                        // put closing "wrapper" on its own line!
    ],     

    "isRegex": true  
  }
}
```  

### A `jsOperation` written as an array of statements:   

<br/>

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

<br/>  

### Doing string operations on replacements

<br/> 

You can also do string operations inside the special syntax ` $${<operations>}$$ ` as well.  But you will need to ***"cast"*** the string in bacticks, single quotes or escaped double quotes like so:   

```
$${ return `$1`.substring(3) }$$  use backticks (I recommend backticks) or  

$${ return '$1'.substring(3) }$$  or  use single quotes

$${ return \\"$1\\".includes('tro') }$$  escape the double quotes
```  
> You **must** backticks if the value, like a capture group or some variable, could contain newlines.  

> Any term that you wish to be interpreted as a string must be enclosed in ticks or quotes.  So in the first example below to replace the match with the string `howdy` I used backticks.  This is only necessary within the operations syntax `$${<operations>}$$` otherwise it is interpreted as an unknown variable by javascript.  

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {

    "find": "(trouble) (brewing)",

    "replace": "$${ return `howdy` }$$",                 // replace trouble brewing => howdy  
    "replace": "howdy",                                  // same result as above   

    "replace": "$${ return `$1`.indexOf('b') * 3 }$$",   // trouble brewing => 12  

    "replace": "$${ return `$1`.toUpperCase() + ' C' + `$2`.substring(1).toUpperCase() }$$",
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
    "return groovy[0].toUpperCase() + groovy.substring(1).toLowerCase();",
  "}",
  "else {",
    "let groovy = `${fileBasename}`.split('.');",
    "groovy = groovy.map(word => word[0].toUpperCase() + word.substring(1).toLowerCase());",
    "return groovy.join(' ');",
  "}",
  
  "}$$"           // put closing jsOperation wrapper on its own line
],
```

that capture group will be from the `replace/replaceAll` as you would expect.  Other capture groups in a javascript operation will reflect the capture groups from the `find` argument.  

> You can combine math or string operations within **` $${<operations>}$$ `**. 

----------------

<br/> 

### Doing other javascript operations on replacements

<br/> 

> There **must be one or more `return` statements** inside the ` $${...}$$ ` for whatever you want returned. 

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
  "$${",                                                  // opening wrapper on its own line
  "if (`${fileBasenameNoExtension}`.includes('-')) {",
                                                          // must use let or const for variables
    "let groovy = `${fileBasenameNoExtension}`.replace(/-/g, \" \");",
    "return groovy[0].toUpperCase() + groovy.substring(1).toLowerCase();",
  "}",
                                              // blank lines have no effect, indentation is irrelevant
  "else {",
    "let groovy = `${fileBasename}`.split('.');",
    "groovy = groovy.map(word => word[0].toUpperCase() + word.substring(1).toLowerCase());",
    "return groovy.join(' ');",
  "}", 
   
  "}$$",                                                 // closing wrapper on its own line
  
  "$${return 'second replacement'}$$",                   // 2nd replacement
  
  "\\U$1"                                                // 3rd replacement
  ```  
  
  All the code between each set of opening and closing wrappers will be treated as a single javascript replacement.  You can also put it all on one line if you want, like the `"$${return 'second task'}$$"` above.  The above `replace` will be treated as:
  
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

Explanation: Find `>` and add `class="uppercased filename">` to it.  

------------------  

## Special variables

<br/>

* ### Variables defined by this extension for use in args  

```
${resultsFiles}            ** explained below **
${getDocumentText}         get the entire text of the current document
  
${getTextLines:n}          get the text of a line, 'n' is 0-based, so ${getLineText:1} gets the second line of the file
${getTextLines:n-p}        get the text of a lines n through p inclusive, example  ${getTextLines:2-4} 

// to get the text from line `n`, column `p` through line `q`, column `r`
${getTextLines:n,p,q,r}    get the text of a lines n through q inclusive, from columns p to r, example  ${getTextLines:2,0,4,15}      
```

You will get intellisense in the keybinding or setting showing where the variables can be used.  

> ` ${resultsFiles}` is a specially created variable that will scope the next search to those files in the previous search's results. In this way you can run successive searches narrowing the scope each time to the previous search results files.  See &nbsp;  [Search using the Panel](searchInPanel.md).

Here is an example using `${getDocumentText}`:  

```jsonc
{
  "key": "alt+e",
  "command": "findInCurrentFile",
  "args": {

    "replace": [
      "$${",
        // note the variables should be wrapped in backticks, so they are interpreted as strings
        "const fullText = `${getDocumentText}`;",
        // "const fullText = `${vscode.window.activeTextEditor.document.getText()}`;",  // same as above, also works
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
  
<br/>

* ### Launch or task variables: path variables

These can be used in the `find` or `replace` fields of the `findInCurrentFile` command or in the `find`, `replace`, and perhaps most importantly, the `filesToInclude` and `filesToExclude` fields of the `runInSearchPanel` command:

```
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

<br/>

* ### Snippet variables

```
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

Explanation: The above keybinding (or it could be a command) will insert the result of (current hour - 1) at the cursor, **if** the cursor is not at a word - so on a empty line or with a space separating the cursor from any other word.   Otherwise, if the cursor is on a word that word will be treated as the `find` and all its occurrences (within the `restrictFind` scope: entire document/selections/once/line/next..) will be replaced by (current hour - 1).   

Note that vscode can do fancy things with snippet comment variables like `${LINE_COMMENT}` by examining the language of individual tokens so that, for example, css in js would get its correct comment characters if within the css part of the code.  This extension cannot do that and will get the proper comment characters for the file type only.  

<br/>

* ### Case modifier transforms

<br/>

 The find query and the replace transforms can include ***case modifiers*** like:  

```
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

<br/>

* ### Conditional replacements in `findInCurrentFile` commands or keybindings

<br/>

Vscode **snippets** allow you to make conditional replacements, see [vscode's snippet grammar documentation](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_grammar).  However you cannot use those in the find/replace widget.  This extension allows you to use those conditionals in a `findInCurrentFile` command or keybinding.  Types of conditionals and their meaning:

```
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
    "replace": "${1:+abcd`$2`efgh}",      // if group 1, add group 2 plus surrounding text
    
    "replace": "${1:+aaa\\}bbb}",         // must double-escape closing brackets if want it as text
    
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

<br/>

* ### Snippet-like transforms: replacements in `findInCurrentFile` commands or keybindings

<br/>

The following can be used in a `replace` field for a `findInCurrentFile` command:

```
${1:/upcase}      if capture group 1, transform it to uppercase (same as `\\U$1`)  
${2:/downcase}    if capture group 2, transform it to uppercase (same as `\\L$1`)  
${3:/capitalize}  if capture group 3, transform it to uppercase (same as `\\u$1`)  

${1:/pascalcase}  if capture group 1, transform it to pascalcase  
    (`first_second_third` => `FirstSecondThird` or `first second third` => `FirstSecondThird`)

${1:/camelcase}   if capture group 1, transform it to camelcase  
    (`first_second_third` => `firstSecondThird` or `first second third` => `firstSecondThird`)   
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
&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/individualTransforms.gif?raw=true" width="500" height="200" alt="apply transforms one by one"/>

Explanation: 

1. `"restrictFind": "nextSelect"` do the following one at a time, selecting each in turn  
2. If you want to skip transforming a match, just move the cursor beyond it (<kbd>rightArrow</kbd>).  

3. `${1:+ Found first!!}` if find a capture group 1, replace it with text "Found First!!"  
4. `${2:/upcase}` if find a capture group 2, uppercase it  
5. `${3:/downcase}` if find a capture group 3, lowercase it  


<br/>

----------------  

<br/>

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

> If `isRegex` is set to `false`, the replace value, even one like `\\U$2` will be interpreted as literal plain text.    

---------------  

<br/>

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/nextDontMoveFind.gif?raw=true" width="650" height="300" alt="notification to save after changing settings"/>


1. `"restrictFind": "nextDontMoveCursor"` make the next replacement but leave the cursor at the original position.  
2. `"restrictFind": "nextCursor"` make the next replacement and move the cursor to that next replaced match. Does not select.
3. `"restrictFind": "nextSelect"` make the next replacement and select it. 

>  When using the **above** `restrictFind` options the `cursorMoveSelect` option will be ignored. 

>  And these options above do not currently work with multiple selections.  Only the first selection made in the document will be used as a `find` value - so the order you make selections matters.  If you made multiple selections from the bottom of the document up, the first selection made (which would appear after other selections) would be used.        

You can use the `cursorMoveSelect` option with the below `restrictFind` options.  

4. `"restrictFind": "document"` the **default**, make all replacements in the document, select all of them.  
5. `"restrictFind": "once"` make the next replacement **after the cursor** on the **same line** only.  
6. `"restrictFind": "line"` make all replacements on the current line where the cursor is located.
7. `"restrictFind": "selections"` make all replacements in the selections only. 

The `cursorMoveSelect` option takes any text as its value, including anything that resolves to text, like `$` or any variable.  That text, which can be a result of a prior replacement, will be searched for after the replacement and the cursor will move there and that text will be selected.  If you have `"isRegex": true` in your command/keybinding then the `cursorMoveSelect` will be interpreted as a regexp.  `matchCase` and `matchWholeWord` settings will be honored for both the `cursorMoveSelect` and `find` text.  

If, for example you use these args:

```jsonc
{
"key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "(trouble)",
    "replace": "\\U$1",
    "isRegex": true,
    
    // "matchWholeWord": true,          // applies to both find and cursorMoveSelect
    // "matchCase": true,               // applies to both find and cursorMoveSelect
    
    // "restrictFind": "selections",    // select 'pa[rn]am' only in the selection(s) after making the replacement(s) 
    "restrictFind": "line",             // select 'pa[rn]am' on the current line after making the replacement(s) 
    
                                        // select only if at beginning of same line
    "cursorMoveSelect": "^\\s*pa[rn]am" // will be interpreted as a regexp since 'isRegex' is true 
    
    // "cursorMoveSelect": "^"          // cursor will go to beginning of line (if matchWholeWord is false)
    // "cursorMoveSelect": "$"          // cursor will go to end of line (if matchWholeWord is false, the default)
    
    // "restrictFind": "selections", 
    // "cursorMoveSelect": "^"          // cursor will go to beginning of each selection
    // "cursorMoveSelect": "$"          // cursor will go to end of each selection
  }
}
```
Note `^` and `$` work for `restrictFind` selections/line/once/document.    

1. `cursorMoveSelect` will select **all** matches in each `selections` **only** if there was a match in the same selection.     

2. `cursorMoveSelect` will select the first `cursorMoveSelect` match using `restrictFind` : `once` **only** if there was a match on the same line before a `cursorMoveSelect` match.  So a `find` match first and then a `cursorMoveSelect` match after that on the same line.  

3. `cursorMoveSelect` will select all `cursorMoveSelect` matches in the `document` **only** if there was a find match and only within the range of the find match!!  This may seem like a limitation but it makes possible some nice funtionality using `postCommands`.   

4. `cursorMoveSelect` will select all matches on a line using `restrictFind` : `line` **only** if there was a match on the same line.  

<br/>

> When you use the `cursorMoveSelect` argument for a `restrictFind: document` or the `nextMoveCursor` or `nextSelect` options for the `restrictFind` key, it is assumed that you actually want to go there and see the result.  So the editor will be scrolled to reveal the line of that match if it is not curently visible in the editor's viewport.  For `selections/line/once` no scolling will occur - it is assumed that you can see the resultant match already (the only way that wouldn't typically be true is if you had a long selection that went off-screen). 

<br/>  

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",
  "args": {

    // uses the selected text, which may simply be the word under the cursor
    "find": "${selectedText}(?=\\s*[}\\]]?\\s*=)",  // double-escaping, positive lookahead 
    "isRegex": true,
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/selectedTextWithReveal.gif?raw=true" width="700" height="500" alt="demo of selectedText with reveal"/>

Explanation: Very simple keybinding uses the selected text, either a word actually selected, or if none, the word under the cursor, as part of the `find` term - with a positive lookahead after the selected text.  In this case, the match will be revealed by editor scroll if necessary.  

<br/>

> Note: if there is no find and no replace or a find but no replace, the `cursorMoveSelect` argument is ignored.  

<br/>

--------  

### Some `"restrictFind": "next...` option examples

<br/>

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/nextMoveCursorFind.gif?raw=true" width="650" height="300" alt="nextMoveCursor with find and replace"/>

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
&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/nextSelectFind.gif?raw=true" width="650" height="300" alt="nextSelect with find and replace"/>

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
&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/nextMoveCursorNoFindNoReplace.gif?raw=true" width="650" height="300" alt="nextMoveCursor with no find or replace"/>

Explanation: With no `find` argument, the current nearest word to the cursor (see more on this below) will be used as the `find` value.  So, in the above example `FIXME` will be used as the find query.  And with `nextMoveCursor` the cursor will move to the next match.  `nextSelect` could be used here as well.  

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/lineNumberAtEndWrap.gif?raw=true" width="600" height="400" alt="demo of putting the lineNumber at the end of lines with content and wrapping to start of file"/>

Explanation: Find the end of non-empty lines and append '-' and that line number.  `nextSelect` => do one at a time.  

<br/>  

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

<br/>

-------------------

## Sample Keybindings

Examples of possible keybindings (in your `keybindings.json`):  

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/ifLineNumberMatch.gif?raw=true" width="150" height="250" alt="line Number match"/>


------------

When you save a change to the **settings**, you will get the message notification below.  This extension will detect a change in its settings and create corresponding commands.  The commands will not appear in the Command  Palette **without saving the new setting** and reloading vscode.  

<br/>

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/reloadMessage.jpg?raw=true" width="525" height="150" alt="notification to save after changing settings"/>

<br/>  

-----------------------------  

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/genericRunCommandKeybinding.gif?raw=true" width="650" height="300" alt="demo of generic findInCurrentFile keybinding"/>  

<br/>

In this way you can specify a keybinding to run a generic `findInCurrentFile` command with all the arguments right in the keybinding and nowhere else.  There is no associated setting and you do not need to reload vscode for this version to work.  You can have an unlimited number of keybindings (with separate trigger keys and/or `when` clauses, of course) using the `findInCurrentFile`  version.

The downside to this method is that these `findInCurrentFile` keybinding-only versions cannot be found through the Command Palette.    

<br/>

--------------------  

### `"nearest words at cursors"`
<br/>  

>  Important:  &nbsp; What are &nbsp; **`"nearest words at cursors"`**? &nbsp; In VS Code, a cursor immediately next to or in a word is a selection (even though no text may actually be selected!).  This extension takes advantage of that: if you run a `findInCurrentFile` command with no `find` arg it will treat any and all "nearest words at cursors" as if you were asking to find those words.  Actual selections and "nearest words at cursors" can be mixed by using multiple cursors and they will all be searched for in the document.  It appears that a word at a cursor is defined generally as this: `\b[a-zA-Z0-9_]\b` (consult the word separators for your given language) although some languages may define it differently.   

<br/> 

> If a cursor is on a blank line or next to a non-word character, there is no "nearest word at cursor" by definition and this extension will simply return the empty string for such a cursor.  

> So with the cursor at the start or end of `FIXME` or anywhere within the word, `FIXME` is the word at the cursor.  `FIXME-Soon` consists of two words (in most languages).  If the cursor followed the `*` in `FIXME*` then `FIXME` is **not** the word at the cursor.  

This is demonstrated in some of the demos below.  

<br/>  

*  Generic `run` command in `keybindings.json`, no `find` or `replace` keys in the `args`

```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile"
},
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindNoReplaceDemo.gif?raw=true" width="650" height="300" alt="demo of no find and no replace keys in args"/> 

Explanation: With no `find` key, find matches of selections or nearest words at cursors (multi-cursors work) and select all those matches.  Blue text are selections in the demo gif.

> Important: If there is no `find` key and there are **mutiple selections** then this extension will create a `find` query using **all** those selections.  The generated `find` will be in the form of `"find": "(word1|word2|some selected text)`.  Note the use of the alternation pipe `|` so any of those selected words can be found.  Thus, the find in file or find across files must have the regex flag enabled.  Therefore, if you have multiple selections with no `find` key, `"isRegex": true` will be automatically set - possibly overriding what you had the settings or keybinding.  

> That should only be a problem if you select text that gets generated into a `find` term that itself contains regexp special characters, like `.?*^$`, etc.  They will not be treated as literal characters but as their usual regexp functionality.  

> Finally, if you select multiple instances of the same text the generated `find` term will have any duplicates removed.  `Set.add()` is a beautiful thing.  

<br/>

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

<br/>  

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findReplaceDemo.gif?raw=true" width="650" height="250" alt="demo of find and replace keys in args"/>  

Explanation: Find using its value in `args` and replace each with its value in the `args` field.  Since there is no `restrictFind` key, the default `document` will be used.   

----------------

<br/>  

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findReplaceSelectionDemo1.gif?raw=true" width="700" height="300" alt="demo of using restrictFind 'selection' and 'cursorMoveSelect"/>  

Explanation: Using `restrictFind` arg set to `selections`, find will only occur within any selections.  Selections can be multiple and selections do include "nearest words at cursors". Using `cursorMoveSelect` to select all instances of `TABLE`.  

<br/>

> Note a subtle difference in the above demo.  If you make an actual full selection of a word or words, only text within that selection will be searched.  But if you make a "nearest word"-type selection (a cursor in or next to a word) then all matching words in the document will be searched for, even if they are not in a selection of their own.  If you want to restrict the search to a selection, make an actual selection - do not rely on the nearest word functionality.  

<br/>  

#### If `restrictFind` is not set to anything, it defaults to `document`.  So the entire document will be searched and any selections will be ignored, since a `find` has been set.  Remember if no `find` is set, then any selections will be interpreted as the `find` values.  

<br/>  

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

<br/>

--------------------

### `find` but no `replace` key
*   

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findNoReplaceDemo.gif?raw=true" width="650" height="250" alt="demo of find and no replace keys in args"/> 

Explanation: Will find according to the `find` value and select all those matches.  No replacement. 

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
&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findNoReplaceSelectionDemo.gif?raw=true" width="650" height="250" alt="demo of using restrictFind arg to 'selection'" with no replace/>  

Explanation: Using `restrictFind` arg set to `selections`, find will only occur within any selections.  All find matches within selections will be selected.  

<br/>  

If you have set `"restrictFind": "document"` any actual selections in the file will be ignored and the find/replace will be applied to the entire file.    

------------

<br/>  

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindReplaceDemo.gif?raw=true" width="750" height="300" alt="demo of replace but no find keys in args"/>  

Explanation: With no `find` value find all the words at the cursors or selections and apply the replacement.  

---------------


<br/>  

## Demonstrating `cursorMoveSelect` after replacement

```jsonc
"findInCurrentFile": {              // in settings.json
  "addClassToElement": {
    "title": "Add Class to Html Element",
    "find": ">",
    "replace": " class=\"@\">",
    "isRegex": true,
    "restrictFind": "once", 
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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/cursorMoveOnce.gif?raw=true" width="650" height="300" alt="demo of using cursorMoveSelect arg with restrictFind of 'once'"/>

Explanation: Find the first `>` within selection(s) and replace them with ` class=\"@\">`.  Then move the cursor(s) to `@` and select it.  `cursorMoveSelect` value can be any text, even the regexp delimiters `^` and `$`.    

<br/>

* `"restrictFind": "once"` => find the FIRST instance of the `find` query AFTER the cursor (so if your cursor is in the middle of a word, only part of that word is **after** the cursor), replace it and then go to and select the `cursorMoveSelect` value if any.  Works the same for multiple cursors.  

* `"restrictFind": "line"` => find all instances of the `find` query on the entire line with the cursor, replace them and then go to and select All `cursorMoveSelect` values if any.  Works on each line if multiple cursors.  But it only considers the line where the cursor(s) is, so if there is a multi-line selection, only the line with the cursor is searched.   

<br/> 

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/matchIndex.gif?raw=true" width="600" height="400" alt="demo of using ${matchIndex} with cursorMoveSelect"/>

Explanation: The match in this case is "text$" ('text' at the end of a line).  The first instance of a match has `matchNumber` = 1 and that will be used in the replacement.  `${matchIndex}` is the same but 0-based.  

<br/>  

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/matchNumberCase.gif?raw=true" width="600" height="400" alt="demo of using ${matchNumber} with case transform"/>    

<br/>  

-------------------  

<br/>

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

<br/>

## TODO

* Add more error messages, like if a capture group used in replace but none in the find.
* Internally modify `replace` key name to avoid `string.replace` workarounds.  
* Explore adding a command `setCategory` setting.  Separate category for Search Panel commands?    
* Support the  `preserveCase` option in  `findInCurrentFile`.  
* Add a `cursorMove` option (like `cursorMoveSelect` without the selection).    
* Consider how `cursorMoveSelect` should work in full document search?  
* Check `cursorMoveSelect` and `${TM_CURRENT_LINE}` interaction.  
* `async/await` all code so `postCommands` are more reliable.     


## Release Notes

* 0.9.7 Added error checking for arguments.  Added support for `onlyOpenEditors` argument. 
* 0.9.8 Added more `lineNumber/Index` support.  Added `matchNumber/Index` variable. 	

* 1.0.0 Added ability to do math and string operations on `findInCurrentFile` replacements.  
&emsp;&emsp; Can do multiple finds and replaces in a single keybinding or setting.  

* 1.1.0 Work on ` $${<operation>} `, adding `return`.  **Breaking change**. 
 
* 2.0.0 Work on ` $${<operation>}$$ `, adding `$$` to the end for parsing.  **Breaking change**.   
&emsp;&emsp; Added snippet-like cursor replacements.  
&emsp;&emsp; Added ability to have an **array of code** for jsOp `replace`.  
&emsp;&emsp; Added snippet variables like `${CURRENT_HOUR}`, `${LINE_COMMENT}`, `${TM_CURRENT_LINE}`, etc.   

* 2.1.0 Added intellisense for `find` snippet variables.  
&emsp;&emsp;Fixed `find` `${TM_CURRENT_LINE}` resolution.   

* 2.2.0  Added the ability to run vscode commands **before** performing the find.   
&emsp;&emsp; Improved `^` and `$` regex line delimiter handling in `cursorMoveSelect`.    

* 2.3.0  Can now execute vscode commands with arguments.   

* 2.4.0  Use capture groups in `find`.   
&emsp;&emsp; 2.4.2 Restrict number of capture groups to 9.  
&emsp;&emsp; 2.4.3 Fixed `cursorMoveSelect` and once/line.  Added ignore langID's.  

* 3.0.0  Enable multiple searches in `runInSearchPanel`.   
&emsp;&emsp; Added snippet variable resolution to  `runInSearchPanel`.  
&emsp;&emsp; Added a `delay` arg to `runInSearchPanel`.  
&emsp;&emsp; 3.1.0 Escape /'s in a replace.  Added outputChannel.  

* 3.2.0  Added the variables `${getDocumentText}` and `${getLineText:n}`.  
&emsp;&emsp; 3.2.5 Rename `${getLineText:n}` and add `${getLineText:n-p}` and `${getLineText:n,o,p,q}`.    
&emsp;&emsp; 3.2.6 Fix setting `filesToInclude` to  resolved `${resultsFiles}`.  

* 3.3.0  Move `postCommands` into individual transform functions.  Run them only if a find match.    
&emsp;&emsp; `cursorMoveSelect` in whole document restricted to find match ranges.  

<br/> 

-----------------------------------------------------------------------------------------------------------  

<br/>  
<br/> 