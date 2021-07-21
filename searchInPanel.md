## Using the `runInSearchPanel` command  

At the end of this file, see how to use the **context menus** to run a search.  

--------------------  

### An example setting (in your settings.json):  

```jsonc
"runInSearchPanel": {

  "removeDigits": {
    "title": "Remove digits from Arturo",
    "find": "^(\\s*Arturo)\\d+",         // using the '^' to indicate start of a line
    "replace": "$1",                     // all the args options will be shown by intellisense
    "isRegex": true,
    "triggerSearch": true,
    "triggerReplaceAll": true,           // explained below
    "filesToInclude": "${relativeFile}"  // or ${file} for the full path, some variables are supported, see below
  }
}
``` 

> If you do not include a `title` key, one will be created using the name (like `removeDigits` in the last example immediately above. Then you can look for `Find-Transform:removeDigits` in the Command Palette.  Since in the last example a `title` was supplied, you would see `Find-Transform: Remove digits from Art....` in the Command Palette.  All the commands are grouped under the `Find-Transform:` category.  

<br/>

This extension will generate a command for each of the settings, they will appear as, e.g., "`Find-Transform: <your title here>`" in the Command Palette.

----------------------  


## `runInSearchPanel` arguments and types:  

```jsonc
"title": "<some string>",        // can have spaces, will be shown in the Command Palette: "Find-Transform:My Title"

"find": "<string or regexp>",    // if no find key or empty value, will use the selected text (as vscode does natively)

"replace": "<string>",

"triggerSearch": <boolean>,      // searches and shows the results

"triggerReplaceAll": <boolean>,  // same as the "Replace All" button, confirmation box will still open

"isRegex": <boolean>,

"filesToInclude": "<paths or variables>",     // default is "" = current workspace
// "filesToInclude": "",             // using the empty string `""` as the value for `filesToInclude` 
                                     // will clear any prior value from the "files to include" input

"filesToExclude": "<paths or variables>",
// "filesToExclude": "",            // using the empty string `""` as the value for `filesToExclude`
                                    // will clear any prior value from the "files to exclude" input

"preserveCase": <boolean>,

"useExcludeSettingsAndIgnoreFiles": <boolean>,

"isCaseSensitive": <boolean>,

"matchWholeWord": <boolean>,

"onlyOpenEditors": <boolean>        // available in Insiders v1.59 now and Stable v1.59 early August, 2021
```

You will get intellisense presenting these arguments.   And the completions will be filtered to remove any options arlready used in that setting or keybinding.  

<br/>

> As noted above, if you have a `runInSearchPanel` command with no `find` key at all, then the selected text will be used as the query term.  Likewise, if you have a `find` key but with a value of the empty string `""`, the selected text or nearest word will be used.    

> Note: The Search Panel remembers your option selections, like `matchWholeWord` `true/false` for example.  Thus, that option value will persist from call to call of the Search Panel.  If you want to change a value in a setting or keybinding then realize that value will remain as set the next time `runInSearchPanel` is run.  That is how vscode operates.  You can either set a value in the keybinding or setting or manually change it once the Search Panel pops up.

<br/>

### `"onlyOpenEditors"`  

<br/>

> `"onlyOpenEditors"` support will be in vscode Stable v1.59.  Having this option enabled is just like clicking the little book icon in the Search Panel ("Search Only in Open Editors").  This option too will be remembered by vscode so you may want to get into the habit of always using this argument option and intentionally setting to it to `true` or `false`.

If you use **both** `"onlyOpenEditors"` and `"filesToInclude"` arguments, the `"filesToInclude"` value will limit the scope of `"onlyOpenEditors"` to that include value.  So if you had a file to include value of same file not currently open, **no** files would be searched  even with the `"onlyOpenEditors"` set to true.  Only those files both open and included in the `"filesToInclude"` value will be searched.  

```jsonc
{
  "key": "alt+shift+f",
  "command": "runInSearchPanel",
  "args": {
    "triggerSearch": true,         // no find, get word at first cursor
    "onlyOpenEditors": true
  }
}
```
&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/onyOpenEditors1.gif?raw=true" width="675" height="650" alt="search in open editors only"/>

Explanation: no `find` value, use the word at the **first** cursor to do a search in open editors only.  


-------- 

<br/>


### <u>Clear the `"filesToInclude/filesToExclude"` values</u>  

<br/>

Specifically for the `"filesToInclude/filesToExclude"` settings an empty string (`"filesToInclude": ""`) will **clear** the old value for the `filesToInclude/filesToExclude` input boxes in the Search Panel.  So, if you frequently switch between using the Search Panel to search across multiple files and searching within the current file only you might want to set up the following keybindings:   

```jsonc
{
  "key": "alt+shift+f",                   // whatever keybinding you wish
  "command": "runInSearchPanel",
  "args": {
    "filesToInclude": "${relativeFile}"   // open Search Panel with current file as the `files to include`
  }
},
{
  "key": "ctrl+shift+f",                  // the default 'Search: Find in Files' command
  "command": "runInSearchPanel",
  "args": {
    // "find"                             // with no find, use word at cursor 
    "filesToInclude": ""                  // clear the `files to include` input box
  }
}
```

With those keybindings, the default <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> would open up the Search Panel with the `filesToInclude` input box empty - thus using the default of all workspace files.  <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> would open a Search Panel with the current filename in the `filesToInclude` input. 

---------------


## Example keybindings:

```jsonc
{
  "key": "alt+s",
  "command": "runInSearchPanel.removeDigits"      // from the settings
}                                                 // any "args" here will be ignored, they are in the settings
```

```jsonc
// below: a generic "runInSearchPanel" keybinding command, no need for any settings to run these
{
  "key": "alt+z",
  "command": "runInSearchPanel",       // note: no second part of a command name
  "args": {                            // args not set here will use their last values set in the Search Panel 
    "find": "(?<=Arturo)\\d+",
    "replace": "###",
    "matchWholeWord": false,
    "isRegex": true,
    "filesToInclude": "${relativeFile}",
    // "filesToInclude": "<relative or absolute paths supported>",  // but see below
    "triggerSearch": true
  }
}
```

* `filesToInclude` and `filesToExclude` can take multiple, comma-separated, file or folder entries.  For example:  

```jsonc
"filesToInclude": "zip/new.html, ${relativeFile}, ${relativeFileDirname}" // or any combination and order
        // you should get intellisense for completion of the variables upon typing the `$`
"filesToInclude": "zipFolder${pathSeparator}new.html"
```  
<br/>

* `filesToInclude` or `filesdToExclude` can take a relative path or absolute path with some caveats. **These work**:

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

Explanation: The `runInSearchPanel` command will do a search using the Search Panel.  This allows you to search the current file, folder or the entire workspace, for example. 

<br/>

> Note that the `Replace All` confirmation box pops up in the demo above.  That is because `triggerReplaceAll` is set to `true`.  

<br/>

The `runInSearchPanel` settings commands can be used in keybindings just like the `findInCurrentFile` commands discussed elsewhere.  The above `removeDigits` command could be used in a keybinding like this:  

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
  "command": "runInSearchPanel.removeDigits",     // assume this exists in settings
  
  "args": {                          // then all args are ignored, the settings args are applied instead
    "find": "(?<=Arturo)\\d+",
    "replace": "###",
    "isRegex": true
  }
}
```

You can also create commands solely in a keybinding like:

```jsonc
{
  "key": "alt+z",
  "command": "runInSearchPanel",
  "args": {
    "find": "(?<=^Arturo)\\d+",             // fixed-width lookbehinds and multiline supported
    "replace": "###",
    "matchWholeWord": false,
    "isRegex": true,
    "filesToInclude": "${relativeFile}",    // resolves to current file
    "triggerSearch": true,
    "triggerReplaceAll": true               // if using this, must have triggerSearch: true
  }
}
```

This is the same as creating a command in the settings like so (and then triggering it from the Command Palette or using the keybinding which follows):  

```jsonc
"runInSearchPanel": {                       // in settings.json
  "removeArturosDigits":  {
    "title": "Remove Arturo's Digits",
    "find": "(?<=^Arturo)\\d+",
    "replace": "###",
    "matchWholeWord": false,
    "isRegex": true,
    "filesToInclude": "${relativeFile}",
    "triggerSearch": true,
    "triggerReplaceAll": true               // if using this, must have triggerSearch: true
  }
}
```

```jsonc
{
  "key": "alt+e",                          // whatever keybinding you like
  "command": "runInSearchPanel.removeArturosDigits"
}
```


&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/searchGeneric1.gif?raw=true" width="750" height="400" alt="demo of search panel setting with intellisense"/>

Explanation: Creating a Search Panel command in the keybindings only.  In this case, search for `^Arturo` preceding some digits and replace in the current file. 

<br/>

> `triggerSearch` is a built-in vscode search across files option.  It triggers the search, and thus shows the results, but does not trigger a replace or replace all.  I would think in most cases you would want `"triggerSearch": true` to see your results right away.  But if you know you will be modifying the search in some way, you may not want to `triggerSearch`.  

> `triggerReplaceAll` is an option added solely by this extension.  Its action is the same as clicking the &nbsp; <kbd>Replace All</kbd> &nbsp; icon in the search results.  VS Code will always pop up a confirmation dialog before actually performing the replacement, so you will still have to confirm the replacement.  `triggerReplaceAll` must have results shown in order to work, that is why if you want `triggerReplaceAll` then you must also have `triggerSearch` set to `true`. If you do not have  "`triggerSearch": "true"` it will automatically be added for you.   

