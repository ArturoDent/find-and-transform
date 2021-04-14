# find-and-transform

Find and transform text in a single file.  

1.   &emsp; Any number of find/replace combinations can be saved in settings and triggered either by the Command Palette or a keybinding.
2.   &emsp; Replacements can include case modifiers, like `\U`.  
3.   &emsp; Find in the entire document or within selections only.     
4.   &emsp; Keybindings can be quite generic, not necessarily including `find` or `replace` keys.  
5.   &emsp; A command can be created right in a keybinding, without using a setting at all.  
6.   &emsp; Can also use pre-defined searches using the Search Panel.  
7.   &emsp; Supports using various path variables in the Search Panel.    

 The replace transforms can include ***case modifiers*** like:  

&emsp; &emsp;   `\U`  &emsp; uppercase the entire following capture group as in `\\U$1`  
&emsp; &emsp;   `\u`  &emsp; capitalize the first letter only of the following capture group: `\\u$2`     
&emsp; &emsp;   `\L`  &emsp; lowercase the entire following capture group:  `\\L$2`  
&emsp; &emsp;   `\l`  &emsp; lowercase the first letter only of the following capture group: `\\l$3`     

<br/>

This extension provides a way to save and re-use find/replace regex's and use case modifiers in the replacements.  You can use case modifiers in VS Code's find or search views but it is not possible to save frequently-used find/replacements.   

<br/>

> Note, the above case modifiers must be double-escaped in the settings or keybindings.  So `\U$1` should be `\\U$1` in the settings.  VS Code will show an error if you do not double-escape the modifiers (similar to other escaped regex items like `\\w`).  

<br/>

-------------


## Features

1.  Make a setting with `title`, `find`, `replace` and `restrictFind` values and some name (with no spaces) for that setting.  
2.  Save your `settings.json` file. Reload VS Code as prompted.    
3.  Optionally select some code or words in your file.    
4.  Trigger that command from the Command Palette by searching for that name or use that name in a keybinding.  

or  

1.  Make a keybinding with `args` including `find`, `replace` and `restrictFind` values.  
3.  Optionally select some code or words in your file.       
2.  Trigger that keybinding.  

or  

1.  Make a setting to use the Search Panel with many options, like `title`, `find`, `replace`, `triggerSearch`, `isRegex`, `filesToInclude` and more (see below).  
2.  Save your `settings.json` file. Reload VS Code as prompted.  
3.  Trigger that command from the Command Palette by searching for that name or use that name in a keybinding.  

<br/>  

> Note: commands can be removed by deleting or commenting out the associated settings and re-saving the `settings.json` file and reloading VS Code.  

-------------------

## Sample Usage

In your `settings.json`:  

```jsonc
"findInCurrentFile": {                 // perform a find/replace in the current file, optionally in selections only

	"upcaseSwap2": {                       	// <== "name" that can be used in a keybinding
		"title": "swap iif <==> hello",  	// title that will appear in the Command Palette
		"find": "(iif) (hello)",
		"replace": "_\\u$2_ _\\U$1_",  		// double-escaped case modifiers
		"restrictFind": "selections"   		// or "document", the default
	},
	"capitalizeIIF": {
		"title": "capitalize 'iif'",     	// all settings must have a "title" field
		"find": "^(iif)",
		"replace": "\\U$1"
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

This extension will generate a command for each of the settings, they will appear as, e.g., "Uppercase Keywords" in the Command Palette.   


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
                                               	
 
// below: generic "findInCurrentFile" commands not found in the settings  

{
	"key": "alt+y",
	"command": "findInCurrentFile",       // note no second part of a command name
	"args": {                             // must set the "args" here since no associated settings command
		"find": "^(iif)",                 
		"replace": "\\U$1",
		"restrictFind": "selections"
	}
},

// below: generic "runInSearchPanel" commands not found in the settings  
{
	"key": "alt+z",
	"command": "runInSearchPanel",       // note no second part of a command name
	"args": {                            // args not set here will use their last values set in the Search Panel 
		"find": "(?<=Arturo)\\d+",
		"replace": "###",
		"matchWholeWord": false,
		"isRegex": true,
		"filesToInclude": "${file}",
		"triggerSearch": true
	}
}

```  

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
		"find": "^([ \\t]*const\\s*)(\\w*)",  // double escaping

		    // capitalize the word following "const" if at the beginning of a line
		"replace": "$1\\U$2",

		"restrictFind": "selections"     	// find only in selections
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

>  Important:  &nbsp; What are &nbsp; **`"words at cursors"`**? &nbsp; In VS Code, a cursor next to or in a word is a selection (even though no text may actually be selected!).  This extension takes advantage of that: if you run a command with no `find` arg it will treat any and all "words at cursors" as if you were asking to find those words.  Actual selections and "words at cursors" can be mixed by using multiple cursors and they will all be searched for in the document.  This is demonstrated in some of the demos below.  

<br/>  

*  Generic `run` command in `keybindings.json` only, no `find` or `replace` keys in the `args`

