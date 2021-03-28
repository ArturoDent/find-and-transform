# find-and-transform

Find and transform text in a single file.  

1.  Any number of find/replace combinations can be saved in the settings and then triggered either by the Command Palette or a keybinding.
2.  Replacements can include case modifiers, like `\U`.  
3.  Find in the entire document or within selections only.     
4.  Keybindings can be quite generic, not necessarily including `find` or `replace` keys.  

 The replace transforms can include ***case modifiers*** like:  

&emsp; &emsp;   `\U`  &emsp; uppercase the entire following capture group as in `\\U$1`  
&emsp; &emsp;   `\u`  &emsp; capitalize the first letter only of the following capture group: `\\u$2`     
&emsp; &emsp;   `\L`  &emsp; lowercase the entire following capture group:  `\\L$2`  
&emsp; &emsp;   `\l`  &emsp; lowercase the first letter only of the following capture group: `\\l$3`     

<br/>

This extension provides a way to save and re-use find/replace regex's and use case modifiers in the replacements.  You can use case modifiers in VS Code's find or search views but it is not possible to save frequently-used find/replacements.   

<br/>

> Note, the above case modifiers must be double-escaped in the settings.  So `\U$1` should be `\\U$1` in the settings.  VS Code will show an error if you do not double-escape the modifiers (similar to other escaped regex items like `\w`).  

<br/>

-------------


## Features

1.  Make a setting with `find` and `replace` values and some name (with no spaces) for that setting.
2.  Trigger that command from the Command Palette by searching for that name or use that name in a keybinding.  
<br/>

## Sample Usage

In your `settings.json`:  

```jsonc
"find-and-transform": {

	"upcaseKeywords": [                       // <== "name" that can be used in a keybinding
		{  "title": "Uppercase Keywords" },  // title that will appear in the Command Palette
		{  "find"    : "(?<!\\w)(create|select)(?!\\w)" },
		{  "replace" : "\\U$1"  },
		{  "restrictFind": "selections" }   // or "document", the default		
	],

	// this extension will generate a command each of the settings, 
	// it will appear as, e.g., "Find-Transform: Uppercase Keywords" in the Command Palette

	"upcaseSwap": [
		{  "title": "swap iif <==> hello"},
		{  "find"    : "(iif) (hello)"  },
		{  "replace" : "\\u$2 \\U$1"  }
	]
}
```

In your `keybindings.json`:  

```jsonc
{
	"key": "alt+u",
	"command": "find-and-transform.upcaseKeywords"
},

{
	"key": "alt+s",
	"command": "find-and-transform.upcaseSwap"
}
```  

When you **save** a change to the "find-and-transform" settings, you will get the message notification below.  This extension will detect a change in its settings and create a corresponding command.  The command cannot be used in a keybinding and will not appear in the Command  Palette **without saving the new setting**.  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/reloadMessage.jpg?raw=true" width="600" height="150" alt="notification to save after changing settings"/>

<br/>

> Note: commands can be removed by deleting or commenting out the associated settings and re-saving the `settings.json` file.  

-----------------------------  

Alternate form of keybinding (with **NO setting**), in `keybindings.json`:  

```jsonc
{
	"key": "alt+y",
	"command": "find-and-transform.run",   // must be "run" here
	"args": {                            // "args" right in the keybinding, not in a setting
		"find": "(const\\s+)([^\\s]+)",
		"replace": "$1\\U$2"
	}
}
```  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/genericRunCommandKeybinding.gif?raw=true" width="600" height="275" alt="demo of generic find-and-transform.run keybinding"/>  

<br/>

In this way you can specify a keybinding to run a generic `run` command with the find/replace arguments right in the keybinding and nowhere else.  There is no associated setting and you do not need to reload vscode for this version to work.  You can have an unlimited number of keybindings (with separate trigger keys and/or `when` clauses, of course) using the `find-and-transform.run`  version.

The downside to this method is that the various commands are not kept in one place, like your `settings.json` and these `run` versions cannot be found through the Command Palette.    

<br/>

--------------------  

## More Examples and Demos

*  Generic `run` command in `keybindings.json` only, no `find` or `replace` keys in the `args`

```jsonc
{
	"key": "alt+y",
	"command": "find-and-transform.run"
}
```

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindNoRunDemo.gif?raw=true" width="700" height="300" alt="demo of no find and no replace keys in args"/> 

<br/>  

* Generic `run` command in `keybindings.json` only, with `find` but no `replace` key  

```jsonc
{
	"key": "alt+y",
	"command": "find-and-transform.run",
	"args": {
		"find": "(create|table|exists)",
		// "replace": "\\U$1",
		// "restrictFind": "document"    // the default, else "selections"
		// "restrictFind": "selections"
	}
}
```   

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findNoReplaceDemo.gif?raw=true" width="700" height="300" alt="demo of find and no replace keys in args"/> 

<br/>  

* Generic `run` command in `keybindings.json` only, with `find` and `replace` keys   

```jsonc
{
	"key": "alt+y",
	"command": "find-and-transform.run",
	"args": {
		"find": "(create|table|exists)",
		"replace": "\\U$1",
	}
}
```  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/findReplaceDemo.gif?raw=true" width="700" height="300" alt="demo of find and replace keys in args"/> 

<br/>  

* Generic `run` command in `keybindings.json` only, with a `replace` key but NO `find` key   

```jsonc
{
	"key": "alt+y",
	"command": "find-and-transform.run",
	"args": {
		// "find": "(create|table|exists)",
		"replace": "\\U$1",
	}
}
```  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/noFindReplaceDemo.gif?raw=true" width="700" height="300" alt="demo of replace but no find keys in args"/> 

--------------------

## Todo

* Introduce option to use search panel with confirmation and include/exclude options.        
* Support more string operations (e.g., `subString()`, `trim()`, `++`) in the settings?    


## Release Notes

* 0.1.0	Initial release.
* 0.2.0	Replace with case modifiers work better.
* 0.3.0	Added a generic `find-and-transform.run` command for use in keybindings with `args`.  
  &emsp;&emsp; Work on capture groups without case modifiers.  
* 0.4.0	Added intellisense for settings and keybindings.  
  &emsp;&emsp; Added `restrictFind` argument.  
	&emsp;&emsp; If no find or replace, will select all matches of word at cursor or selection.

-----------------------------------------------------------------------------------------------------------  

<br/>  
<br/> 

For an example using a hard-coded find and replace regex with case modifiers, see **[uppcaseKeywords](uppcaseKeywords.md)**.

<br/>