<br/>

------------  

<br/>

> Note: Regex lookbehinds that are **not fixed-length** (also called fixed-width sometimes), like `(?<=^Art[\w]*)` are not supported in the Search Panel.  But non-fixed-length lookbehinds are supported in vscode's Find in a file (as in using the Find widget) so they can be used in `findInCurrentFile` settings or keybindings.  

This works:    


```jsonc
{
  "key": "alt+y",
  "command": "findInCurrentFile",       // findInCurrentFile
  "args": {
    "find": "(?<=^Art[\\w]*)\\d+",      // not fixed-length, but okay in findInCurrentFile
    "replace": "###",
    "isRegex": true
  }
}
```

but the same keybinding in `runInSearchPanel` **will error and not run**:  

```jsonc
{
  "key": "alt+y",
  "command": "runInSearchPanel",         // runInSearchPanel
  "args": {
    "find": "(?<=^Art[\\w]*)\\d+",       // not fixed-length: ERROR will not run
    "replace": "###",
    "isRegex": true
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
    //"find": "<someText>",       // assume no "find" entry
    "replace": "###",             // optional
    "triggerSearch": true         // optional
  }
}
```

If there is no `"find"` entry for a `runInSearchPanel` command, this extension will create a `find` query using  either the first fully selected word or the first "nearest word" (to an empty selection) if there are multiple "selections".  It will even choose an nearest word empty selection if it was made before a fully selected word.  

