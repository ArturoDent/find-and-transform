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