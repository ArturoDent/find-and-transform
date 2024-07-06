# Running one or more of your find/replace settings on file save.

<br/>

If you have some `findInCurrentFile` commands in your **setting.json**, for example:  

```jsonc
"findInCurrentFile": {
  "upcaseSwap": {                            // use this name in the codeActionsOnSave setting
    "title": "swap iif <==> hello",
    "find": "(iif) (hello)",
    "replace": "_\\u$2_ _\\U$1_",
    "isRegex": true
    // "restrictFind": "selections"          // selections will work when run on save
  },
  "upcaseSelectedKeywords": {                // use this name in the codeActionsOnSave setting
    "title": "Uppercase selected Keywords",
    "find": "(Hello)",
    "replace": "\\U$1--",
    "isRegex": true
  }
}
```

The extension will make a `codeAction` from any settings commands like the above.  You can't use `keybindings.json` "commands" as a `codeAction`.  

Then you can arrange for one or more of them to run whenever you save a file by using this setting (also in your settings.json):  

```jsonc
"editor.codeActionsOnSave": [
  "source.upcaseSwap",                  // all commands must start with "source."
  "source.upcaseSelectedKeywords"   
]
```

You may want to restrict this action to certain languages.   Use this form:

```jsonc
"[javascript][typescript]": {           // will only run when saving a javascript or typescript file
  "editor.codeActionsOnSave": [
    "source.upcaseSwap",                // all commands must start with "source."
    "source.upcaseSelectedKeywords"
  ]
}
```

The commands will be run in the order listed.  So you could chain together find/replaces that must run in a certain order on save.  So a later codeAction code can use the results of an earlier codeAction.  
