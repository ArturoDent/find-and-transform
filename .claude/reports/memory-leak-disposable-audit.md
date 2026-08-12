# Memory leak / disposable audit of src/**

Scope: all 25 files under `src/**/*.js` (~7,400 lines), checked for undisposed
`vscode.Disposable`s (event listeners, providers, decoration types, watchers),
timers that aren't cleared, child processes, and module-level caches that
grow without bound.

Method: three parallel read-through passes covering (1) extension.js and
everything it wires up at activation, (2) the find/search/transform command
logic, (3) script storage/variables/utility helpers. The two findings below
were then independently re-verified by reading the source directly.

## Findings

### 1. HIGH - completion & code-action providers re-registered without disposing the previous instance

**[extension.js:192-195](../../src/extension.js#L192-L195)** and
**[extension.js:229](../../src/extension.js#L229)**, inside the
`workspace.onDidChangeConfiguration` handler
(**[extension.js:178-207](../../src/extension.js#L178-L207)**):

```js
// reload
await _loadSettingsAsCommands(context, _disposables, false);

await providers.makeKeybindingsCompletionProvider(context);
await providers.makeSettingsCompletionProvider(context);
```

`_loadSettingsAsCommands` also calls
`codeActions.makeCodeActionProvider(context, findSettings)` when
`findSettings.length` (**[extension.js:229](../../src/extension.js#L229)**).

Each of these three factory functions calls
`languages.registerCompletionItemProvider(...)` /
`languages.registerCodeActionsProvider(...)` and pushes the resulting
Disposable **only** into `context.subscriptions`:

- **[completionProviders.js:16-171](../../src/completionProviders.js#L16-L171)**
  (`makeKeybindingsCompletionProvider`, pushed at line 171)
- **[completionProviders.js:255-414](../../src/completionProviders.js#L255-L414)**
  (`makeSettingsCompletionProvider`, pushed at line 414)
- **[codeActions.js:8-27](../../src/codeActions.js#L8-L27)**
  (`makeCodeActionProvider`, pushed at line 10-26)

None of these three Disposables are captured into `_disposables` (the array
that *does* get disposed on reload, see Finding 2), and `context.subscriptions`
itself is only flushed when the whole extension deactivates. So every time
the user changes a setting under `find-and-transform.enableWarningDialog`,
`findInCurrentFile`, or `runInSearchPanel` (a normal, easily-repeated
action - e.g. adding one more custom find command), the extension leaves the
*previous* completion/code-action provider registration still live and adds
a brand new one on top of it.

Effect: duplicate completion suggestions in `keybindings.json`/`settings.json`
and duplicate lightbulb code actions, one extra copy per settings change, for
the remaining life of the VS Code window. Each provider's closure also keeps
`context` and the settings snapshot alive, so this is a genuine (if slow-growing)
memory leak, not just a UX annoyance.

### 2. MODERATE - `_disposables` array is disposed-in-place but never cleared

**[extension.js:18](../../src/extension.js#L18)** declares the module-level
array:

```js
let _disposables = [];
```

The reload handler disposes each entry but never empties the array:

```js
// easier to just dispose of them all and re-enable them all
for (let disposable of _disposables) {
  await disposable.dispose();
}                                                          // extension.js:187-189
await _loadSettingsAsCommands(context, _disposables, false);  // extension.js:192
```

`_loadSettingsAsCommands` -> `registerCommands.find`/`registerCommands.search`
then `.push()` new command Disposables onto this same array
(**[registerCommands.js:298](../../src/registerCommands.js#L298)** and
**[registerCommands.js:322](../../src/registerCommands.js#L322)**) without
ever resetting it first (no `_disposables.length = 0` / reassignment
anywhere).

Effect: `_disposables` grows by one stale (already-disposed) reference per
old command on every relevant settings change, compounding indefinitely. The
individual command registrations themselves *are* correctly disposed (this
part works), so the practical impact is just accumulating dead references in
one array - low severity on its own, but it compounds with Finding 1 since
both are triggered by the same reload path.

## What's handled correctly (verified, not just re-checked)

- `outputChannel.js` - singleton pattern, `dispose()` resets the module
  export to `undefined`, called at both activate and deactivate.
- Command registrations from `registerCommands.find`/`.search`
  (`findInCurrentFile.*`, `runInSearchPanel.*`) - pushed to both
  `context.subscriptions` and `_disposables`, and are actually disposed on
  reload via the loop at extension.js:187-189.
- The one-shot context-menu commands (`searchInFolder`, `searchInFile`,
  `searchInResults`, `findInCurrentFile`, `runInSearchPanel`,
  `openReadmeAnchor`, the `scriptCommands.*` set, and
  `workspace.onDidSaveTextDocument`) are all registered exactly once at
  activation and pushed to `context.subscriptions` - correct, since they
  don't need to survive a settings reload.
- `find/**`, `search.js`, `transform.js`, `regex.js` - no event
  subscriptions, decoration types, or unbounded module-level caches anywhere
  in this group. The one `setTimeout` in `search.js` (~line 252,
  `search.action.replaceAll`) is fire-and-forget but self-resolving with a
  small closure - not an accumulating leak.
- `scriptStorage.js`, `scriptCommands.js`, `resolveVariables.js`,
  `utilities.js`, and the rest of the third group - no file watchers, no
  child processes, no `require()`-based script loading (scripts run via
  `Function()` instead, sidestepping Node's require-cache staleness), and no
  growing in-memory caches. Clipboard save/restore in
  `utilities.getSearchResultsFiles` is symmetric on both success and failure
  paths.
- No `setInterval`, `EventEmitter`, `createTextEditorDecorationType`,
  `createFileSystemWatcher`, or `child_process.*` usage anywhere in
  `src/**`.

## Not included above

Nothing else rose above theoretical/negligible (e.g. per-call regex
construction, a nested function re-declared per invocation) - those are
normal V8 allocations that are immediately GC-eligible, not leaks.
