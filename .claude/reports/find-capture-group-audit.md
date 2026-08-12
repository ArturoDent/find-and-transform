# Audit: `\$n` in a `find` vs `$n` in a `replace`

Investigation of two reported symptoms:

1. `"find": "\\$1 \\$1 \\$1"` + `"replace": "\\U$1"` + `"isRegex": true` replaces with
   the empty string. Removing `isRegex` makes it work.
2. `"find": "\\$1(\\d+)"` + `"replace": "\\U$1-$2"` against `const111` yields `111-`
   instead of `CONST-111`.

Both trace to the same fact: **`\$n` in a `find` is a plain text substitution and
never creates a regex capturing group.**

## The two separate `$n` namespaces

| | Find side | Replace side |
|---|---|---|
| Syntax | `\$1` (double-escaped `"\\$1"` in JSON) | `$1` / `${1}` |
| Means | the *n*th editor **selection**'s text | the *n*th **regex match group** |
| Resolved by | [replaceFindCaptureGroups](src/resolveVariables.js#L524-L547) | [_applyCaseModifier](src/resolveVariables.js#L1178-L1220) / [capGroupOnly block](src/resolveVariables.js#L150-L165) |
| When | before the regex is compiled | after `matchAll()` has run |

Nothing links the two numbering schemes - the shared digit is a coincidence of
notation, not a shared counter.

## Finding 1: the find-side substitution deliberately omits parentheses

[src/resolveVariables.js:530-544](src/resolveVariables.js#L530-L544) substitutes the
selection's text for each `\$n` and returns it bare. The wrap-in-a-group
alternative is present but commented out:

```js
// wrap each $n in a group () ?
// else return `(${_modifyCaseOfFindCaptureGroup(p1, document.getText(selections[p2 - 1]))})`;
else return _modifyCaseOfFindCaptureGroup(p1, document.getText(selections[p2 - 1]));
```

- Entry point: [parseCommands.js:161-164](src/parseCommands.js#L161-L164) gates the
  call on the find containing a double-escaped `\$n`.
- Case modifiers on the find side are applied here too, by
  [_modifyCaseOfFindCaptureGroup](src/resolveVariables.js#L556-L583).

So `"\\$1(\\d+)"` with the cursor in `const111` resolves to `const(\d+)` - one group,
which is `(\d+)`. That makes `$1` = `111` and `$2` undefined, hence `111-`.
**Symptom 2 is current-design behavior, not a defect.**

## Finding 2: a replace `$n` with no matching group silently yields `""`

Two code paths both fall back to the empty string rather than warning:

- [_applyCaseModifier](src/resolveVariables.js#L1186-L1193) - `groups[thisCapGroup]` is
  `undefined`, so `resolved` stays as the `""` passed in at
  [line 103](src/resolveVariables.js#L103), and `"".toLocaleUpperCase()` is `""`.
- [capGroupOnly handler](src/resolveVariables.js#L162-L164) - `else return "";  // no matching capture group`.

The regexes driving these live at [regex.js:18-19](src/regex.js#L18-L19).

## Finding 3: the only auto-wrap is gated on `!isRegex` - the actual bug

[adjustValueForRegex](src/resolveVariables.js#L393-L461) is the one place that
manufactures a capturing group for a groupless find:

```js
if (!isRegex && replaceValue) {          // <-- gate
  ...
  if (capGroups.length) {
    if (!ignoreWhiteSpace) findValue = findValue?.replace(/([+?$^.\\*\{\}\[\]\(\)])/g, "\\$1");
    findValue = `(${ findValue })`;
    isRegex = true;
  }
}
```

- [line 401](src/resolveVariables.js#L401) - the `!isRegex` gate.
- [line 414](src/resolveVariables.js#L414) - regex-escaping of the find (skipped when
  the user sets `isRegex` themselves).
- [line 415](src/resolveVariables.js#L415) - the whole-find wrap.

Setting `"isRegex": true` skips the entire block, so `const const const` stays
groupless and `\U$1` resolves to `""`. Omitting `isRegex` lets the block wrap the
find into `(const const const)`, giving `CONST CONST CONST`. **This is exactly the
"works without isRegex, empty with it" asymmetry in symptom 1.**

Every find path funnels through this function, so one fix covers all of them:

- [resolveFind:195](src/resolveVariables.js#L195), used by
  [document.js:41](src/find/document.js#L41),
  [findAndSelect.js:34](src/find/findAndSelect.js#L34) and
  [findAndSelect.js:81](src/find/findAndSelect.js#L81),
  [previousNext.js:39](src/find/previousNext.js#L39)
- [line.js:114](src/find/line.js#L114) and [line.js:321](src/find/line.js#L321)
- [selections.js:102](src/find/selections.js#L102)

## Finding 4: the documentation is internally inconsistent

- [README.md:398](README.md#L398) states the accurate rule - `\$n` is "**replaced in
  the find query by the first selection**".
- [README.md:394](README.md#L394) titles the section "Using numbered capture
  **groups** in a `find`", and [README.md:415](README.md#L415) comments a `\$1(\d+)\$2`
  example with `// up to 9 capture groups` - both imply `\$n` is itself a group.
- [README.md:413](README.md#L413) shows `"(\\$1|\\$2)-${lineNumber}"` with parentheses
  the user typed, which is consistent with `\$n` *not* self-wrapping.
- [README.md:1531](README.md#L1531) warns against setting `isRegex` yourself just to
  make `$1` work. Half of that warning (the silent-empty result) is Finding 3; the
  other half (skipped escaping of a generated find) remains true regardless.

## Finding 5: no regression - this never worked

`git log -S` on both mechanisms shows the substitution has returned bare text since
the function was introduced (commit `5973596`, Aug 2022), with the parenthesis
variant only ever present commented out. The `!isRegex` gate dates to commit
`908caa3` (Sep 2023) and is unchanged. None of the uncommitted working-tree changes
touch this logic - they cover path-variable forward-slashing and a new "reveal
scripts folder" command.

## Test coverage gap

No test anywhere pairs a `\$n` find with a `$n` replace. The closest existing case,
[findInCurrentFile.test.js:149-154](test/suite/findInCurrentFile/findInCurrentFile.test.js#L149-L154),
uses an explicit `"(const)"` group, and
[restrictFind.test.js:119-120](test/suite/restrictFind/restrictFind.test.js#L119-L120)
shares that same explicit-group find across every mode.
