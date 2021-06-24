# find-and-transform

Find and transform text in a single file, folder, workspace or custom group.    

1.   &emsp; Any number of find/replace combinations can be saved in settings and triggered either by the Command Palette or a keybinding.
2.   &emsp; Replacements can include case modifiers, like `\U`.  
3.   &emsp; Find in the entire document, within selections only, the first occurrence or the line only.  
     &emsp; Or find the next occurrence and optionally select it and/or replace it.  

4.   &emsp; Keybindings can be quite generic, not necessarily even including `find` or `replace` keys!    
5.   &emsp; A command can be created right in a keybinding, without using a setting at all.  

6.   &emsp; Can also use pre-defined searches using the Search Panel with command `runInSearchPanel`.  
7.   &emsp; Supports using various path variables in the Search Panel, include the current file only.  

8.   &emsp; All `findInCurrentFile` commands can be used in `"editor.codeActionsOnSave": []`. &emsp; See [running commands on save](codeActions.md).
9.   &emsp; After replacing some text, optionally move the cursor to a designated location with `cursorMoveSelect`.     

 The replace transforms can include ***case modifiers*** like:  

&emsp; &emsp;   `\U`  &emsp; uppercase the entire following capture group as in `\\U$1`  
&emsp; &emsp;   `\u`  &emsp; capitalize the first letter only of the following capture group: `\\u$2`     
&emsp; &emsp;   `\L`  &emsp; lowercase the entire following capture group:  `\\L$2`  
&emsp; &emsp;   `\l`  &emsp; lowercase the first letter only of the following capture group: `\\l$3`     

<br/>

This extension provides a way to save and re-use find/replace regex's and use case modifiers in the replacements.  You can use case modifiers in VS Code's find or search views but it is not possible to save frequently-used find/replacements. In addition, these saved searches can use various file or directory paths for inclusion.    

<br/>

> Note, the above case modifiers must be double-escaped in the settings or keybindings.  So `\U$1` should be `\\U$1` in the settings.  VS Code will show an error if you do not double-escape the modifiers (similar to other escaped regex items like `\\w`).  

<br/>

-------------


## Features

1.  Make a setting with `title`, `find`, `replace`, `restrictFind`, and/or `cursurMove` values and some name (with no spaces) for that setting.  
2.  Save your `settings.json` file. Reload VS Code as prompted.    
3.  Optionally select some code or words in your file.    
4.  Trigger that command from the Command Palette by searching for that name or use that name in a keybinding.  

or  

1.  Make a keybinding with `args` including `find`, `replace`, `restrictFind` and/or `cursorMoveSelect` values.  
3.  Optionally select some code or words in your file.       
2.  Trigger that keybinding.  

or  

1.  Make a setting to use the Search Panel with many options, like `title`, `find`, `replace`, `triggerSearch`, `isRegex`, `filesToInclude` and more (see below).  
2.  Save your `settings.json` file. Reload VS Code as prompted.  
3.  Trigger that command from the Command Palette by searching for that name or use that name in a keybinding.  

or  

1.  Make one or more `findInCurrentFile` command settings.  
2.  Use one or more in an `editor.codeActionsOnSave` setting.  
3.  Save file and those commands will automatically be run in order.  
For more on this `codeActionsOnSave` usage see [running commands on save](codeActions.md).  

<br/>  

> Note: commands can be removed by deleting or commenting out the associated settings and re-saving the `settings.json` file and reloading VS Code. 

------------------

## Details on the `restrictFind` argument.

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

4. `"restrictFind": "document"` the default, make all replacements in the document, select all of them.  
5. `"restrictFind": "once"` make the next replacement on the **same line** only.  
6. `"restrictFind": "line"` make all replacements on the current line. Doesn't matter where the cursor is located.
7.  `"restrictFind": "selections"` make all replacements in the selections only. 

The `cursorMoveSelect` option takes any text as its value.  That text, which can be part of the replacement text or any text, will be searched for after the replacement and the cursor will move there and that text will be selected.

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

### Explanation: With no `find` argument, the current nearest word to the cursor (see more on this below) will be used as the `find` value.  So, in the above example `FIXME` will be used as the find query.  And with `nextMoveCursor` the cursor will move to the next match.  `nextSelect` could be used here as well.  

-------------------

## Sample Usages

In your `settings.json`:  

