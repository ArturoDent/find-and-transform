# find-and-transform

[VS Code version 1.56 or greater required.]  

Find and transform text in a single file, folder, workspace or custom groups.  
Search across files with pre-defined options.  
Do a second search only in the files with matches from a previous search.      

*   &emsp; Any number of find/replace combinations can be saved in settings and triggered either by the Command Palette or a keybinding.
*   &emsp; Replacements can include case modifiers, like `\U`, conditionals, as in if found capture group 1, add other text, snippet-like transforms like `${1:/pascalcase}` and more.   

*   &emsp; Keybindings can be quite generic, not necessarily even including `find` or `replace` keys!    
*   &emsp; A command can be created right in a keybinding, without using a setting at all.  

*   &emsp; Supports using path variables in the Search Panel `find/replace/filesToInclude/filesToExclude`, including the current file only or current directory.    

*   &emsp; All `findInCurrentFile` commands can be used in `"editor.codeActionsOnSave": []`. &emsp; See &nbsp; [running commands on save](codeActions.md).
*   &emsp; After replacing some text, optionally move the cursor to a designated location with `cursorMoveSelect`.  

-------------

> Note: commands can be removed by deleting or commenting out the associated settings and re-saving the `settings.json` file and reloading VS Code. 

-----------------

Below you will find information on using the `findInCurrentFile` command - which performs a find within the current file, like using the Find Widget but with the ability to save these file/replaces as settings or keybindings.  Some of the information here will be useful to using the `runInSearchPanel` as well - so you should read both.  See  [Search using the Panel](searchInPanel.md).  

------------------

## Contributed Setting

this extension contributes one setting relevant to the `findInCurrentFile` settings and keybindings:  

* `"find-and-transform.enableWarningDialog"` default = true

This setting controls whether the extension will attempt to find errors in your keybinding or settings argument keys or values.  

```jsonc
{
	"key": "alt+r",
	"command": "findInCurrentFile",
	"args": {
      "find": "trouble",
      "replace": "howdy",
      "isRegex2": true,          // error, no "isRegex2" key, should be "isRegex"
      "restrictFind": "twice",   // error, no such value allowed for "restrictFind"
      "matchCase": "true",       // error, should be a boolean not a string
      "matchCase": true          // correct
	}
}
```

If the `enableWarningDialog` is set to true, such errors will be presented in a notification message either when attempting to run a keybinding, a setting command or on save of a setting if there are bad arguments.  Not all errors can be detected though so don't rely solely on this.  

The dialogs are modal for the keybindings, and non-modal for the settings.  The command can then be run or aborted.  

------------------

<br/>

## What arguments can a &nbsp; `findInCurrentFile` &nbsp; setting or keybinding use:

```jsonc
{
	"key": "alt+r",
	"command": "findInCurrentFile",            // in keybindings.json  

	"args": {

		"find": "(trouble)",          //  can be plain text, a regexp or a special variable
		"replace": "\\U$1",           //  text, variables, conditionals, case modifiers, etc.

		"isRegex": true,              //  boolean, will apply to 'cursorMoveSelect' as well as the find query
		"matchWholeWord": true,       //  boolean, same as above
		"matchCase": true,            //  boolean, same as above
		"restrictFind": "selections", //  restrict find to document, selections, line, once on line or next

		"cursorMoveSelect": "^\\s*pa[rn]am"  //  select this text/regexp after making the replacement
	}
}
```

```jsonc
"findInCurrentFile": {                       // in settings.json

	"upcaseSelectedKeywords": {

		"title": "Uppercase selected Keywords",  //  used for Command Palette

		"find": "(Hello) (World)",
		"replace": "\\U$1--${2:-WORLD}",         //  if no capture group 2, add "WORLD"

		"isRegex": true,                         //  default = false
		"matchCase": false,                      //  default = false
		"matchWholeWord": true,                  //  default = false
		"restrictFind": "selections",            //  default = document

		"cursorMoveSelect": "Select me"
	}
}
```

> Note that the `preserveCase` option is not yet supported.  

> **Defaults**: If you do not specify an argument, its default will be applied.  So `"matchCase": false` is the same as no `"matchCase"` argument at all.  

-----------

<br/>

## Special variables 

<br/>

* ### Launch/task-like variables  

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

