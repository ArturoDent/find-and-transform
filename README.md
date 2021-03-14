# find-and-transform

Find and transform text in a single file.  Any number of find/replace combinations can be saved in the settings and then triggered by this extension.   

 The replace transforms can include case modifiers like:

&emsp; &emsp;   `\U`  &emsp; uppercase the entire following capture group as in `\\U$1`  
&emsp; &emsp;   `\u`  &emsp; capitalize the first letter  
&emsp; &emsp;   `\L`  &emsp; lowercase the entire following capture group  
&emsp; &emsp;   `\l`  &emsp; lowercase the first letter of the following capture group    

<br/>

> Note, the above case modifiers must be double-escaped.  So `\U$1` should be `\\U$1` in the settings.  Vscode will show an error if you do not double-escape the modifiers (and other items like `\w`).   

-------------


## Features

1.  Make a setting with `find` and `replace` values and some name (with no spaces) for that setting.
2.  Use that name in a keybinding.

## Sample Usage

In your `settings.json`:  

```jsonc
"find-and-transform": {

	"uppcaseKeywords": [
		{"find": "(?<!\\w)(create|select|sum|drop|table|if|exists|day|group)(?!\\w)"},
		{"replace": "\\U$1"}
	],

	"uppcaseSwap": [
		{"find": "(iif) (hello)"},
		{"replace": "\\u$2 \\U$1"}
	]
}
```

In your `keybindings.json`:  

```jsonc
{
	"key": "alt+u",
	"command": "find-and-transform.uppcaseKeywords"
},

{
	"key": "alt+s",
	"command": "find-and-transform.uppcaseSwap"
}
```
--------------------  

## Example Command with a hard-coded find regex and upperCase transform  

* **`find-and-transform.uppcaseKeywords`**  demonstration code/command can be found in the `extension.js` file:

```javascript
// a sample command using a hard-coded find regex and upperCase replacements
let disposable = vscode.commands.registerTextEditorCommand('find-and-transform.find', async (editor, edit) => {

	const docString = editor.document.getText();
	const re = /(?<!\w)(create|select|sum|drop|table|if|exists|day|group|by|order|min|max|and|else|iif|end|over|partition|distinct|desc)(?!\w)/g;
	const matches = [...docString.matchAll(re)];

	if (matches) {
		matches.forEach((match) => {
			
				// this matchRange can be used if find matches are single words only
				// const matchRange = editor.document.getWordRangeAtPosition(editor.document.positionAt(match.index));

				// use this matchRange if matches can be more than a single word
				const matchRange = new vscode.Range(editor.document.positionAt(match.index), editor.document.positionAt(match.index + match[0].length));

			edit.replace(matchRange, match[1].toUpperCase());
		});
	}
});
context.subscriptions.push(disposable);
```  

If you wanted to make an extension for a fixed find and replace, you could use code like this.  The advantage of this is that the command identifer you choose will appear in the Command Palette with no special work (that feature will be added to this extension later for all cases).

<img src="https://github.com/ArturoDent/find-and-transform/blob/master/images/uppcaseKeywords.gif?raw=true" width="600" height="250" alt="demo of built-in command"/>

--------------------  

## Todo

* Write commands into the `package.json` so they are available in the Command Palette  
* Intellisense for commands in the keybindings    
* Intellisense for `find` and `replace` in the settings    
* Option to apply to selection only  
* Support more string operations (e.g., `subString()`, `trim()`) in the settings?


## Release Notes

* 0.1.0 Initial release



-----------------------------------------------------------------------------------------------------------  