```jsonc
"findInCurrentFile": {                 // perform a find/replace in the current file, optionally in selections only

	"upcaseSwap2": {                       	// <== the "name" that can be used in a keybinding
		"title": "swap iif <==> hello",  	// title that will appear in the Command Palette
		"find": "(iif) (hello)",
		"replace": "_\\u$2_ _\\U$1_",  		// double-escaped case modifiers
		"restrictFind": "selections"   		// or "document" (the default), "line", or "once"
	},
	"capitalizeIIF": {
		"title": "capitalize 'iif'",     	// all settings must have a "title" field
		"find": "^(iif)",
		"replace": "\\U$1"
	},
	"addClassToElement": {
      "title": "Add Class to Html Element",
      "find": ">",
      "replace": " class=\"@\">",
      "restrictFind": "selections",
      "cursorMoveSelect": "@"                  // after the replacement, move to and select this text
    }
},

// perform a search/replace in the Search Panel, optionally in current file/folder/workspace

"runInSearchPanel": {              // use this as first part of command name in keybindings

	"removeDigits": {                // the second part of the command name in keybindings
		"title": "Remove digits from Art....",
		"find": "^Arturo\\d+",   			// double-escaped
		"replace": "",
		"triggerSearch": "true",
		"isRegex": true
	}
}
```  