This behavior is different from `findInCurrentFile` which will use **ALL** selections and nearest words at cursors as the `find` values.  In `runInSearchPanel` commands, only the **FIRST** selection/current word for the search query.  

In the demo below, text with a ***blue background*** is selected:  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindSearch.gif?raw=true" width="750" height="600" alt="demo of search panel setting with intellisense"/>  

<br/>

> Note: With no `find` entry and searching in other files, the current selection will be used to search in those other files!  This can be a fast way to search for a current word in other files and also works for the context menu searches (see below).  
 

------------  
<br/>

The `filesToInclude`, `filesToExclude`, `find` and `replace` arguments in the `runInSearchPanel` support these variables:  

```
${file}
${fileBasename}
${fileBasenameNoExtension}
${fileExtname}
${relativeFile}  

${fileDirname}
${relativeFileDirname}

${fileWorkspaceFolder}
${workspaceFolder}
${workspaceFolderBasename}

${selectedText}
${CLIPBOARD}           // added by this extension  
${pathSeparator}
${lineNumber}
${resultsFiles}        // added by this extension
```

<br/>

These variables should have the same resolved values as found at &nbsp; [vscode's pre-defined variables documentation](https://code.visualstudio.com/docs/editor/variables-reference#_predefined-variables).   These resolved variables are automatically escaped so they can be used in regular expressions.   

<br/>

The `replace` arguments in the `runInSearchPanel` also supports case modifiers like `\\U$n`, `\\u$n`, `\\L$n` and `\\l$n`.  

<br/>

---------------------  

<br/>

## Context Menu Commands  

<br/>

### 1.  Editor Context Menu  

* `Search in this File`  opens the Search Panel with the current filename.  
* `Search in this Folder`  opens the Search Panel with of the current file's parent folder.  
* `Search in the Results Files`  if there are search results in the Search Panel.  Discussed below.   

<br/>

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/contextEditor.gif?raw=true" width="700" height="650" alt="demo of editor context menus"/>

<br/>

### 2.  Editor Tab Context Menu

* `Search in this File`  opens the Search Panel with the chosen filename when using the context menu of an editor **tab**.  
* `Search in this Folder`  opens the Search Panel with the chosen editor tab's parent foldername when using the context menu of an editor **tab**.  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/contextTab.gif?raw=true" width="700" height="650" alt="demo of editor tabs context menuss"/>

### 3.  Explorer Context Menu

* `Search in this File`  opens the Search Panel with the (hovered over) filename of that hovered over.   
* `Search in this Folder` opens the Search Panel with the (hovered over) file's parent folder.   

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/contextExplorer.gif?raw=true" width="700" height="300" alt="demo of Explorer file context menus"/>

Explanation: The old 'files to include' entry will be replaced by the associated file or folder.  The `find` query will be the selected word of the **active text editor** - which can be different than the editor tab's context menu.  

<br/>

------------------- 

## Contributed Setting  

Showing the context keys can be disabled (the **default** is to show them) with this setting:

* `Find-and-transform: Enable Context Keys` in the Settings UI    

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/enableContextMenuSetting.jpg?raw=true" width="850" height="350" alt="enable context menu setting"/>  

<br/><br/>

----------------------------------

# Using the search results files in another search  

This functionality is currently ***experimental*** - mainly because I cannot test it in other operating systems.  Let me know if something is not working for you.  

There are four ways to get and use the current search results' files: 

1.  Editor context menu  
2.  Command Palette command  
3.  In a keybinding  
4.  In a setting, and then from the Command Palette or associated keybinding  

--------------

### Editor context menu  

Demo of using the context menu option to get the files from the search results and use in the next search:  

&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/resultsContextMenu.gif?raw=true" width="900" height="700" alt="get files from the search results"/>  

<br/>

The first search for `First` was in the entire workspace and had matches in three files.  Using the context menu command &nbsp; `Search in the Results Files` &nbsp; automatically retrieved and put the relative paths of those three files into the &nbsp; `files to include` &nbsp; input filter.  The second search was triggered by default, this time using the word `Second` because it was at the cursor.  The word `Second` only appears in one of those three files but does appear in other workspace files filtered out.  

The context menu command &nbsp; `Search in the Results Files` &nbsp; will only appear if there are search results.  Likewise, that command will not appear in the &nbsp; `Command Palette` &nbsp; if there are no search results. 

At this point, vscode does not allow the context menu of the search results view area (right next to the resilts) itself to be modified.  So the context menu of the editor is used.  It could be any editor.  If you don't want a "word at the cursor" to be used for the next search, put the cursor on an empty space.  

--------------

### Keybinding  

```jsonc
{
  "key": "shift+alt+s",                              // whatever keybinding you wish
  "command": "find-and-transform.searchInResults",
  "args": {
    "find": "Second",
    "replace": "Fourth",
    "filesToInclude": "${relativeFile}",             // will be ignored in this command
    "triggerSearch": false                           // will be ignored, true will be applied
    
    // other available args
    
    // "triggerReplaceAll"
    // "isRegex"
    // "preserveCase"
    // "useExcludeSettingsAndIgnoreFiles"
    // "isCaseSensitive"
    // "matchWholeWord"
    // "filesToExclude"
  },
  "when": "hasSearchResult"                         // I suggest this but it isn't mandatory
}
```

* In this command `find-and-transform.searchInResults` any `filesToInclude` will be ignored and all the search results files will be used instead.  
* The `"triggerSearch"` arg will be ignored as well.  `"triggerSearch": true` will be applied.
* The `when` clause is not required, but if there no search results, the command will search within the workspace folder.  This is as expected.  

-----------------
<br/>

## `${resultsFiles}` in a &nbsp; `runInSearchPanel` &nbsp; keybinding   

<br/>

```jsonc
{
  "key": "ctrl+shift+f",                   // whatever keybinding you want
  "command": "runInSearchPanel",           // note runInSearchPanel command here
  "args": {
    "find": "Second",                      // plus all the other args, see above 
    "replace": "Third",
    "filesToInclude": "${resultsFiles}",   // !!
    "triggerSearch": false                 // this will be respected here
  },
  "when": "hasSearchResult"                // I suggest this but it isn't mandatory
}
```

* In a `runInSearchPanel` keybinding, you can use the `"filesToInclude": "${resultsFiles}"` arg.  So that this search will first get and scope the search by the previous search's files.    
* The `when` clause is not required, but if there no search results, the command will search within the workspace folder.  This is as expected.

Other usages:

```jsonc
"filesToInclude": "${resultsFiles}, noFirst.txt"         // add any file(s) to the scope   
"filesToInclude": "${resultsFiles}, ${relativeFile}"     // add the current file to the scope

     // search in the results files but exclude the current file   

"filesToInclude": "${resultsFiles}",
"filesToExclude": "${relativeFile}"  

     // search in the results files but exclude the current file's entire folder  

"filesToInclude": "${resultsFiles}",
"filesToExclude": "${relativeFileDirname}"  
```

------------------------  
<br/>

## `${resultsFiles}` in a &nbsp; `runInSearchPanel` &nbsp; setting (in settings.json)  

<br/>

```jsonc
"runInSearchPanel": {
  "reSearchForSecond":  {               // use this 'name' in a keybinding
    "title": "reSearch for 'Second'",   // Command Palette as Find-Transform: reSearch for 'Second'
    "find": "Second",
    "replace": "Third",
    "isRegex": true,
    "filesToInclude": "${resultsFiles}",
    "triggerSearch": true
    // "triggerReplaceAll": true // if using this, triggerSearch: true is assumed
  }
}
```

* Should get intellisense for this name &nbsp; `reSearchForSecond` &nbsp; in the keybindings.  
* Look for &nbsp; `Find-Tansform: <your title here>` &nbsp; in the Command Palette.  
* This setting command can be run from the Command Palette or from an associated keybinding like:

```jsonc
{
  "key": "alt+5",                                    // whatever keybinding you wish
  "command": "runInSearchPanel.reSearchForSecond"    // same 'name' here
}
```

--------------------  

* If you search in your &nbsp; `settings.json` &nbsp; or &nbsp; `keybindings.json` &nbsp; on the previous search and then use these  previous results files, special care has to be taken to handle these files for use in the &nbsp; `files to include` &nbsp; input scope filter.  Windows at least doesn't like them and this extension will strip out some leading characters (like `C:\\`) to make them work.  If on a different OS you find that &nbsp; `settings.json` &nbsp; or &nbsp; `keybindings.json` &nbsp; gives you problems - please file an issue.  Thank you.  

* Note that because there is no real extension api to get the results files, this extension needs to use the &nbsp; **clipboard** &nbsp; to retrieve the results text.  Thus, changing your clipboard - there is no alternative at this point.  

<br/><br/>
