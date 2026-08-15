# Why `${1:+\U$1}` breaks in `findInCurrentFile` replace

## Symptom

Keybinding:

```jsonc
{
  "key": "alt+r",
  "command": "findInCurrentFile",
  "args": {
    "find": "(matched)",
    "replace": "${1:+\\U$1}",
    "isRegex": true
  }
}
```

Expected `matched` -> `MATCHED`. Actual output leaves a mangled, unbalanced
string in the document (literal `${1:+` glued to `MATCHED`, with the
conditional's closing `}` gone) instead of the expected `MATCHED`.

Conditional transforms (`${1:+...}`) themselves **are** supported by the
extension - the bug is a regex-ordering interaction, not a missing feature.

## Root cause

[src/resolveVariables.js:106-121](../../src/resolveVariables.js#L106-L121)
runs the case-modifier/capture-group pass **before** the conditional pass
([src/resolveVariables.js:141-156](../../src/resolveVariables.js#L141-L156)):

```js
if (caller !== "find" && caller !== "snippet") {
  re = regexp.capGroupCaseModifierRE;                 // runs 1st
  ...
}
...
re = regexp.caseTransformRE;                            // runs 2nd
...
re = regexp.conditionalRE;                               // runs 3rd
```

The case-modifier regex at
[src/regex.js:28](../../src/regex.js#L28):

```js
exports.capGroupCaseModifierRE =
  new RegExp("(?<caseModifier>\\\\{1,2}[UuLl])(?<capGroup>\\$\\{?\\d(?!:)\\}?)", "g");
```

has an **optional trailing `\}?`**. In `${1:+\U$1}`, that optional `}` is
actually the *conditional's own closing brace* - but the case-modifier regex
greedily swallows it as if it were part of `\U$1`. So it matches `\U$1}` (5
chars) instead of stopping at `\U$1` (4 chars), and replaces the whole thing
with `MATCHED`, leaving the string as `${1:+MATCHED` - permanently missing
its closing brace.

By the time the conditional pass
([src/resolveVariables.js:146](../../src/resolveVariables.js#L146),
[src/regex.js:33](../../src/regex.js#L33)) runs, it requires a literal
trailing `}` to match at all - which no longer exists - so it can never fire.
`${1:+` is left as inert literal text, and that whole string is inserted
verbatim into the document by
[src/find/document.js:140-144](../../src/find/document.js#L140-L144)
(no further reinterpretation happens downstream).

**Trigger condition:** only when a bare, non-backtick-wrapped case-modified
capture group (`\U$1`, `\L$2`, etc.) is the *very last thing* before a
conditional's closing `}` - i.e., nothing between `$1` and `}`.

Verified via the actual regex objects:

| Input | Result |
|---|---|
| `${1:+\U$1}` | broken: `${1:+MATCHED` (bug) |
| `` ${2:+abcd `\U$2` efgh} `` | works, but literal backticks survive in output (documented/expected quirk, see [findInCurrentFile.test.js:719-730](../../test/suite/findInCurrentFile/findInCurrentFile.test.js#L719-L730)) |
| `\U${1:+aaa-bbb}` (case modifier before the whole conditional) | works correctly - `capGroupCaseModifierRE`'s `(?!:)` lookahead excludes this shape entirely |

## What's actually documented/supported

[README.md:976-1023](../../README.md#L976-L1023) - "Conditional replacements
in `findInCurrentFile` commands or keybindings":

- Capture-group references *inside* conditional text must be backtick-wrapped:
  `` ${2:+abcd `\U$2` efgh} `` ([README.md:998](../../README.md#L998)).
- To case-transform the **entire** conditional result, put the case modifier
  **before** the `${...}`: `"replace": "\\U${1:+aaa-bbb}"`
  ([README.md:1003](../../README.md#L1003)).
- A literal `}` inside conditional text must be double-escaped: `\\}`
  ([README.md:1001](../../README.md#L1001), [README.md:1022](../../README.md#L1022)).

The exact pattern the user tried - a bare `\U$1` immediately before a
conditional's closing `}` - is not a documented syntax, and is exactly the
shape that triggers the brace-swallowing bug. No existing test in
[test/suite/findInCurrentFile/findInCurrentFile.test.js](../../test/suite/findInCurrentFile/findInCurrentFile.test.js)
covers this specific combination.

## Immediate workaround (no code change)

```jsonc
"replace": "\\U${1:+$1}"
```

Move the `\U` case modifier in front of the whole `${1:+...}` conditional
instead of inside it. This is the documented, already-working pattern
([README.md:1003](../../README.md#L1003)) and produces `MATCHED` correctly.