**If you do not include a `title` key, one will be created using the name (like `removeDigits` in the last example immediately above. Then you can look for `Find-Transform:removeDigits` in the Command Palette.  Since in the last example a `title` was supplied, you would see `Find-Transform: Remove digits from Art....` in the Command Palette.  All the commands are grouped under the `Find-Transform:` category.**  

<br/>

This extension will generate a command for each of the settings, they will appear as, e.g., "Find-Transform: Uppercase Keywords" in the Command Palette.   


Examples of possible keybindings (in your `keybindings.json`):  

```jsonc
// below: keybindings generated from commands in the settings  

{
	"key": "alt+u",
	"command": "findInCurrentFile.upcaseKeywords"   // from the settings
},                                                	// any "args" here will be ignored, they are in the settings

{
	"key": "alt+s",
	"command": "runInSearchPanel.upcaseSwap"        // from the settings
},                                                	// any "args" here will be ignored, they are in the settings
                                               	
 
// below: a generic "findInCurrentFile" keybinding commands, no need for any settings to run these

{                                         
	"key": "alt+y",
	"command": "findInCurrentFile",       // note no second part of a command name
	"args": {                             // must set the "args" here since no associated settings command
		"find": "^(iif)",                 // all the "args" are optional
		"replace": "\\U$1",
		"restrictFind": "selections",
		"cursorMoveSelect": "IIF"               // this text will be selected; "$" goes to the end of the line
	}
},

// below: a generic "runInSearchPanel" keybinding commands, no need for any settings to run these
{
	"key": "alt+z",
	"command": "runInSearchPanel",       // note: no second part of a command name
	"args": {                            // args not set here will use their last values set in the Search Panel 
		"find": "(?<=Arturo)\\d+",
		"replace": "###",
		"matchWholeWord": false,
		"isRegex": true,
		"filesToInclude": "${file}",
		// "filesToInclude": "<relative or absolute paths supported>",  // but see below**
		"triggerSearch": true
	}
}
```  

`filesToInclude` can take a relative path or absolute path with some caveats. **These work**:

```jsonc
"filesToInclude": "zip\\new.html",                           // note the escaped backward slash  
"filesToInclude": "zip/new.html"                             // forward slash, not escaped  
"filesToInclude": "zip//new.html"                            // forward slash, escaped 
"filesToInclude": "Users/Arturo/Test Bed/zip/new.html"       // absolute path with 'C:/' removed
"filesToInclude": "Users\\Arturo\\Test Bed\\zip\\new.html"
"filesToInclude": "Users\\Arturo\\Test Bed\\zip\\new.html" 
```

**These do not work** (at least on Windows):  

```jsonc
// this first entry works if you directly paste that into the Search Panel 'files to include' field
// but in settings or keybindings the backslash MUST be escaped, see above  
"filesToInclude": "zip\new.html",                               // must escape all backward slashes  

"filesToInclude": "C:\Users\Arturo\Test Bed\zip\new.html"       // absolute paths with scheme, remove the 'C:\`
"filesToInclude": "C:\\Users\\Arturo\\Test Bed\\zip\\new.html"  // remove the 'C:\\`
"filesToInclude": "C:/Users/Arturo/Test Bed/zip/new.html"       // remove the 'C:/`
```

--------------------  

When you **save** a change to the settings, you will get the message notification below.  This extension will detect a change in its settings and create corresponding commands.  The commands will not appear in the Command  Palette **without saving the new setting**.  

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

		// multiline regex ^ and $ are supported, "m" flag is applied to all searches  
		// if finding within a selection(s), '^' refers to the start of a selection, NOT the start of a line
		// if finding within a selection(s), '$' refers to the end of a selection, NOT the end of a line

		"find": "^([ \\t]*const\\s*)(\\w*)",  // double escaping

		// capitalize the word following "const" if at the beginning of the selection
		"replace": "$1\\U$2",

		"restrictFind": "selections"     	// find only in selections
		// "cursorMoveSelect": "<go to and select some text after making the replacement>"
	}
},
```  

<br/>

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/genericRunCommandKeybinding.gif?raw=true" width="650" height="300" alt="demo of generic findInCurrentFile keybinding"/>  

<br/>

In this way you can specify a keybinding to run a generic `findInCurrentFile` command with the find/replace arguments right in the keybinding and nowhere else.  There is no associated setting and you do not need to reload vscode for this version to work.  You can have an unlimited number of keybindings (with separate trigger keys and/or `when` clauses, of course) using the `findInCurrentFile`  version.

The downside to this method is that the various commands are not kept in one place, like your `settings.json` and these `findInCurrentFile` versions cannot be found through the Command Palette.    

<br/>

--------------------  

## More Examples and Demos

<br/>  

>  Important:  &nbsp; What are &nbsp; **`"nearest words at cursors"`**? &nbsp; In VS Code, a cursor immediately next to or in a word is a selection (even though no text may actually be selected!).  This extension takes advantage of that: if you run a `findInCurrentFile` command with no `find` arg it will treat any and all "nearest words at cursors" as if you were asking to find those words.  Actual selections and "nearest words at cursors" can be mixed by using multiple cursors and they will all be searched for in the document.  It appears that a word at a cursor is defined generally as this: `[a-zA-Z0-9_}` although some languages may define it differently.  

> So with the cursor at the start or end of `FIXME` or anywhere within the word, the `FIXME` is the word at the cursor.  `FIXME-Soon` consists of two words.  If the cursor followed the `*` in `FIXME*` then `FIXME` is **not** the word at the cursor.  

This is demonstrated in some of the demos below.  

<br/>  

*  Generic `run` command in `keybindings.json` only, no `find` or `replace` keys in the `args`

```jsonc
{
	"key": "alt+y",
	"command": "findInCurrentFile"
},
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindNoReplaceDemo.gif?raw=true" width="650" height="300" alt="demo of no find and no replace keys in args"/> 

### Explanation: With no `find` key, find matches of selections or nearest words at cursors (multi-cursors work) and select all those matches.  Blue text are selections in the demo gif.     

---------------

<br/>  

* Generic `run` command in `keybindings.json` only, with `find` but no `replace` key  

```jsonc
{
	"key": "alt+y",
	"command": "findInCurrentFile",
	"args": {
		"find": "(create|table|exists)",
		// "replace": "\\U$1",
		// "restrictFind": "document"    // the default, else "selections"
		// "restrictFind": "selections"
	}
}
```   

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findNoReplaceDemo.gif?raw=true" width="650" height="300" alt="demo of find and no replace keys in args"/> 

### Explanation: Will find according to the `find` key and select all those matches.  No replacement.  

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
	}
}
```  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findReplaceDemo.gif?raw=true" width="650" height="300" alt="demo of find and replace keys in args"/>  

### Explanation: Find using its value in `args` and replace each with its value in the `args` field.  Since there is no `restrictFind` key, the default `document` will be used.   

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
	}
}
```  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindReplaceDemo.gif?raw=true" width="650" height="300" alt="demo of replace but no find keys in args"/>  

### Explanation: With no `find` key find all the words at the cursors or selections and apply the replacement.  

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
		"restrictFind": "selections",
		"cursorMoveSelect": "TABLE"      // will select 'TABLE' only if it is within a selection 
	}
}
``` 

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findReplaceSelectionDemo1.gif?raw=true" width="650" height="300" alt="demo of using restrictFind 'selection' and 'cursorMoveSelect"/>  