${selectedText}
${CLIPBOARD}
${pathSeparator}
${lineNumber}              only resolved once for first cursor, line numbers start at 1, not 0
${resultsFiles}            ** explained below
```

These variables should have the same resolved values as found at &nbsp; [vscode's pre-defined variables documentation](https://code.visualstudio.com/docs/editor/variables-reference#_predefined-variables).   

> ` ${resultsFiles}` is a specially created variable that will scope the next search to those files in the previous search's results. In this way you can run successive searches narrowing the scope each time to the previous search results files.  See &nbsp;  [Search using the Panel](searchInPanel.md).  

<br/>
<br/>

* ### Case modifier transforms  

<br/>

 The replace transforms can include ***case modifiers*** like:  

```
\\U$n   uppercase the entire following capture group as in `\\U$1`
\\u$n   capitalize the first letter only of the following capture group: `\\u$2`
\\L$n   lowercase the entire following capture group:  `\\L$2`
\\l$n   lowercase the first letter only of the following capture group: `\\l$3`
``` 

These work in **both** the `findInCurrentFile` and `runInSearchPanel` commands or keybindings.  

<br/>

> Note, the above case modifiers must be double-escaped in the settings or keybindings.  So `\U$1` should be `\\U$1` in the settings.  VS Code will show an error if you do not double-escape the modifiers (similar to other escaped regexp items like `\\w`).

<br/>
<br/>

* ### Conditional replacements in `findInCurrentFile` commands or keybindings  

<br/>

Vscode **snippets** although you to make conditional replacements, see [vscode's snippet grammar documentation](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_grammar).  But you cannot use those in the find/replace widget however.  This extension allows you to use those conditionals in a `findInCurrentFile` command or keybinding.  Types of conditionals and their meaning:

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
		"find": "(First)|(Second)|(Third)",  // your regexp with possible capture groups

		"replace": "${3:-yada3} \\U$1",      // if no group 3, add "yada3" then upcase group 1

		                                    // groups within conditionals must be surrounded by backticks `$2`
		"replace": "${1:+abcd`$2`efgh}",    // if group 1, add group 2 plus surrounding text

		"replace": "${1:+aaa\\}bbb}",       // must double-escape closing brackets if want it as text

		"replace": "${1:+*`$1``$1`*}${2:+*`$2``$2`*}",  // lots of combinations possible

		"replace": "$0",                      // can use whole match as a replacement

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
<br/>

* ### Snippet-like transforms: replacements in `findInCurrentFile` commands or keybindings  

<br/>

The following can be used in a `replace` field for a `findInCurrentFile` command:

```
${1:/upcase}      if capture group 1, transform it to uppercase (same as `\\U$1`)  
${2:/downcase}    if capture group 2, transform it to uppercase (same as `\\L$1`)  

${1:/pascalcase}  if capture group 1, transform it to pascalcase  
    (`first_second_third` => `FirstSecondThird` or `first second third` => `FirstSecondThird`)

${1:/camelcase}   if capture group 1, transform it to camelcase  
    (`first_second_third` => `firstSecondThird` or `first second third` => `firstSecondThird`)   

${3:/capitalize}  if capture group 3, transform it to uppercase (same as `\\u$1`) 
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
		"restrictFind": "nextSelect"
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
	// "replace": "${2:/pascalcase}",    // same bad result

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
    "find": "FIXME",    		// or use the word at the cursor
    "replace": "DONE",
    "restrictFind": "nextDontMoveCursor",
    // "cursorMoveSelect": "FIXME"   // will be ignored with the 'next...` options
  }
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/nextDontMoveFind.gif?raw=true" width="650" height="300" alt="notification to save after changing settings"/>


1. `"restrictFind": "nextDontMoveCursor"` make the next replacement but leave the cursor at the original position.  
2. `"restrictFind": "nextCursor"` make the next replacement and move the cursor to that next replaced match. Does not select.
3. `"restrictFind": "nextSelect"` make the next replacement and select that next replaced match. 

>  When using the **above** `restrictFind` options the `cursorMoveSelect` option will be ignored. 

>  And these options above do not currently work with multiple selections.  Only the first selection made in the document will be used as a `find` value - so the order you make selections matters.  If you made multiple selections from the bottom of the document up, the first selection made (which would appear after other selections) would be used.        

You can use the `cursorMoveSelect` option with the below `restrictFind` options.  

4. `"restrictFind": "document"` the **default**, make all replacements in the document, select all of them.  
5. `"restrictFind": "once"` make the next replacement on the **same line** only.  
6. `"restrictFind": "line"` make all replacements on the current line where the cursor is located.
7.  `"restrictFind": "selections"` make all replacements in the selections only. 

