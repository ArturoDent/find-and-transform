# find-and-transform

Find and transform text in a single file.  Any number of find/replace combinations can be saved in the settings and then triggered either by the Command Palette or a keybinding.   

 The replace transforms can include ***case modifiers*** like:  

&emsp; &emsp;   `\U`  &emsp; uppercase the entire following capture group as in `\\U$1`  
&emsp; &emsp;   `\u`  &emsp; capitalize the first letter only of the following capture group: `\\u$2`     
&emsp; &emsp;   `\L`  &emsp; lowercase the entire following capture group:  `\\L$2`  
&emsp; &emsp;   `\l`  &emsp; lowercase the first letter only of the following capture group: `\\l$3`     

<br/>

This extension provides a way to save and re-use find/replace regex's and use case modifiers in the replacements.  You can use case modifiers in VS Code's find or search views but it is not possible to save frequently-used find/replacements.  It also raises intriguing possibilities for use in macros.  

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
		{  "replace" : "\\U$1"  }		
	],

	// this extension will generate a command from the above setting, 
	// it will appear as "Find-Transform: Uppercase Keywords" in the Command Palette

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

When you **save** a change to the "find-and-transform" settings, you will get the message notification below.  This extension will detect this change and create a corresponding command.  The command cannot be used in a keybinding and will not appear in the Command  Palette without saving the new setting.  

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/reloadMessage.jpg?raw=true" width="600" height="150" alt="notification to save after changing settings"/>

<br/>

-----------------------------  

Alternate form of keybinding (with **NO setting**):  

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

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/genericRunCommandKeybinding.gif?raw=true" width="600" height="300" alt="demo of generic find-and-transform.run keybinding"/>  

<br/>

In this way you can specify a keybinding to run a generic `run` command with the find/replace arguments right in the keybinding and nowhere else.  There is no associated setting and you do not need to reload vscode for this version to work.  You can have an unlimited number of keybindings (with separate trigger keys, of course) using the `find-and-transform.run`  version.

The downside to this method is that the various commands are not kept in one place, like your `settings.json` and these `run` versions cannot be found through the Command Palette.  However, particularly in a macro, you may wish to set up such a command.     

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; <img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/runWithoutArgs.jpg?raw=true" width="600" height="150" alt="notification to add find/replace args to run keybinding"/>

<br/>
--------------------  

## Todo

* Introduce option to use search panel with confirmation and include/exclude options.  
* Intellisense for commands in the keybindings.    
* Intellisense for `find` and `replace` in the settings.    
* Option to apply to selection only.  
* Support more string operations (e.g., `subString()`, `trim()`) in the settings?


## Release Notes

* 0.1.0 Initial release.
* 0.2.0 Replace with case modifiers work better.
* 0.3.0 Added a generic `find-and-transform.run` command for use in keybindings with `args`.  

-----------------------------------------------------------------------------------------------------------  

<br/>

## Example Command with a hard-coded find regex and upperCase transform  

<br/>

* **`find-and-transform.uppcaseKeywords`**  demonstration code/command can be found in the `extension.js` file:

```javascript
// a sample command using a hard-coded find regex and upperCase replacements
let disposable = vscode.commands.registerTextEditorCommand('find-and-transform.uppcaseKeywords', async (editor, edit) => {

  const docString = editor.document.getText();
  const re = /(?<!\w)(create|select|sum|drop|table|if|exists|day|group|by|order)(?!\w)/g;
  const matches = [...docString.matchAll(re)];

	if (matches) {
	  matches.forEach((match) => {
		
	    // this matchRange can be used if find matches are single words only
	    // const matchRange = editor.document.getWordRangeAtPosition(editor.document.positionAt(match.index));

	    // use this matchRange if matches can be more than a single word
	    const matchRange = new vscode.Range(editor.document.positionAt(match.index), editor.document.positionAt(match.index + match[0].length));

		  // hard-coded to upperCase
	    edit.replace(matchRange, match[1].toUpperCase());
	  });
    }
});
context.subscriptions.push(disposable);
```  

If you wanted to make your own extension for a fixed find and replace, you could use code like this (here using the string function `toUpperCase()` but you could modify that).  The advantage of this is that the command identifer you choose will appear in the Command Palette with no `find-and-transform` setting.

<img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/uppcaseKeywords.gif?raw=true" width="600" height="250" alt="demo of built-in command"/>