### Explanation: Using `restrictFind` arg set to `selections`, find will only occur within any selections.  Selections can be multiple and selections do include "nearest words at cursors". Using `cursorMoveSelect` to select all instances of `TABLE`.  

<br/>

> Note a subtle difference in the above demo.  If you make an actual full selection of a word or words, only text within that selection will be searched.  But if you make a "nearest word"-type selection (a cursor in or next to a word) then all matching words in the document will be searched for, even if they are not in a selection of their own.  If you want to restrict the search to a selection, make an actual selection - do not rely on the nearest word functionality.  

<br/>  

### If `restrictFind` is not set to anything, it defaults to `document`.  So the entire document will be searched and any selections will be ignored, since a `find` has been set.  Remember if no `find` is set, then any selections will be interpreted as the `find` values.  

<br/>  

The above keybinding is no different than this setting (in your `settings.json`):  

```jsonc
"findInCurrentFile": {
	"upcaseSelectedKeywords": {
		"title": "Uppercase selected Keywords",  // a "title" is required
		"find": "(create|table|exists)",
		"replace": "_\\U$1_",
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
    "restrictFind": "once",          // see above for other options
    "cursorMoveSelect": "@"          // select the next'@'
  }
}
```

```jsonc
  {                                 // a keybinding for the above setting
    "key": "alt+q",                 // whatever you want

	      // should get intellisense for available settings commands after typing `findInCurrentFile.`  
    "command": "findInCurrentFile.addClassToElement"

	// "when": ""                   // can be used here
	// "args": {}                   // will be ignored, the args in the setting rule  
  },
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/cursorMoveOnce.gif?raw=true" width="650" height="300" alt="demo of using cursorMoveSelect arg with restrictFind of 'once'"/>

### Explanation: Find the first `>` within selection(s) and replace them with ` class=\"@\">`.  Then move the cursor(s) to `@` and select it.  `cursorMoveSelect` value can be any text, even the regex delimiters `^` and `$` which mean line or selection start and end.    

<br/>

* `"restrictFind": "once"` => find the first instance of the `find` query AFTER the cursor, replace it and then go to and select the `cursorMoveSelect` value if any.  Works the same for multiple cursors.  