The `cursorMoveSelect` option takes any text as its value.  That text, which can be part of the replacement text or any text, will be searched for after the replacement and the cursor will move there and that text will be selected.  If you have `"isRegex": true` in your command/keybinding then the `cursorMoveSelect` will be interpreted as a regexp.  `matchCase` and `matchWholeWord` settings will be honored for both the `cursorMoveSelect` and `find` text.  

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

		// "restrictFind": "selections", 
		// "cursorMoveSelect": "^"          // cursor will go to beginning of each single-line selection
	}
}
```
Note `^` and `$` work well for `restrictFind` selections/line/once, but are disabled for `"restrictFind": "document"`.  

`cursorMoveSelect` will select **all** matches in each `selections` or `line` (remember a `line` will find matches in each line with a cursor.)  

For `"restrictFind": "once"`, &nbsp; `cursorMoveSelect` will select the first match **after** the cursor. That is why if using `"cursorMoveSelect": "^"` the cursor won't go there because the cursor is already after the start of the line and the search is only forward from the cursor. `"cursorMoveSelect": "$"` will always work with `"restrictFind": "once"`.  

<br/>

> Note: if there is no find and no replace, the `cursorMoveSelect` argument is ignored.  

<br/>

--------  

### Some `"restrictFind": "next...` option examples:  

<br/>

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "FIXME",
    "replace": "DONE!",
    "restrictFind": "nextMoveCursor",
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
    "restrictFind": "nextSelect",
  }
}
```
&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/nextSelectFind.gif?raw=true" width="650" height="300" alt="nextSelect with find and replace"/>

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    // "find": "FIXME",   // !! no find or replace !!
    // "replace": "DONE",
    "restrictFind": "nextMoveCursor"   // or try `nextSelect` here  
  }
}
```
&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/nextMoveCursorNoFindNoReplace.gif?raw=true" width="650" height="300" alt="nextMoveCursor with no find or replace"/>

Explanation: With no `find` argument, the current nearest word to the cursor (see more on this below) will be used as the `find` value.  So, in the above example `FIXME` will be used as the find query.  And with `nextMoveCursor` the cursor will move to the next match.  `nextSelect` could be used here as well.  

-------------------

## Sample Usages in Settings  

In your `settings.json`:  

```jsonc
"findInCurrentFile": {                 // perform a find/replace in the current file or selection(s)

	"upcaseSwap2": {                       	// <== the "name" that can be used in a keybinding, no spaces
		"title": "swap iif <==> hello",  	// title that will appear in the Command Palette
		"find": "(iif) (hello)",
		"replace": "_\\u$2_ _\\U$1_",  		// double-escaped case modifiers
		"isRegex": true,
		"restrictFind": "selections"
	},
	"capitalizeIIF": {
		"title": "capitalize 'iif'",     	// all settings must have a "title" field
		"find": "^(iif)",
		"replace": "\\U$1",
    "isRegex": true
	},
	"addClassToElement": {
    "title": "Add Class to Html Element",
    "find": ">",
    "replace": " class=\"@\">",
    "restrictFind": "selections",
    "cursorMoveSelect": "@"                  // after the replacement, move to and select this text
  }
},

// perform a search/replace using the Search Panel, optionally in current file/folder/workspace/etc.

"runInSearchPanel": {                  // use this as first part of command name in keybindings

	"removeDigits": {                           // used in the keybindings so no spaces allowed
		"title": "Remove digits from Art....",
		"find": "^Arturo\\d+",   			            // double-escaped
		"replace": "",
		"triggerSearch": "true",
		"isRegex": true
	}
}
```  

