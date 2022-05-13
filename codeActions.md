<br/>  

## Running one or more of your find/replace settings on file save. 

<br/>

If you have some `findInCurrentFile` commands, for example:  

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

you can arrange for one or more of them to run whenever you save a file by using this setting:  

```jsonc
"editor.codeActionsOnSave": [
  "source.upcaseSwap",                  // all commands must start with "source."
  "source.upcaseSelectedKeywords"   
]
```

You may want to restrict this action to certain languages.   Use this form:

```jsonc
"[javascript]": {                       // will only run when saving a javascript file
  "editor.codeActionsOnSave": [
    "source.upcaseSwap",                // all commands must start with "source."
    "source.upcaseSelectedKeywords"
  ]
}
```

The commands will be run in the order listed.  So you could chain together find/replaces that must run in a certain order on save.   

<br/>