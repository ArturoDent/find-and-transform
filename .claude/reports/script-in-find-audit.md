# Audit: why `"find": "$${script:name}$$"` does not work

Investigating this keybinding:

```jsonc
{
  "key": "alt+s",
  "command": "findInCurrentFile",
  "args": {
    "preCommands": "cursorHomeSelect",
    "find": "$${script:find_maths}$$",
    "isRegex": true,
    "replace": ["$${script:math_with_numbers}$$"],
    "restrictFind": "line"
  }
}
```

with `find_maths.js` containing:

```js
return '(\$1) (\d+)';
```

The reference *is* detected and the script *does* run - `find` is not rejected
anywhere. It fails because the find-resolution path differs from the replace path in
four separate places, plus one bug in the script itself.

## What the find actually becomes today

Traced through [`resolveVariables()`](../../src/resolveVariables.js#L211) with
`caller === "find"` (that is what `restrictFind: "line"` passes, see
[line.js:113](../../src/find/line.js#L113)):

| step | value |
|---|---|
| `args.find` | `$${script:find_maths}$$` |
| script source loaded | `return '(\$1) (\d+)';` |
| after `capGroupOnlyRE` pass (finding 2) | `return '(\) (\d+)';` |
| compiled + run | returns `() (d+)` |
| after `adjustValueForRegex` | `() (d+)` |

The final regex `() (d+)` matches nothing on a line like `other 123`, and the command
silently does nothing.

---

## Finding 1: the script itself eats its own backslashes

`'(\$1) (\d+)'` is a **JavaScript string literal**. `\$` and `\d` are not recognised
escapes, so JS drops the backslash: the string is `($1) (d+)`, not `(\$1) (\d+)`.

This one is in the script, not the extension - but the docs actively point the wrong
way. [scriptOperations.md:154-176](../../scriptOperations.md#L154-L176) says
"**use ONE backslash, not two**" and explicitly extends that to "`\n`, `\d`, `\w` and
so on":

```js
return `\U$1`;      // right
return `\\U$1`;     // works, but only by accident - avoid
```

That advice is correct only for the *pre-parse textual* substitutions. `\U$1` never
reaches the JS parser - [capGroupCaseModifierRE](../../src/regex.js#L18) rewrites it
to `OTHER` in the source text before `Function()` is called. `\d` and `\w` have no
such pre-pass, so they hit the JS parser inside a string literal and lose their
backslash. A find script - whose whole output is a regex - is exactly the case where
the doc's rule is wrong.

Working forms: `return '(\\$1) (\\d+)';` or `` return String.raw`(\$1) (\d+)`; ``

## Finding 2: `$n` is erased from a find script's source

[`_resolveNonJsOpVariables()`](../../src/resolveVariables.js#L42) is run over the
script's source at [resolveVariables.js:332](../../src/resolveVariables.js#L332) so
that `${snippetVar}`/`$1` resolve inside a script the way they do in an inline jsOp.

The last pass in it is the `capGroupOnly` block,
[resolveVariables.js:150-165](../../src/resolveVariables.js#L150-L165), using
[capGroupOnlyRE](../../src/regex.js#L19):

```js
exports.capGroupOnlyRE = new RegExp("(?<capGroupOnly>(?<!\\$)\\$\{(\\d)\\}|(?<!\\$)\\$(\\d))", "g");
```

Every find call site passes `groups === null`
([resolveFind:191/193](../../src/resolveVariables.js#L191),
[line.js:113](../../src/find/line.js#L113),
[line.js:320](../../src/find/line.js#L320),
[selections.js:100](../../src/find/selections.js#L100)), so the block can only ever
reach its fallthrough:

```js
else return "";     // no matching capture group
```

The `(?<!\$)` lookbehind only excludes `$$1`, not `\$1` - so `\$1` in the script
source becomes a bare `\`. On the find path this pass has **no** possible useful
outcome; it can only destroy.

[resolveVariables.js:90](../../src/resolveVariables.js#L90) already skips the
sibling `capGroupCaseModifier` pass with the comment *"caller === find caseModifier
and capGroups handled in replaceFindCaptureGroups"* - but only for the literal
`"find"` caller, not `"ignoreLineNumbers"`, and it does not cover `capGroupOnly` at
all.

## Finding 3: `\$n` -> selection text never runs on script output

`\$n` in a find means "the text of selection *n*" (that is what `preCommands:
cursorHomeSelect` in the keybinding is setting up). It is resolved by
[`replaceFindCaptureGroups()`](../../src/resolveVariables.js#L588), called from
[parseCommands.js:162-164](../../src/parseCommands.js#L162-L164):

```js
if (indexedArgs.find && /\\\$(\d+)/.test(indexedArgs.find)) {
  indexedArgs.find = await resolve.replaceFindCaptureGroups(indexedArgs.find);
}
```

That test runs on the **unresolved** find. `$${script:find_maths}$$` contains no
`\$1`, so the call is skipped - and the pass never happens again after the script
returns. Even with findings 1 and 2 fixed, the script's `\$1` would survive into the
compiled regex as a literal `\$1` (backslash-dollar-one) and match nothing.

This is the ordering asymmetry: for a literal find the substitution happens *before*
`resolveVariables`, but a script find only exists *after* it.

## Finding 4: `await` in a find script is a SyntaxError

[resolveVariables.js:257](../../src/resolveVariables.js#L257):

```js
if (caller === "run" || caller === "replace") {
  // ... sets jsOPerationHasAwait[i] by testing the SAVED script's code for /\bawait\b/
}
```

For any find caller the array stays empty, so at
[resolveVariables.js:349-354](../../src/resolveVariables.js#L349-L354) the script is
always compiled through the **sync** branch:

```js
return Function('require', 'arg', `"use strict"; ${ operation }`)(require, scriptRef.arg);
```

with no `(async function run(){ ... })()` wrapper. Any find script using `await` -
`await vscode.env.clipboard.readText()`, `await workspace.openTextDocument(...)`, etc.
- throws `SyntaxError: await is only valid in async functions`. The user's
`find_maths.js` happens not to use `await`, so this is not what bites *today*, but it
will bite the second find script anyone writes.

## Finding 5: a failing find script aborts uncleanly

[resolveVariables.js:371](../../src/resolveVariables.js#L371) sets the sentinel
`resolved = 'Error: jsOPError'`, then
[:387](../../src/resolveVariables.js#L387) throws instead of returning it.
[document.js:46](../../src/find/document.js#L46) and
[document.js:108](../../src/find/document.js#L108) test for that sentinel - dead code,
it can never be reached. `line.js`, `selections.js`, `previousNext.js` and
`findAndSelect.js` do not test for it at all, and nothing between
[`startFindInCurrentFile`](../../src/drivers.js#L19) and the throw has a `try`.

The warning message and Output-channel dump at
[:382-385](../../src/resolveVariables.js#L382-L385) do still fire, so the user is not
left completely in the dark - but the command ends in an unhandled promise rejection.

## Finding 6 (minor): `ignoreWhiteSpace` mangles a script reference

[parseCommands.js:179-182](../../src/parseCommands.js#L179-L182),
[line.js:108-111](../../src/find/line.js#L108-L111) and
[line.js:314-317](../../src/find/line.js#L314-L317) all do:

```js
args.find = args.find.replace(/\s+/g, '\\s*');
```

on the raw find. Script names may contain spaces (`$${script:open snippets}$$` is a
documented example), so `ignoreWhiteSpace` plus a script find corrupts the reference
before it is ever looked up.

---

## What already works (no change needed)

* **Completions** - [`_completeFindVariables`](../../src/completionProviders.js#L826)
  already routes through
  [`_completeReplaceJSOperation`](../../src/completionProviders.js#L807), so
  `$${script:<name>}$$` is already offered inside `"find"`.
* **Save Selected Code as Named Script** -
  [`KEY_PREFIX_RE`](../../src/scriptCommands.js#L222) already accepts a `"find":`
  prefix.
* **`${LINE_COMMENT}` etc. inside a find script** -
  [utilities.js:190](../../src/utilities.js#L190) already looks inside
  `args.find`'s script code.
* **`$` in the returned value is safe** -
  [`replaceAsync`](../../src/utilities.js#L419) splices results back with a *function*
  replacer (`() => replacements[i++]`), so `$&`/`$1`/`` $` `` in a script's return
  value are not re-interpreted by `String.replace`.
* **Escaping vs. `isRegex`** - with `"isRegex": true`
  [`adjustValueForRegex`](../../src/resolveVariables.js#L413) passes the script's
  output through untouched, and
  [`_countCaptureGroups`](../../src/resolveVariables.js#L561) correctly counts the
  groups a script generated. Without `isRegex` the output is escaped to a literal -
  which is the same rule a typed find follows, so it is consistent, just worth
  documenting.

## Summary

| # | Where | Effect |
|---|---|---|
| 1 | the user's `find_maths.js` | `'\$1'`/`'\d'` lose their backslash in JS |
| 2 | [resolveVariables.js:150](../../src/resolveVariables.js#L150) | `$n` erased from a find script's source |
| 3 | [parseCommands.js:162](../../src/parseCommands.js#L162) | `\$n` -> selection text runs too early to see script output |
| 4 | [resolveVariables.js:257](../../src/resolveVariables.js#L257) | `await` in a find script -> SyntaxError |
| 5 | [resolveVariables.js:387](../../src/resolveVariables.js#L387) | failed find script -> unhandled rejection |
| 6 | [parseCommands.js:179](../../src/parseCommands.js#L179) | `ignoreWhiteSpace` corrupts a script reference |