> If you do not include a `title` value, one will be created using the name (like `removeDigits` in the last example immediately above. Then you can look for `Find-Transform:removeDigits` in the Command Palette.  Since in the last example a `title` was supplied, you would see `Find-Transform: Remove digits from Art....` in the Command Palette.  All the commands are grouped under the `Find-Transform:` category.  

<br/>


Examples of possible keybindings (in your `keybindings.json`):  

```jsonc
// below: keybindings generated from commands in the settings  

{
	"key": "alt+u",
	"command": "findInCurrentFile.upcaseKeywords"   // from the settings
},                                   // any "args" here will be ignored, they are in the settings

 
// below: a generic "findInCurrentFile" keybinding command, no need for any settings to run these

{                                         
	"key": "alt+y",
	"command": "findInCurrentFile",       // note no second part of a command name
	"args": {                             // must set the "args" here since no associated settings command
		"find": "^(iif)",                 // note the ^ = beginning of line
		"replace": "\\U$1",               // all the "args" are optional
		"isRegex": true,
		"restrictFind": "selections",
		"cursorMoveSelect": "IIF"         // this text will be selected; "$" goes to the end of the selections
	}
},
```  

------------

When you **save** a change to the settings, you will get the message notification below.  This extension will detect a change in its settings and create corresponding commands.  The commands will not appear in the Command  Palette **without saving the new setting** and reloading vscode.  

<br/>

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/reloadMessage.jpg?raw=true" width="525" height="150" alt="notification to save after changing settings"/>

<br/>  

-----------------------------  

An example of keybinding with **NO associated setting**, in `keybindings.json`:  

```jsonc
{
	"key": "alt+y",
	"command": "findInCurrentFile",  // note no setting command here
	"args": {

		// multiline regexp ^ and $ are supported, "m" flag is automatically applied to all searches  
		// if finding within a selection(s), '^' refers to the start of a selection, NOT the start of a line
		// if finding within a selection(s), '$' refers to the end of a selection, NOT the end of a line

		"find": "^([ \\t]*const\\s*)(\\w*)",  // double escaping

		"replace": "$1\\U$2",		              // capitalize the word following "const"
		"isRegex": true,

		"restrictFind": "selections"     	    // find only in selections
	}
},
```  

<br/>

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/genericRunCommandKeybinding.gif?raw=true" width="650" height="300" alt="demo of generic findInCurrentFile keybinding"/>  

<br/>

In this way you can specify a keybinding to run a generic `findInCurrentFile` command with all the arguments right in the keybinding and nowhere else.  There is no associated setting and you do not need to reload vscode for this version to work.  You can have an unlimited number of keybindings (with separate trigger keys and/or `when` clauses, of course) using the `findInCurrentFile`  version.

The downside to this method is that the various commands are not kept in one place, like your `settings.json` and these `findInCurrentFile` versions cannot be found through the Command Palette.    

<br/>

--------------------  

## More Examples and Demos

<br/>  

>  Important:  &nbsp; What are &nbsp; **`"nearest words at cursors"`**? &nbsp; In VS Code, a cursor immediately next to or in a word is a selection (even though no text may actually be selected!).  This extension takes advantage of that: if you run a `findInCurrentFile` command with no `find` arg it will treat any and all "nearest words at cursors" as if you were asking to find those words.  Actual selections and "nearest words at cursors" can be mixed by using multiple cursors and they will all be searched for in the document.  It appears that a word at a cursor is defined generally as this: `\b[a-zA-Z0-9_]\b` although some languages may define it differently.  

> So with the cursor at the start or end of `FIXME` or anywhere within the word, `FIXME` is the word at the cursor.  `FIXME-Soon` consists of two words.  If the cursor followed the `*` in `FIXME*` then `FIXME` is **not** the word at the cursor.  

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

---------------

<br/>  

* Generic `run` command in `keybindings.json` only, with `find` but no `replace` key  

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

------------------

<br/>  

* Generic `findInCurrentFile` command in `keybindings.json` only, with `find` and `replace` keys   

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

* Generic `findInCurrentFile` command in `keybindings.json` only, with a `replace` key but NO `find` key   

```jsonc
{
	"key": "alt+y",
	"command": "findInCurrentFile",
	"args": {
		// "find": "(create|table|exists)",
		"replace": "\\U$1",
		"isRegex": true
	}
}
```  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindReplaceDemo.gif?raw=true" width="650" height="300" alt="demo of replace but no find keys in args"/>  

Explanation: With no `find` value find all the words at the cursors or selections and apply the replacement.  

---------------

<br/>  

* `find` and `replace` with `"restrictFind": "selections"`   

```jsonc
{
	"key": "alt+y",
	"command": "findInCurrentFile",
	"args": {
		"find": "(create|table|exists)",   // find each of these words
		"replace": "_\\U$1_",              // capitalize _capture group 1_
		"isRegex": true,
		"restrictFind": "selections",
		"cursorMoveSelect": "TABLE"        // will select 'TABLE' only if it is within a selection 
	}
}
``` 

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findReplaceSelectionDemo1.gif?raw=true" width="700" height="300" alt="demo of using restrictFind 'selection' and 'cursorMoveSelect"/>  

Explanation: Using `restrictFind` arg set to `selections`, find will only occur within any selections.  Selections can be multiple and selections do include "nearest words at cursors". Using `cursorMoveSelect` to select all instances of `TABLE`.  

<br/>

> Note a subtle difference in the above demo.  If you make an actual full selection of a word or words, only text within that selection will be searched.  But if you make a "nearest word"-type selection (a cursor in or next to a word) then all matching words in the document will be searched for, even if they are not in a selection of their own.  If you want to restrict the search to a selection, make an actual selection - do not rely on the nearest word functionality.  

<br/>  

### If `restrictFind` is not set to anything, it defaults to `document`.  So the entire document will be searched and any selections will be ignored, since a `find` has been set.  Remember if no `find` is set, then any selections will be interpreted as the `find` values.  

<br/>  

The above keybinding is no different than this setting (in your `settings.json`):  

```jsonc
"findInCurrentFile": {
	"upcaseSelectedKeywords": {
		"title": "Uppercase selected Keywords",      // a "title" is required in the settings
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

<br/>  

* demonstrating `cursorMoveSelect` after replacement  

```jsonc
"findInCurrentFile": {               // in settings.json
  "addClassToElement": {
    "title": "Add Class to Html Element",
    "find": ">",
    "replace": " class=\"@\">",
		"isRegex": true,
    "restrictFind": "once", 
    "cursorMoveSelect": "@"          // select the next '@'
  }
}
```

```jsonc
  {                                 // a keybinding for the above setting
    "key": "alt+q",                 // whatever you want

	      // should get intellisense for available settings commands after typing `findInCurrentFile.`  
    "command": "findInCurrentFile.addClassToElement"

	// "when": ""                   // can be used here
	// "args": {}                   // will be ignored, the args in the settings rule  
  },
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/cursorMoveOnce.gif?raw=true" width="650" height="300" alt="demo of using cursorMoveSelect arg with restrictFind of 'once'"/>

Explanation: Find the first `>` within selection(s) and replace them with ` class=\"@\">`.  Then move the cursor(s) to `@` and select it.  `cursorMoveSelect` value can be any text, even the regexp delimiters `^` and `$`.    

<br/>

* `"restrictFind": "once"` => find the FIRST instance of the `find` query AFTER the cursor, replace it and then go to and select the `cursorMoveSelect` value if any.  Works the same for multiple cursors.  

* `"restrictFind": "line"` => find all instances of the `find` query on the entire line with the cursor, replace them and then go to and select All `cursorMoveSelect` values if any.  Works on each line if multiple cursors.  But it only considers the line where the cursor(s) is, so if there is a multi-line selection, only the line with the cursor is searched.   

<br/> 

-----------

* `find` and no `replace` with `"restrictFind": "selections"`  

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

---------------------- 

<br/>

> Note: Regex lookbehinds that are **not fixed-length** (also called fixed-width sometimes), like `(?<=^Art[\w]*)` are not supported in the Search Panel.  But non-fixed-length lookbehinds are supported in vscode's Find in a file (as in using the Find widget) so they can be used in `findInCurrentFile` settings or keybindings.  

This works:    


```jsonc
{
	"key": "alt+y",
	"command": "findInCurrentFile",         // findInCurrentFile
	"args": {
		"find": "(?<=^Art[\\w]*)\\d+",      // not fixed-length, but okay in findInCurrentFile
		"replace": "###",
		"isRegex": true,
	}
}
```

but the same keybinding in `runInSearchPanel` **will error and not produce any results**:  

```jsonc
{
	"key": "alt+y",
	"command": "runInSearchPanel",            // runInSearchPanel
	"args": {
		"find": "(?<=^Art[\\w]*)\\d+",        // not fixed-length: ERROR will not run
		"replace": "###",
		"isRegex": true,
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
* Explore more string operations (e.g., `substring()`, `trim()`, `++`) in the replace settings/args?    
* Explore replacing with current match index?
* Resolve `${lineNumber}` for each cursor/selection.  Need new api?  
* Support the  `preserveCase` option in  `findInCurrentFile`.  


## Release Notes

* 0.9.5	Added support for variables in `filesToExclude`.   
* 0.9.6	Added support for **conditionals** in `replace` in `findInCurrentFile`.  
  &emsp;&emsp; Added `${\d:/upcase/downcase/capitalize/camelcase/pascalcase}` to `findInCurrentFile` `replace` argument.   
  &emsp;&emsp; Added `isRegex/matchCase/matchWholeWord` to `findInCurrentFile` arguments.  
  &emsp;&emsp; Added intellisense for case modifiers with selection of nth group number for editing.  

<br/> 

-----------------------------------------------------------------------------------------------------------  

<br/>  
<br/> 