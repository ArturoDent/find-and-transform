## Using the `runInSearchPanel` command  

At the end of this file, see how to use the **context menus** to run a search (using the Search Panel, so you get linked results).  

--------------------  

### An example setting (in your settings.json):  

```jsonc
"runInSearchPanel": {

	"removeDigits": {
		"title": "Remove digits from Arturo",
		"find": "^(\\s*Arturo)\\d+",   // using the '^' to indicate start of a line
		"replace": "$1",               // all the args options will be shown by intellisense
		"isRegex": true,
		"triggerSearch": true,
		"triggerReplaceAll": true,     // explained below
		"filesToInclude": "${file}"    // some variables are supported, see below
	}
}
``` 

**If you do not include a `title` key, one will be created using the name (like `removeDigits` in the last example immediately above. Then you can look for `Find-Transform:removeDigits` in the Command Palette.  Since in the last example a `title` was supplied, you would see `Find-Transform: Remove digits from Art....` in the Command Palette.  All the commands are grouped under the `Find-Transform:` category.**  

<br/>

This extension will generate a command for each of the settings, they will appear as, e.g., "`Find-Transform: <your title here>`" in the Command Palette.

### Example keybindings:

```jsonc
{
	"key": "alt+s",
	"command": "runInSearchPanel.removeDigits"        // from the settings
}                                                	// any "args" here will be ignored, they are in the settings
```

```jsonc
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

* `filesToInclude` can take multiple, comma-separated, file or folder entries.  For example:  

```jsonc
"filesToInclude": "zip/new.html, ${file}, ${fileDirname}" // or any combination and order
        // you should get intellisense for completion of the variables upon typing the `$`
"filesToInclude": "zip${pathSeparator}new.html"
```  
<br/>

* `filesToInclude` can take a relative path or absolute path with some caveats. **These work**:

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
<br/>
--------------------  

When you **save** a change to the settings, you will get the message notification below.  This extension will detect a change in its settings and create corresponding commands.  The commands will not appear in the Command  Palette **without saving the new setting**.  

<br/>

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/reloadMessage.jpg?raw=true" width="525" height="150" alt="notification to save after changing settings"/>

<br/>  

----------------------------- 


&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/searchIntellisense.gif?raw=true" width="750" height="400" alt="demo of search panel setting with intellisense"/>

### Explanation: The `runInSearchPanel` command will do a search using the Search Panel.  This allows you to search the current file, folder or the entire workspace, for example. 

<br/>

> Note that the `Replace All` confirmation box pops up in the demo above.  That is because `triggerReplaceAll` is set to `true`.  

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
		"triggerSearch": true,
		"triggerReplaceAll": true     // if using this, must have triggerSearch: true
	}
}
```

This is the same as creating a command in the settings like so (and then triggering it from the Command Palette or using the keybinding which follows):  

```jsonc
"runInSearchPanel": {                        // in settings.json
  "removeArturosDigits":  {
      "title": "Remove Arturo's Digits",
      "find": "(?<=^Arturo)\\d+",
      "replace": "###",
      "matchWholeWord": false,
      "isRegex": true,
      "filesToInclude": "${file}",
      "triggerSearch": true,
      "triggerReplaceAll": true        // if using this, must have triggerSearch: true
  }
},
```

```jsonc
{
  "key": "alt+e",                          // whatever keybinding you like
  "command": "runInSearchPanel.removeArturosDigits"
}
```


&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/searchGeneric1.gif?raw=true" width="750" height="400" alt="demo of search panel setting with intellisense"/>

### Explanation: Creating a Search Panel command in the keybindings only.  In this case, search for `^Arturo` preceding some digits and replace in the current file. 

<br/>

> `triggerSearch` is a built-in vscode search across files option.  It triggers the search, and thus shows the results, but does not trigger a replace or replace all.  I would think in most cases you would want `"triggerSearch": true` to see your results right away.  But if you know you will be modifying the search in some way, you may not want to `triggerSearch`.  

> `triggerReplaceAll` is an option added solely by this extension.  Its action is the same as clicking the `Replace All` icon in the results.  VS Code will always pop up a confirmation dialog before actually performing the replacement, so you will still have to confirm the replacement.  `triggerReplaceAll` must have results shown in order to work, that is why if you want `triggerReplaceAll` then you must also have `triggerSearch` set to `true`.  

<br/>

------------  

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

but the same keybinding in `runInSearchPanel` **will error and not run**:  

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

If there is no `"find"` entry for a `runInSearchPanel` command, this extension will respect the user's `Search: Seed With Nearest Word` setting.  VS Code then handles how to determine the nearest word.  

If `Search: Seed With Nearest Word` is **disabled**, VS Code will use "the first fully selected word" in the current file only.  If there are multiple selections, it will still choose the first selection made (which may be later in the document than another selection). VS Code will not choose any nearest words to empty selections.  

If `Search: Seed With Nearest Word` is **enabled**, VS Code will choose either the first fully selected word or the first "nearest word" (to an empty selection) if there are multiple "selections".  It will even choose an nearest word empty selection if it was made before a fully selected word.  

This behavior is different from `findInCurrentFile` which will use **ALL** selections and nearest words at cursors as the `find` values.  In `runInSearchPanel` commands, only the **FIRST** selection/current word for the search query.  

In the demo below, text with a ***blue background*** is selected:  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindSearch.gif?raw=true" width="750" height="600" alt="demo of search panel setting with intellisense"/>  

<br/>

> Note: With no `find` entry and searching in other files, the current selection will be used to search in those other files!  This can be a fast way to search for a current word in other files and also works for the context menu searches (see below).  

-----------------------

### -- `runInSearchPanel` arguments and types:  

<br/>

```jsonc
"title": "<some string>",        // can have spaces, will be shown in the Command Palette: "Find-Transform:My Title"

"find": "<some string>",         // if no find key or empty value, will use the selected text (as vscode does natively)

"replace": "<some string>",

"triggerSearch": <boolean>,      // boolean, searches and shows the results

"triggerReplaceAll": <boolean>,  // boolean, same as the "Replace All" button, confirmation box will still open

"isRegex": <boolean>,

"filesToInclude": "",            // default is "" = current workspace
// using the empty string `""` as the value for `filesToInclude` will clear any prior value for 
// the `files to include` input box in the Search Panel and result in the default

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

<br/>

---------------------  

<br/>

## Context Menu Commands  

<br/>

* `Search in this File` quickly performs a search, using the Search Panel, of either the current file when using the editor context menu, or the designated file when using the context menu of an editor **tab**. &emsp;  Demo:  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/contextMenus1.gif?raw=true" width="650" height="300" alt="demo of using 'Search in this File' context menus"/>

### Explanation: The old 'files to include' entry will be replaced by either the current file or the file of the editor tab.  The `find` query will be the selected word of the active text editor - which can be different than the editor tab's context menu.  