* `"restrictFind": "line"` => find all instances of the `find` query on the line with the cursor, replace them and then go to and select all `cursorMoveSelect` values if any.  Works on eaach line if multiple cursors.  

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
		"restrictFind": "selections"
	}
}
```
&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findNoReplaceSelectionDemo.gif?raw=true" width="650" height="300" alt="demo of using restrictFind arg to 'selection'" with no replace/>  

### Explanation: Using `restrictFind` arg set to `selections`, find will only occur within any selections.  All find matches within selections will be selected.  

<br/>  

If you have set `"restrictFind": "document"` any actual selections in the file will be ignored and the find/replace will be applied to the entire file.    

----------------------  
---------------------- 

<br/>

## Using the Search Panel for searches with the `runInSearchPanel` command   

<br/>

```jsonc
"runInSearchPanel": {

	"removeDigits": {
		"title": "Remove digits from Arturo",
		"find": "^(\\s*Arturo)\\d+",  // using the '^' to indicate start of a line
		"replace": "$1",              // all the args options will be shown by intellisense
		"isRegex": true,
		"triggerSearch": true,
		"filesToInclude": "${file}"   // some variables are supported, see below
	}
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/searchIntellisense.gif?raw=true" width="750" height="400" alt="demo of search panel setting with intellisense"/>

### Explanation: The `runInSearchPanel` command will do a search using the Search Panel.  This allows you to search the current file, folder or the entire workspace, for example.  

<br/>

The `runInSearchPanel` settings commands can be used in keybindings just like the `findInCurrentFile` commands discussed above.  The above `removeDigits` command could be used in a keybinding like this:  

```jsonc
{
	"key": "alt+z",
	"command": "runInSearchPanel.removeDigits"
}
```
Just like with `findInCurrentFile` keybindings if you add arguments to a command that already exists in a setting, the keybinding arguments will be ignored.  

```jsonc
{
	"key": "alt+z",
	"command": "runInSearchPanel.removeDigits",  // assume this exists in settings
	"args": {                     // then all args are ignored, the settings args are applied instead
		"find": "(?<=Arturo)\\d+",
		"replace": "###"
	}
}
```

You can also create commands solely in a keybinding like:

```jsonc
{
	"key": "alt+z",
	"command": "runInSearchPanel",
	"args": {
		"find": "(?<=^Arturo)\\d+",   // fixed-width lookbehinds and multiline supported
		"replace": "###",
		"matchWholeWord": false,
		"isRegex": true,
		"filesToInclude": "${file}",  // resolves to current file
		"triggerSearch": true
	}
}
```
&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/searchGeneric1.gif?raw=true" width="750" height="400" alt="demo of search panel setting with intellisense"/>

### Explanation: Creating a Search Panel command in the keybindings only.  In this case, search for `^Arturo` preceding some digits and replace in the current file.  

<br/>

> Note: Regex lookbehinds that are **not fixed-length** (also called fixed-width sometimes), like `(?<=^Art[\w]*)` are not supported in the Search Panel.  But non-fixed-length lookbehinds are supported in vscode's Find in a file (as in using the Find widget) so they can be used in `findInCurrentFile` settings or keybindings.  

This works:    


```jsonc
{
	"key": "alt+y",
	"command": "findInCurrentFile",         // findInCurrentFile
	"args": {
		"find": "(?<=^Art[\\w]*)\\d+",      // not fixed-length, but okay in findInCurrentFile
		"replace": "###"
	}
}
```

but the same keybinding in `runInSearchPanel` will error and not run:  

```jsonc
{
	"key": "alt+y",
	"command": "runInSearchPanel",            // runInSearchPanel
	"args": {
		"find": "(?<=^Art[\\w]*)\\d+",        // not fixed-length: ERROR will not run
		"replace": "###"
	}
}
```

-------------  

**What if you have no `find` entry in a keybinding or setting?** 

```jsonc
{
	"key": "alt+z",
	"command": "runInSearchPanel",
	"args": {
		//"find": "<someText>",  // assume no "find" entry
		"replace": "###",        // optional
		"triggerSearch": true    // optional
	}
}
```

If there is no `"find"` entry for a `runInSearchPanel` command, this extension will respect the user's `Search: Seed WIth Nearest Word` setting.  VS Code then handles how to determinae the nearest word.  It will either use the first selection in the current file or , if there in only a single cursor, the current word at the cursor as the search query.  If there are multiple cursors, it will choose the first selection, otherwise it will choose nothing.    

This behavior is different from `findInCurrentFile` which will use **ALL** selections and nearest words at cursors as the `find` values.  In `runInSearchPanel` commands, only the **FIRST** selection/current word for the search query.  

In the demo below, text with a ***blue background*** is selected:  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindSearch.gif?raw=true" width="750" height="600" alt="demo of search panel setting with intellisense"/>  

<br/>

-----------------------

### -- `runInSearchPanel` arguments and types:  

<br/>

```jsonc
"title": "<some string>",        // can have spaces, will be shown in the Command Palette: "Find-Transform:My Title"

"find": "<some string>",         // if no find key or empty value, will use the selected text (as vscode does natively)

"replace": "<some string>",

"triggerSearch": <boolean>,      // boolean, same as the "Replace All" button, confirmation box will still open

"isRegex": <boolean>,

"filesToInclude": "",            // default is "" = current workspace

"preserveCase": <boolean>,

"useExcludeSettingsAndIgnoreFiles": <boolean>,

"isCaseSensitive": <boolean>,

"matchWholeWord": <boolean>,

"filesToExclude": "<some string>"
```

You will get intellisense presenting these arguments.   And the completions will be filtered to remove any options arlready used in that setting or keybinding.  

<br/>

> As noted above, if you have a `runInSearchPanel` command with no `find` key at all, then the selected text will be used as the query term.  Likewise, if you have a `find` key but with a value of the empty string `""`, the selected text or nearest word will be used.    

> Note: The Search Panel remembers your option selections, like `matchWholeWord` `true/false` for example.  Thus, that option value will persist from call to call of the Search Panel.  If you want to change a value in a setting or keybinding then realize that value will remain as set the next time `runInSearchPanel` is run.  That is how vscode operates.  You can either set a value in the keybinding or setting or manually change it once the Search Panel pops up.

--------  

However, specifically for the `"filesToInclude"` setting an empty string (`"filesToInclude": "",`) will **clear** the old value for the `filesToInclude` input box in the Search Panel.  So, if you frequently switch between using the Search Panel to search across multiple files and searching within the current file only you might want to set up the following keybindings:   

```jsonc
{
  "key": "alt+shift+f",           // whatever keybinding you wish
  "command": "runInSearchPanel",
  "args": {
    "filesToInclude": "${file}",  // open Search Panel with current file as the `files to include`
  }
},
{
  "key": "ctrl+shift+f",       // the default 'Search: Find in Files' command
  "command": "runInSearchPanel",
  "args": {
    "filesToInclude": "",     // clear the `files to include` input box
  }
}
```

With those keybindings, the default <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> would open up the Search Panel with the `filesToInclude` input box empty - thus using the default of all workspace files.  <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> would open a Search Panel with the current filename in the `filesToInclude` input.  

------------  
<br/>

The `filesToInclude` argument supports these variables as values:  

* "${file}"  
* "${relativeFile}"  
* "${fileDirname}"  
* "${fileWorkspaceFolder}"  
* "${workspaceFolder}"  
* "${relativeFileDirname}"  
* "${workspaceFolderBasename}"  
* "${selectedText}"  
* "${pathSeparator}"  
* "${CLIPBOARD}"   

<br/>

The `find` argument (only in the `runInSearchPanel` setting or keybinding) supports this variable as values:  

* "${CLIPBOARD}"  

They should have the same resolved values as found at [vscode's pre-defined variables documentation](https://code.visualstudio.com/docs/editor/variables-reference#_predefined-variables).   

-----------------------  

<br/>

## TODO

* Add more error messages, like if a capture group used in replace but none in the find.
* Add notifications for mispellings in the options.  .    
* Internally modify `replace` key name to avoid `string.replace` workarounds.  
* Explore adding a command `setCategory` setting.  Separate category for Search Panel commands?    
* Explore adding settings to change default values for `filesToInclude` usage or other keys.
* Explore support for some snippet variables, like `Clipboard`, `Line Number`, etc.    
* Explore more string operations (e.g., `substring()`, `trim()`, `++`) in the replace settings/args?    
* Explore replacing with current match index?
* Explore supporting conditionals, like snippets: `${2:+yada}`  
* Explore supporting `cursorMoveSelect` argument in searches across files.     


## Release Notes

* 0.1.0	Initial release.
* 0.2.0	Replace with case modifiers now work better.
* 0.3.0	Added a generic `find-and-transform.run` command for use in keybindings with `args`.  (later refactored away)  
  &emsp;&emsp; Work on capture groups without case modifiers.  
* 0.4.0	Added intellisense for settings and keybindings.  
  &emsp;&emsp; Added `restrictFind` argument.  
	&emsp;&emsp; If no find or replace, will select all matches of nearest words at cursor or selection.  
	&emsp;&emsp; Added many README examples and explanations.   
* 0.5.0	Added option to use Search Panel with confirmation and all supported options.  
	&emsp;&emsp; Added intellisense for `runInSearchPanel` args with filtering.  
	&emsp;&emsp; Use the current selection if no `find` entry or it is set to the empty string.    
* 0.5.5	Refactored to use matchRange for edits in whole document rather than entire text.   
  &emsp;&emsp; Added supported for empty selections to `runInSearchPanel` query creation.  
* 0.6.0	Added support for `CodeActions` so commands from settings can be run on save.   
  &emsp;&emsp; Added `${CLIPBOARD}` support to `runInSearchPanel` `find` value.  
* 0.7.0	Added support for `cursorMoveSelect` argument for `findInCurrentFile` settings and keybindings.  
  &emsp;&emsp; Renamed `cursorMove` option to `cursorMoveSelect` = a **BREAKING CHANGE**.  
  &emsp;&emsp; Added `once` and `line` support to `restrictFind` options.  
* 0.8.0	Added `nextSelectFind`, `nextMoveCursorFind`, and `nextDontMoveCursorFind` support to `restrictFind` options.  
* 0.8.5	Enable clearing `files to include` in Search Panel.  Use `Search: Seed With Nearest Word`.  
     

-----------------------------------------------------------------------------------------------------------  

<br/>  
<br/> 