```jsonc
{
	"key": "alt+y",
	"command": "findInCurrentFile"
},
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindNoReplaceDemo.gif?raw=true" width="650" height="300" alt="demo of no find and no replace keys in args"/> 

### Explanation: With no `find` key, find matches of selections or words at cursors (multi-cursors work) and select all those matches.  Blue text are the selections.   

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

### Explanation: Find using its value in `args` and replace each with its value in the `args` field.  Sincer there is no `restrictFind` key, the default `document` will be used.   

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

### Explanation: With no `find` key will find the words at the cursors or selections and apply the replacement.  

---------------

<br/>  

* `find` and `replace` with `"restrictFind": "selections"`   

```jsonc
{
	"key": "alt+y",
	"command": "findInCurrentFile",
	"args": {
		"find": "(create|table|exists)",
		"replace": "_\\U$1_",
		"restrictFind": "selections"
	}
}
```  
&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findReplaceSelectionDemo.gif?raw=true" width="650" height="300" alt="demo of using restrictFind arg to 'selection'"/>  

### Explanation: Using `restrictFind` arg set to `selections`, find will only occur within any selections.  Selections can be multiple and selections include "words at cursors".  

<br/>  

The above keybinding is no different than this setting (in your `settings.json`):  

```jsonc
"findInCurrentFile": {

	"upcaseSelectedKeywords": {
		"title": "Uppercase selected Keywords",  // a "title" is required
		"find": "(create|table|exists)",
		"replace": "_\\U$1_",
		"restrictFind": "selections"
	}
}
```
except that a **reload of vscode is required** prior to using the generated command from this setting (no reload necessary for the keybinding) and the `title`, in this case `"Uppercase selected Keywords"` will appear and be searchable in the Command Palette (not true for keybinding "commands").  

<br/>

--------------------

<br/>  

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

If you have set `"restrictFind": "document"` any actual selections in the file will be ignored and the find/replace will be applied to the entire file.  Likewise, if you have `"restrictFind"` key at all, any selections will be ignored (because the default for ``"restrictFind"` is `document`).  

----------------------  
---------------------- 

<br/>

## Using the Search Panel for searches with `runInSearchPanel` commands   

<br/>

```jsonc
"runInSearchPanel": {

	"removeDigits": {
		"title": "Remove digits from Arturo",
		"find": "^(\\s*Arturo)\\d+",
		"replace": "$1",              // all the args options will be shown by intellisense
		"isRegex": true,
		"triggerSearch": true,
		"filesToInclude": "${file}"   // some variables are supported
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
	"args": {                     // then all args are ignored, the settings options are applied instead
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

> Note: Regex lookbehinds that are **not fixed-length** (also called fixed-width sometimes), like `(?<=^Art[\w]*)` are not supported in the Search Panel.  But non-fixed-length lookbehinds are supported in vscode's Find in a file (as in using the Find widget) so they can be used in `findInCurrentFile` settings or keybindings.  This works:  


```jsonc
{
	"key": "alt+y",
	"command": "findInCurrentFile",        // findInCurrentFile here
	"args": {
		"find": "(?<=^Art[\\w]*)\\d+",    // not fixed-length
		"replace": "###"
	}
}
```

but the same keybinding in `runInSearchPanel` will error and not run:  

```jsonc
{
	"key": "alt+y",
	"command": "runInSearchPanel",        // runInSearchPanel here
	"args": {
		"find": "(?<=^Art[\\w]*)\\d+",    // not fixed-length: ERROR will not run
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

If there is no `"find"` entry, this extension will either use the first selection in the current file or the current word at the cursor as the search query.  In the demo below, text with a ***blue background*** is selected:  

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

> As noted above, if you have a `runInSearchPanel` command with no `find` key at all, then the selected text will be used as the query term.  Likewise, if you have a `find` key but with a value of the empty string `""`, the selected text will be used.    

> Note: The Search Panel remembers your option selections, like `matchWholeWord` `true/false` for example.  Thus, that option value will persist from call to call of the Search Panel.  If you want to change a value in a setting or keybinding then realize that value will remain as set the next time `runInSearchPanel` is run.  That is how vscode operates.  You can either set a value in the keybinding or setting or manually change it once the Search Panel pops up.   

<br/>

The `filesToInclude` argument supports these variables as values:  

	"${file}"  
	"${relativeFile}"  
	"${fileDirname}"  
	"${fileWorkspaceFolder}"  
	"${workspaceFolder}"  
	"${relativeFileDirname}"  
	"${workspaceFolderBasename}"  
	"${selectedText}"  
	"${pathSeparator}"  

They should have the same resolved values as found at [vscode's pre-defined variables documentation](https://code.visualstudio.com/docs/editor/variables-reference#_predefined-variables).   

-----------------------  

<br/>

## Todo

* Add more error messages, like if a capture group used in replace but none in the find.    
* Internally modify `replace` key name to avoid `string.replace` workarounds.  
* Explore adding a command `setCategory` setting.   
* Explore adding settings to change default values for `filesToInclude` usage or other keys.
* Explore support for some snippet variables, like `Clipboard`, `Line Number`, etc.    
* Explore more string operations (e.g., `substring()`, `trim()`, `++`) in the replace settings/args?    
* Explore replacing with current match index?
* Explore supporting conditionals, like snippets: `${2:+yada}`   


## Release Notes

* 0.1.0	Initial release.
* 0.2.0	Replace with case modifiers work better.
* 0.3.0	Added a generic `find-and-transform.run` command for use in keybindings with `args`.  (later refactored away)  
  &emsp;&emsp; Work on capture groups without case modifiers.  
* 0.4.0	Added intellisense for settings and keybindings.  
  &emsp;&emsp; Added `restrictFind` argument.  
	&emsp;&emsp; If no find or replace, will select all matches of word at cursor or selection.  
	&emsp;&emsp; Added many README examples and explanations.   
* 0.5.0	Added option to use Search Panel with confirmation and all supported options.  
	&emsp;&emsp; Added intellisense for `runInSearchPanel` args with filtering.  
	&emsp;&emsp; Use the current selection if no `find` entry or it is set to the empty string.    
* 0.5.5	Refactored to use matchRange for edits in whole document rather than entire text.   
  &emsp;&emsp; Added supported for empty selections to `runInSearchPanel` query creation.  

-----------------------------------------------------------------------------------------------------------  

<br/>  
<br/> 

For an example usin
<br/><br/>