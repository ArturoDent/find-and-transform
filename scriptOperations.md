# Script Operations

This page covers using JavaScript (`$${ ... }$$` "jsOp") in a `replace` or `run` value, and about saving those scripts as named, reusable files. See [README.md](README.md) for the rest of the extension's features.

`$${ ... }$$` and `$${script:name}$$` work in `findInCurrentFile`'s `replace` and `run` values, and in `runInSearchPanel`'s `replace` value (`runInSearchPanel` has no `run` value).

## Table of Contents

&emsp; &emsp; [1. Named Scripts (stored in Global Storage)](#named-scripts-stored-in-global-storage)

&emsp; &emsp; &emsp; [a. Escaping in a script file: use ONE backslash](#escaping-in-a-script-file-use-one-backslash-not-two)  
&emsp; &emsp; &emsp; [b. Variables inside a comment are not resolved](#variables-inside-a-comment-are-not-resolved)  
&emsp; &emsp; &emsp; [c. Capture groups in a script: quote for text, leave bare for math](#capture-groups-in-a-script-quote-for-text-leave-bare-for-math)  
&emsp; &emsp; &emsp; [d. Passing an argument to a named script](#passing-an-argument-to-a-named-script)  
&emsp; &emsp; &emsp; [e. Not supported in `find`](#not-supported-in-find)  
&emsp; &emsp; &emsp; [f. Capture groups in a `runInSearchPanel` script](#capture-groups-in-a-runinsearchpanel-script)  

&emsp; &emsp; [2. Running Javascript Code in a Replacement](#running-javascript-code-in-a-replacement)

&emsp; &emsp; &emsp; [a. Math Operations in Replacements](#doing-math-on-replacements)  
&emsp; &emsp; &emsp; [b. String Operations in Replacements](#doing-string-operations-on-replacements)  
&emsp; &emsp; &emsp; [c. Using the vscode api or other packages, like path, in Replacements](#using-the-vscode-api-on-replacements)  
&emsp; &emsp; &emsp; [d. More Operations in Replacements](#doing-other-javascript-operations-on-replacements)  

&emsp; &emsp; [3. Running Javascript Code as a Side Effect](#running-javascript-code-as-a-side-effect)

-----------------

## Named Scripts (stored in Global Storage)

Instead of using `$${ jsOperation }$$` inline in your settings.json or in keybindings.son, you can save it as a named script and reference it with `$${script:name}$$`.  Named scripts:  

* are stored as real `.js` files you can open and edit with full syntax highlighting and IntelliSense
* get completions/IntelliSense for this extension's own variables too (`${fileBasename}`, `${BLOCK_COMMENT_START}`, `${getInput}`, `\U$1`, `${1:/upcase}`, etc.) - the same suggestions you get typing `$` or `\` into a `"replace"`/`"run"` value in keybindings.json or settings.json
* are available in every workspace (they use VS Code's global storage, not per-workspace storage)
* sync to your other machines via Settings Sync (the script's code lives in `globalState`, which is synced; the on-disk `.js` file is just a local editable copy kept in sync with it)

Commands, all under the `Find-Transform` category in the Command Palette:  

* **New Script** - name a new script and open it for editing
* **Edit Script** - pick an existing script to open and edit
* **Delete Script** - pick an existing script to delete
* **Reveal Scripts Folder in File Explorer** - open the on-disk scripts folder directly in your OS file explorer/finder, no need to hunt down its (long, OS-specific) global storage path yourself
* **Save Selected Code as Named Script** - select an existing jsOp (from a setting or keybinding) and run this command to save it as a named script and replace the selection with a reference to it.  

```jsonc
// before, with only the code lines selected
"replace": [
  "$${",
  "const langID = document.languageId;",
  "vscode.commands.executeCommand('vscode.open', uri);",
  "}$$"
]
// after saving as "openLangSnippet"
"replace": [
  "$${",
  "script:openLangSnippet",
  "}$$"
]

// before, with the entire array (brackets included) selected
"replace": [
  "$${",
  "const langID = document.languageId;",
  "vscode.commands.executeCommand('vscode.open', uri);",
  "}$$"
]
// after saving as "openLangSnippet"
"replace": "$${script:openLangSnippet}$$"
```

> **Select only what you want saved.** Whatever you select is exactly what ends up in the script file - this command does not try to guess where "the jsOp" is inside a larger selection. If you select just the code (or the whole `$${ ... }$$` block, or the whole `replace`/`run` value as shown above), you get a clean, ready-to-run script. But if you select *more* than the jsOp - for example the entire quoted value including other text or variables around it, like `"${BLOCK_COMMENT_START} $${ ... }$$ ${BLOCK_COMMENT_START}"` - that entire selection, surrounding text included, is saved into the script file verbatim:
>
> ```jsonc
> // before, with the ENTIRE quoted value selected (including ${BLOCK_COMMENT_START} on both sides)
> "replace": "${BLOCK_COMMENT_START} $${return '$1'.toLocaleUpperCase();}$$ ${BLOCK_COMMENT_START}",
> // after saving as "myScript" - the replacement is a complete, self-contained value:
> "replace": "$${script:myScript}$$",
> ```
>
> The saved `myScript.js` file would then literally contain  

`${BLOCK_COMMENT_START} $${return '$1'.toLocaleUpperCase();}$$ ${BLOCK_COMMENT_START}`  

That is not valid JS as-is, since `${BLOCK_COMMENT_START}` and the nested `$${ ... }$$` are extension syntax, not JavaScript. You'd need to hand-edit the file into real code.  For the best results, select just the jsOp instead.

A named script is *not* handed `vscode`/`path`/`document` automatically the way an inline `$${ ... }$$` jsOp is - only `require` is. That's deliberate: it means the script file can `require()` these itself as real code, which is what actually gives the editor intelliSense for js code and the vscode extension api. So every script file - whether created via **New Script** or **Save Selected Code as Named Script** - starts with a header that does exactly that.

**Save Selected Code as Named Script** adds two things around that header.  Above it, the source config's `"title"` (the text a setting shows in the Command Palette) and its `"description"`, one `//` line each, so the top of the file says what the script is for.  Below it, the keybinding or setting the code came from, verbatim, in a block comment - so months later the script itself still tells you what `find` it was written for, which key ran it, and what the rest of its args were:

```js
// Transform to PascalCase
// bumps the version on save

const vscode = require('vscode');
const path = require('path');
const document = vscode.window.activeTextEditor?.document;

// const os = require('os');
// const fs = require('fs');
// const glob = require('glob');
// remove or comment any of the above you don't use

// a script file isn't JSON, so don't double-escape here:  '\U$1' is the normal
//   form ('\\U$1' is accepted too, but only for case modifiers, not '\n', '\d', etc.)
// don't use case transforms like '\U$1' if intended for a 'runInSearchPanel' call
//  '\U$1' will be replaced by simply '$1'
// don't use conditional transforms like '${1:add text}', they will not work

/*
saved from this setting, under "findInCurrentFile":

"bumpSaveVersion": {
  "title": "Transform to PascalCase",  // appears in the Command Palette
  "description": "bumps the version on save",
  "replace": "${1:/pascalcase}",
  "restrictFind": "previousDontMoveCursor",
  "find": "(\\w+)",
  "runWhen": "onceIfAMatch",
  "isRegex": true
}
*/

return ...;
```

A keybinding has no `"title"`, so its leading comment is just the `args` object's `"description"`, and the whole keybinding object is recorded instead - `"command"` included, which is why the setting form names the command above the entry and this one doesn't:

```js
// Open html snippets path

const vscode = require('vscode');
...

/*
saved from this keybinding:

{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {
    "description": "Open html snippets path",
    "find": "(\\w+)",
    "replace": [
      "$${",
      "const langID = document.languageId;",
      "vscode.commands.executeCommand('vscode.open', uri);",
      "}$$"
    ]
  },
  "when": "editorTextFocus"
}
*/

const langID = document.languageId;
vscode.commands.executeCommand('vscode.open', uri);
```

Both are only comments - delete them if you don't want them.  The block comment is never added by **New Script** (which has no source config) or when the selection isn't in a `settings.json`, `keybindings.json` or `.code-workspace` file.

(Inline `$${ ... }$$` jsOps are unaffected by any of this - `vscode`/`path`/`document` keep working there with no `require()` needed, exactly as before.)

> **Your script needs a top-level `return` statement.** It's easy to forget when a script is a whole standalone `.js` file rather than a compact one-liner. Declaring a function (even an IIFE) or calling one is not enough by itself - if execution reaches the end of the file without hitting `return`, the result is `undefined`, same as any JS function:
>
> ```js
> // wrong - declares and calls, but returns nothing from the script itself
> const myFunc = function () {
>   return 12;
> }();
>
> // wrong - same issue, the call's result is discarded
> function myFunc() { return 12; }
> myFunc();
>
> // right - the script itself returns a value
> function myFunc() { return 12; }
> return myFunc();
> ```

### Escaping in a script file: use ONE backslash, not two

A script file holds **raw** javascript, not a JSON string, so it does not need the
double-escaping that keybindings.json and settings.json do.  Write case modifiers with a
single backslash:

```js
// in a saved script file
return `\U$1`;      // right
return `\\U$1`;     // also accepted, but the single backslash is the normal form here
```

Case modifiers (`\U`, `\u`, `\L`, `\l`) are the one exception: both spellings are accepted,
so a keybinding's doubled backslash pasted straight into a script file still works. Every
other escape below is not - a doubled `\\n`/`\\d`/`\\w` in a script file really is two
characters, and means something different than you intended.

```jsonc
// the same thing in a keybinding, where JSON needs the doubled backslash
"replace": "$${ return `\\U$1`; }$$",
```

**Save Selected Code as Named Script** does this conversion for you, so code moved out of a
keybinding arrives in the script file already correctly single-escaped.

### Variables inside a comment are not resolved

A script file is raw text, resolved before it's ever compiled - so without special
handling, a variable written inside a `//` or `/* */` comment would be substituted exactly
as if it were live code. For a variable like `${getInput}`, which shows a real input box as
a side effect of resolving, that meant a line you'd commented out to disable it still
popped the prompt. Comments are now skipped entirely by the variable pass, so it's safe to
mention `${getInput}`, `\U$1`, `${1:text}`, etc. in an explanatory comment without triggering
or rewriting them:

```js
// don't use \U$1 here - vscode resolves $1 itself, after this runs in runInSearchPanel
return $1 + "qrs";
```

This only applies to comments in a script *file* - variables inside a string or template
literal still resolve normally (`return "Hello ${getInput}";` still prompts, same as
always), and a keybinding/setting value has no comments to begin with (JSON strips them
before this extension ever sees the text).

> The same applies to any other backslash escape - `\n`, `\d`, `\w` and so on - which is why
the `\n` rules described under [string operations](#doing-string-operations-on-replacements)
below are written for the doubled, keybinding form.  

### Capture groups in a script: quote for text, leave bare for math

A `$n` is substituted into the source **as raw text**, before the javascript is parsed (see
[why this matters](#doing-string-operations-on-replacements) below).  So a bare `$2` becomes a
number literal you can do arithmetic on, while `'$2'` or `` `$2` `` becomes a string.

The one thing to watch: arithmetic has to sit **outside** the quotes or backticks.  Anything
inside them is just text.

```js
// find: "(\$1) (\d+)", document text: other 123

return `\U$1 ` + ($2 * 3);   // OTHER 369    <-- text inside the ticks, math outside
return `\U$1 $2*3`;          // OTHER 123*3  <-- "$2*3" is inside the string, so no math
return `\U$1 ` $2 * 3;       // SyntaxError: Unexpected number - missing the "+"
```

> If a jsOp or script does throw, the `find-and-transform` Output channel shows the **resolved**
code - the source after every `$1`/`${variable}` was substituted - underneath the error.  That is
usually the quickest way to spot a mistake like the missing `+` above, since the error itself
refers to generated code you never wrote by hand.  

### Passing an argument to a named script

Reference a script as `$${script:name(argument)}$$` (note the parentheses) to expose that
argument inside the script as a variable called `arg`. This lets one shared script behave
differently per call site, instead of maintaining several near-identical scripts that differ
by one hardcoded value:

```jsonc
"find": ["(function)", "(alpha)"],
"replace": ["$${script:myScript($1)}$$", "$${script:myScript($1)}$$"]
```

```js
// myScript.js
if (arg === 'function') return 'first thing';
else if (arg === 'alpha') return 'second thing';
```

The argument text goes through the same variable/capture-group resolution as everything else
in the `replace`/`run` value *before* the script ever sees it - so `$1`, `${relativeFile}`,
`${matchNumber}`, etc. all work as the argument, exactly as shown with `$1` above. A script
referenced without parentheses (every script written before this feature, and any script that
doesn't need one) simply gets `arg === undefined` - completely unaffected.

A few situations where this is handy - the common thread is reusing one script instead of
copy-pasting it with one literal changed:

* **One reusable "open a file" script**, parameterized by path instead of one script per
  target: `$${script:openFile(${workspaceFolder}/notes.md)}$$`.
* **A mode-switch transform**: one `caseConvert.js` with `switch (arg) { case 'camel': ...;
  case 'snake': ...; }`, reused as `$${script:caseConvert(camel)}$$` /
  `$${script:caseConvert(snake)}$$` across different presets.
* **A lookup table**: `statusMessage.js` mapping codes to text, called as
  `$${script:statusMessage($1)}$$` with whatever code the find matched.
* **A tag/annotation inserter**: `annotate.js` returning `` `${LINE_COMMENT} ${arg}: ` ``,
  reused as `$${script:annotate(TODO)}$$` / `$${script:annotate(FIXME)}$$`.
* **Two find/replace pairs, one script**: the example above - instead of two near-duplicate
  scripts that drift out of sync as they're maintained, one script that branches on `arg`.

Since script names are otherwise unrestricted (they can contain spaces, e.g.
`$${script:open snippets}$$`), avoid parentheses in a script's own name if you don't intend to
pass it an argument - `script:name(x)` is always parsed as "name" plus argument `x`.

**Multiple values** work today too - there's only ever one `arg`, but it's just a string, so
pack several values into it yourself with a delimiter and split it back apart in the script:

```jsonc
"replace": "$${script:myScript($1|${fileBasenameNoExtension})}$$"
```

```js
// myScript.js
const [first, second] = arg.split('|');
```

For structured data, `JSON.stringify(...)` on the way in and `JSON.parse(arg)` inside the
script works the same way. There's no dedicated multi-argument syntax (like
`script:name(a, b, c)` auto-split into separate values) because by the time the parentheses
are parsed, everything inside is already-resolved plain text - a comma that's part of a
resolved value would be indistinguishable from a comma meant to separate arguments. Choosing
your own delimiter and packing/unpacking `arg` yourself avoids that ambiguity entirely.

### Not supported in `find`

`$${ jsOperation }$$` and `$${script:name}$$` are only resolved in a `replace` or `run`
value - and this applies the same way to a `find` value in either `findInCurrentFile` or
`runInSearchPanel`. Referencing either from `"find"` will not work correctly - capture
groups are unavailable inside the script, `await` throws a `SyntaxError`, and a failing
script can abort the command without a clean error. Completions currently still suggest
`$${script:...}$$` inside `find`; that's a known gap, not an endorsement.

If you need the find pattern itself generated dynamically, build it in a `preCommands` step
instead (e.g. write the pattern into a variable/clipboard via a `run` jsOp beforehand), or
keep the jsOp on the `replace` side and adjust the logic there.

### Capture groups in a `runInSearchPanel` script

`findInCurrentFile` does its own matching, so a script referenced from its `replace` gets the
real matched text substituted for `$1`/`$2`/etc. before the script runs - you can compute
with it, measure its length, upper/lowercase it, anything.

`runInSearchPanel` does not match anything itself. It fills in VS Code's built-in Search
panel and lets VS Code's own Search & Replace do the matching, later and separately, across
however many files and matches. So at the moment your script runs there is no matched text
yet, and `$1` cannot have a value.

Instead of blanking it out, a `$1`/`${1}` in a `runInSearchPanel` script is passed through
to the Replace field as a literal `$1`, which VS Code then substitutes per real match at
replace time - exactly like writing `$1` directly in `replace` with no script at all. So
this works:

```js
// search_group_replace.js
return $1 + "qrs";        // Replace field gets: $1qrs
```

Two consequences follow from `$1` being a placeholder rather than a value here:

* **Case modifiers are dropped.** `\U$1` resolves to plain `$1` - there is no text yet to
  uppercase, and VS Code's Replace field has no case-modifier syntax to defer it to.
* **You cannot compute with it.** `$1.length`, `Number($1) * 2`, `$1.split(",")` and the
  like operate on the literal string `"$1"`, not on matched text. Conditionals
  (`${1:+yes}`, `${1:-no}`, `${1:?yes:no}`) likewise cannot work - VS Code's Replace field
  has no conditional syntax to defer to.

If you need real per-match computation, use `findInCurrentFile` instead - it matches in the
current editor itself, so the script receives actual matched text.

------------------  

## Running Javascript Code in a Replacement  

It is difficult to debug errors in javascript code you write in a replacement as below.  If your keybinding or setting generates an error, you will get a warning message notifying you of the failure.  And if you check your `Output` tab, and chose `find-and-transform` from the dropdown menu, you may get some helpful information on the nature of the error.  

You can also put `console.log(...)` statements into the replacement code.  It wil lbe logged to your `Help/Toggle Developer Tools/Console`.  

> **`$1` needs an actual capture group to resolve.** If you write an explicit `"find"` with parentheses, like `"find": "(trouble)"`, `$1` works as expected. If you omit `"find"` entirely and rely on your selection to generate one (see [README.md](README.md#how-to-insert-a-value-at-the-cursor)), the extension notices that your `replace`/`run` uses `$1` - checking inside a `$${script:name}$$` reference's saved code too, not just the literal `$${ ... }$$` text - and automatically escapes any regex-special characters in the generated find, wraps it in `(...)`, and turns `isRegex` on for you.  

This works for both a single selection and multiple, and for whatever the selection contains, including regex-special characters like `().+*$`. **Don't set `"isRegex": true` yourself** just to make `$1` work - doing so skips that automatic escaping, and a selection containing regex-special characters will then fail to match itself at all.

### Doing math on replacements

Use the special syntax **` $${<some math op>}$$ `** as a replace or find value.  Everything between the brackets will be evaluated as a javascript function so you can do more than math operations, e.g., string operations (see below).  This does **not** use the `eval()` function.  Examples:  

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {
    "find": "(?<=<some preceding text>)(\\d+)(?=<some following text>)",  // postive lookbehind/ahead
    
    "find": "$${return ${getInput} * 3;}$$",       // do math on the getInput and match it
    
    "find": "(howdy)-(${lineNumber})",
    "replace": "${1:/capitalize}-$${return $2 * 10;}$$",  // howdy-3 => Howdy-30 (on line 3)
    
    
    "replace": "$${return $1 + $1}$$",             // will double the digits found in capture group 1  
    "replace": "$${return 2 * $1 }$$",             // will double the digits found in capture group 1  

    "replace": "$${return $1 + $2}$$",             // add capture group 1 to capture group 2  

    "replace": "$${return $1 * 2 + `,000` }$$",    // double group 1, append `,000` to it.  1 => 2,000  

    "replace": "$${return $1 * Math.PI }$$",       // multiply group 1 by Math.PI 
    
    "replace": "$${const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738)); return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long' }).format(date)}",
                                                   // insert: Saturday, 19 December 2020 at 20:23:16 GMT-7
                                                   
    "replace": [                                   // same output as above
      "$${",                                       // put opening wrapper - '$${' on its own line!
        "const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738));",
        "return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long' }).format(date)",
      "}$$"                                        // put closing wrapper - '}$$' on its own line!
    ],     

    "isRegex": true  
  }
}
```  

> **IMPORTANT**: you must use semicolons at the end of statements - except for the final `return` statement (or if the only statement is a `return something`).  Anything with multiple statements must use semicolons.  The operations will be loaded into a `Function` which uses `"use strict"` which requires semicolons.  

### A `jsOperation` written as an array of statements:  

 If you use the expanded form of replacement with a `jsOperation` written as an array (as in the last example immediately above), that entire array will be transformed into a single long array item like `$${ <multiple statements> }$$` and so it will then become a single replace array item.  So this replacement:

 ```jsonc
"replace":  [
  "$${",
    "let a = 10;",
    ...
    "return 'howdy';",
  "}$$",
  
  "$${",
    "let v = 12;",
    ...
    "return 'pardner';",
  "}$$"
]
 ```

 will become  

 ```jsonc
"replace":  [
  "$${ let a = 10; ... return 'howdy'; }$$",
  "$${ let v = 12; ... return 'pardner'; }$$"
]
```

The above is 2 `replace`'s.  The first one will be applied to the first `find`.  And the second `replace` will be applied to the second `find`.  

> **Comments in an array-form `jsOperation`**: since each element gets joined onto one line, a `// line comment` element would otherwise swallow every element after it on that line - including a later `return`.  To prevent that, any `// ...` line comment in an array element is automatically stripped before joining.  Use a `/* ... */` block comment instead if you want the comment to remain in the joined code, e.g. `"/* explain this step */"` as its own array element.  

-------------  

### Doing string operations on replacements

You can also do string operations inside the special syntax ` $${<operations>}$$ `.  But you will need to ***"cast"*** the string in backticks, single quotes or escaped double quotes like so:  

```text

$${ return `$1`.substring(3) }$$  use backticks (I recommend backticks) or  

$${ return '$1'.substring(3) }$$  or  use single quotes

$${ return \"$1\".includes('tro') }$$  escape the double quotes
```

> You **must** use one of the above if the value, like a capture group or some variable, could contain newlines.  

> Any term that you wish to be interpreted **as a string** must be enclosed in ticks or quotes.  So in the first example below to replace the match with the string `howdy` I used backticks.  This is only necessary within the operations syntax `$${<operations>}$$`, otherwise it is interpreted as an unknown variable by javascript.  

**Why does this matter, if variables are resolved before the code even runs?** Because resolution is a text substitution on the raw source string, done *before* that text is ever parsed as JavaScript - conceptually the same as a C preprocessor macro expanding before the compiler parses the result. The resolver has no notion of JS syntax; it just swaps characters for other characters. If the swapped-in text happens to spell out something meaningful in JS syntax, the JS parser - which only runs *after* substitution, and has no memory of where the text came from - treats it as that syntax, not as inert data. For example:

```jsonc
// unquoted - BLOCK_COMMENT_START/END get substituted as raw source text:
"replace": "$${ return ${BLOCK_COMMENT_START} '$1'.toLocaleUpperCase() ${BLOCK_COMMENT_END}; }$$",

// after substitution (for a language whose block comment is /* */), the source handed to the
// JS parser literally becomes:
//   return /* trouble.toLocaleUpperCase() */;
// `/* ... */` is real comment syntax at that point, swallowing the code that would produce a
// value - so this silently returns undefined, not an error

// quoted - the comment characters land inside string literals instead:
"replace": "$${ return '${BLOCK_COMMENT_START} ' + '$1'.toLocaleUpperCase() + ' ${BLOCK_COMMENT_END}'; }$$",

// after substitution:
//   return '/* ' + 'trouble'.toLocaleUpperCase() + ' */';
// now /* and */ are just two characters inside string literals, not comment syntax, because
// the parser only treats them specially outside of a string
```

This is the same category of issue as SQL or shell injection: splicing text of unknown content directly into source code is only safe when it lands inside something - here, quotes - that marks it as data rather than syntax.

**This applies inside comments too.** `//` and `/* */` are not special to the resolver any more than any other JS syntax is - it doesn't know what a comment is, so a variable reference written inside one (to note it for later, disable it, or show an example) still gets resolved exactly as if it were live code. For instance, this line in a saved script:

```js
// ${getInput}
```

still pops the `${getInput}` input box prompt when the script runs, even though it looks commented-out. There's no "disable resolution" comment syntax - if you want to write a literal `${...}`-shaped string inside a comment without triggering it, you need to break up the `${` sequence somehow (e.g. a space between `$` and `{`).

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {

    "find": "(trouble) (brewing)",

    "replace": "$${ return `howdy` }$$",                 // replace trouble brewing => howdy  
    "replace": "howdy",                                  // same result as above   

    "replace": "$${ return `$1`.indexOf('b') * 3 }$$",   // trouble brewing => 12  

    "replace": "$${ return `$1`.toLocaleUpperCase() + ' C' + `$2`.substring(1).toLocaleUpperCase() }$$",
    // trouble brewing => TROUBLE CREWING  

    "replace": "$${ return `$1`.replace('ou','e') }$$",  // trouble => treble 
    
    // using a capture group in replace/replaceAll, see note below 
    "replace": "$${ return `$1`.replace('(ou)','-$1-') }$$",  

    "replace": "$${ return '$1'.split('o')[1] }$$",      // trouble => uble  

    "find": "(tr\\w+ble)",                               // .includes() returns either 'true' or 'false'  
    "replace": "$${ return '$1'.includes('tro') }$$",    // trouble will be replaced with true, treble => false  

    "find": "(tr\\w+ble)",                               // can have any number of $${...}$$'s in a replacment
    "replace": "$${ return '$1'.includes('tro') }$$--$${ return '$1'.includes('tre') }$$",
                                                         // trouble => true--false, treble => false--true

    "isRegex": true  
  }
}
```

* Note: If, in a javascript operation you have a `<sring>.replace(/../, '$n')` (or `replaceAll`) with a capture group in the replacement like:

```jsonc
"replace": [
  "$${",           // put opening jsOperation wrapper on its own line
  
  "if (`${fileBasenameNoExtension}`.includes('-')) {",
    "let groovy = `${fileBasenameNoExtension}`.replace(/(-)/g, \"*$1*\");",  // $1 here
    "console.log(groovy);",          // check the value in Toggle Developer Tools/Console
    "return groovy[0].toLocaleUpperCase() + groovy.substring(1).toLocaleLowerCase();",
  "}",
  "else {",
    "let groovy = `${fileBasename}`.split('.');",
    "groovy = groovy.map(word => word[0].toLocaleUpperCase() + word.substring(1).toLocaleLowerCase());",
    "return groovy.join(' ');",
  "}",
  
  "}$$"           // put closing jsOperation wrapper on its own line
],
```

that capture group will be from the `replace/replaceAll` as you would expect.  Other capture groups in a javascript operation will reflect the capture groups from the `find` argument.  

> You can combine math or string operations within **` $${<operations>}$$ `**.  

-------------  

### Using the vscode api on replacements

If you wish to use [the vscode api](https://code.visualstudio.com/api/references/vscode-api) in a replacement you can do so easily. For instance, to insert the current filename capitalized you could use this keybinding:

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {

    "replace": [
      "$${",

        "const str = path.basename(document.fileName);",
        "return str.toLocaleUpperCase();",
      
      "}$$"
    ]
  }
}
```

1. `document` = `vscode.window.activeTextEditor.document` and is provided as simply `document`.  
2. Any other node api can be used as `vscode.<more here>`.  
Do not do `const vscode = require('vscode');` it has already been declared and you will get this error:
`SyntaxError: Identifier 'vscode' has already been declared`.  You can declare it as something simpler like `const vsc = require('vscode');` just not as `vscode` again.  
3. `path` is also provided without needing to import it.  So don't `const path = require('path');` = error.  
4. You should be able to `require` the `typescript` and `jsonc-parser` libraries without needing to install them on your machine.  
5. If you get `[object Promise]` as the output of the replacement, you are trying to access an asynchronous method (or `thenable` return) - which will not work.  

> The above three rules are for **inline** `$${ ... }$$` jsOps only. A **named script** (`$${script:name}$$`) is the opposite: it does *not* get `vscode`/`path`/`document` automatically, and is expected to `require()` them itself. See [Named Scripts](#named-scripts-stored-in-global-storage) above.

```jsonc
"replace": [
  "$${",
    "let str = '';",
        // print a list of open file names in the active tabGroup
    "const tabs = vscode.window.tabGroups.activeTabGroup.tabs;",
    "tabs.forEach(tab => str += tab.label + '\\n');",  // note double-escaped newline
    "return str;",
  "}$$"
]
```

```jsonc
{
  "key": "alt+c",
  "command": "findInCurrentFile",  
  "args": {
    "replace": [   // print a list of full paths for open text documents by editor group
      "$${",

        "let str = '';",
        "const groups = vscode.window.tabGroups.all;",
        "groups.map((group, index) => {",
          "str += 'Group ' + (index+1) + '\\n';", 
          "group.tabs.map(tab => {",
            "if (tab.input instanceof vscode.TabInputText) str += '\\t' + tab.input.uri.fsPath + '\\n';",
            // "str += tab.label + '\\n';",
          "});",
        "str += '\\n';",
        "});",
        "vscode.env.clipboard.writeText( str );",
        "return '';",
        
      "}$$",
    ],
      
    // create a new file and paste into it
    "postCommands": ["workbench.action.files.newUntitledFile", "editor.action.clipboardPasteAction"]
  }
}
```

> For the above example which prints out the full path, there is no `find` so the replacement - just an empty string - will just be inserted at the cursor.  So make sure the cursor is not in or at a word boundary or that word will be treated as the `find` query and be replaced by an empty string.  There must be a `return` of some kind for a `replace` javascript operation.  

> It probably makes more sense to put the above javascript operation into a `"run"` argument if you are only going to use it as a side effect, like here where you store it in the clipboard to paste into a different file.  Then you don't care where the cursor is or whether there is any selected text already.  

Output of above replacement in a newly created file:

```text
Group 1
  c:\Users\Fred\AppData\Roaming\Code\User\keybindings.json
  c:\Users\Fred\AppData\Roaming\Code\User\settings.json
  c:\Users\Fred\OneDrive\Test Bed\test5.js
  c:\Users\Fred\OneDrive\Test Bed\zip\changed2.txt_bak
  c:\Users\Fred\OneDrive\Test Bed\zip\config.json

Group 2
  c:\Users\Fred\OneDrive\Test Bed\zip\test3.txt

```

```jsonc
"find": "${getTextLines:(${lineIndex}-1)}",  // get the line above the cursor

"replace": [
    "$${",                                     // get the line above the cursor
    
      "const sel = vscode.window.activeTextEditor.selection;",
      "const previousLine = document.lineAt(new vscode.Position(sel.active.line - 1, 0)).text;",
      
      // the below also works
      // "const previousLine = document.getText(new vscode.Range(sel.active.line-1, 0, sel.active.line-1, 100));",
      
      // below is the simplest
      "const previousLine = document.lineAt(new vscode.Position(${lineIndex}-1, 0)).text;",

      "return previousLine.toUpperCase();",
    
    "}$$"
],
```

The below will get the line above the cursor, put it into a capture group because it is surrounded by `()`, and capitalize it throughout the document (since there is no `restrictFind` value, `document` is the default).

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {
    "description": "capitalize the line above the cursor everywhere it occurs",
    
    "find": "(${getTextLines:(${lineIndex}-1)})",
    "replace": "\\U$1",
    "isRegex": true
  }
}
```

To capitalize only the preceding line:

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {
    "description": "capitalize the preceding line only",
    
    "find": "(${getTextLines:(${lineIndex}-1)})",
    "replace": "\\U$1",
    "restrictFind": "previousSelect",  // this makes it work on the preceding line only, will wrap at top of file
    // "restrictFind": "nextSelect",   // capitalize next instance of the find, will wrap at end of file
    "isRegex": true                    // must be here to treat the find as a regex
  }
}
```

```jsonc
"replace": [
  "$${",
    "const os = require('os');", 
    "return os.arch();",
  "}$$"
]
```

```jsonc
"replace": [
  "$${",

    "const { basename } = require('path');",  // you can re-import to rename or extract
    // "const path = require('path');",       // error: path is already declared
    "return basename(document.fileName);",
  
  "}$$"
]
```

```jsonc
"replace": [
  "$${",

    // change the current editor's fileName
    "const fsp = require('node:fs/promises');",
    "fsp.rename(document.fileName, path.join(path.dirname(document.fileName), 'changed2.txt'));",
    
    "return '';",   // return an empty string, else "undefined" is returned and inserted at the cursor(s)
  "}$$"
]
```

* While this last example does work, it seems odd to use a find and replace extension to change fileNames and run such commands that may have nothing to do with text replacements or insertions.  I can see a case where you want to change the fileName based on some text found in the current file though...

Better is to use the built-in `vscode.workspace.fs` for file operations:

```jsonc
"replace": [
  "$${",

    "const thisUri = vscode.Uri.file(document.fileName);",
    // the new filename could be derived from some text in the current file
    "const newUri = vscode.Uri.file(document.fileName + '_bak');",
    // this will rename the current file and it remains open
    "vscode.workspace.fs.rename(thisUri, newUri);",
  
    "return '';",  // return empty string
  
  "}$$"
]
```  

----------------

### Doing other javascript operations on replacements

> In a `replace` there **must be one or more `return` statements** inside the ` $${...}$$ ` for whatever you want returned.  

> Remember if you want a variable or capture group treated as a string, surround it with ticks or single quotes.  

> \`\\\U$1\` works in a javascript operation, \\\U\`$1\` does not work.  

```jsonc
{
  "key": "alt+n",
  "command": "findInCurrentFile",
  "args": {

    "find": "(trouble) (brewing)",
    
    // replace the find match with the clipboard text length
    "replace": "$${ return '${CLIPBOARD}'.length }$$",

    "find": "(trouble) (times) (\\d+)",
    // replace the find match with capture group 1 uppercased + capture group 2 * 10 
    // trouble times 10 => TROUBLE times 100  
    "replace": "$${ return `\\U$1 $2 ` + ($3*10) }$$",
    
    "find": "(\\w+) (\\d+) (\\d+) (\\d+)",
    // dogs 1 3 7 => Total dogs: 11
    "replace": "$${ return `Total $1: ` + ($2 + $3 + $4) }$$",

    // compare the clipboard text length to the selection text length
    "replace": "$${ if (`${CLIPBOARD}`.length < `${selectedText}`.length) return true; else return false }$$",

    // the find match will be replaced by:
    // if the clipboard matches the string, return capture group 2 + the path variable
    "replace": "$${ return `${CLIPBOARD}`.match(/(first) (pattern) (second)/)[2] +  ` ${fileBasenameNoExtension}` }$$",
  
    "isRegex": true  
  }
}
```

<br/>  

```jsonc
"replace": [
  "$${",                                                  // opening jsOp wrapper on its own line
  "if (`${fileBasenameNoExtension}`.includes('-')) {",
                                                          // must use let or const for variables
    "let groovy = `${fileBasenameNoExtension}`.replace(/-/g, \" \");",
    "return groovy[0].toLocaleUpperCase() + groovy.substring(1).toLocaleLowerCase();",
  "}",
                                              // blank lines have no effect, indentation is irrelevant
  "else {",
    "let groovy = `${fileBasename}`.split('.');",
    "groovy = groovy.map(word => word[0].toLocaleUpperCase() + word.substring(1).toLocaleLowerCase());",
    "return groovy.join(' ');",
  "}", 
   
  "}$$",                                                 // closing jsOp wrapper on its own line
  
  "$${return 'second replacement'}$$",                   // 2nd replacement
  
  "\\U$1"                                                // 3rd replacement
  ```  
  
  All the code between each set of opening and closing wrappers will be treated as a single javascript replacement.  You can also put it all on one line if you want, like the `"$${return 'second replacement'}$$"` above.  The above `replace` will be treated as:
  
  ```jsonc
  "replace": ["a long first replacement", "2nd replacement", "3rd replacement"]
  ```

As long as you properly wrap your blocks of code, you can intermix single replacements or other code blocks.  You can have as many as you need.  See the discussion in [README.md](README.md#running-multiple-finds-and-replaces-with-a-single-keybinding-or-setting) about running multiple finds and replaces in a series.

A `settings.json` example:  

```jsonc
"findInCurrentFile": {                       // in settings.json
  "addClassToElement": {
    "title": "Add Class to Html Element",
    "find": ">",
    "replace": [
      "$${",
      "return ' class=\"\\U${fileBasenameNoExtension}\">'",
      "}$$"
    ],
    "isRegex": true,                        // not actually necessary here
    "restrictFind": "selections"            // replace only for those `>` in a selection
  }
}
```

Explanation for above: Find `>` and add `class="uppercased filename">` to it.  

------------------  

## Running Javascript Code as a side effect  

You may want to run some javascript code, including the vscode api's, but **NOT** to replace anything.  You may want to construct a string to paste somewhere or gather filenames for example.  Consider this example (in your `settings.json`):

```jsonc
"findInCurrentFile": {
  "buildMarkdownTOC": {             
    "title": "Build Markdown Table of Contents",  // will be in the Command Palette
    
    "find": "(?<=^###? )(.*)$",     // these will be selected
    
    "run": [                        // this will be run after the find selections and before any replace
      "$${",
        "const headers = vscode.window.activeTextEditor.selections;",
        "let str = '';",

        "headers.forEach(header => {",
          "const selectedHeader = document.getText(header);",
          "str += `* [${selectedHeader}](#${selectedHeader.toLocaleLowerCase().split(' ').join('-')})\\n`;",
        "});",

        "str = str.slice(0, -1);",   // remove last \n from str
        "vscode.env.clipboard.writeText(str);",  // note that a return statement isn't necessary for "run"
      "}$$"
    ],
    
    "isRegex": true,
    "postCommands": [
      "cursorTop", 
      "editor.action.insertLineAfter",  
      "editor.action.insertLineAfter", 
      "editor.action.clipboardPasteAction"
    ]
  }
}
```

This setting will select all the headers with 2 or more `##`'s, and then the `run` code will use those selections to construct a table of contents.  That will be saved to the clipboard.  

And lastly, the `postCommands` will move the cursor to the top, insert 2 blank lines and then paste the table of contents.  

This is demonstrated at [Stack Overflow: run custom code on selected text](https://stackoverflow.com/questions/64748430/is-there-a-way-to-run-custom-js-code-on-the-selected-text-in-vscode), with a keybinding shown as well.  

This pattern of a `find` - which will select all the matches as limited by the `restrictFind` option - and then those selections (or the capture groups from the `find` regex), can be acted on in a `run` operation is a very powerful method.  

> The `run` argument will be performed after any `find` and after any `replace`.  So you could, for example, use the `vscode.window.activeTextEditor.selections` that your `find` matches and selects and manipulate those new selections.  
