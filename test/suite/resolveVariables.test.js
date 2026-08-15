const assert = require('assert');
const vscode = require('vscode');
const resolveVariables = require('../../src/resolveVariables');
const scriptStorage = require('../../src/scriptStorage');
const testHelpers = require('./testHelpers');

suite('resolveVariables.js - resolveExtensionDefinedVariables()', () => {

  test('returns the empty string unchanged (fast path)', async () => {
    const result = await resolveVariables.resolveExtensionDefinedVariables('', {}, 'find');
    assert.strictEqual(result, '');
  });

  test('returns undefined for a null replaceValue (explicit widened return)', async () => {
    const result = await resolveVariables.resolveExtensionDefinedVariables(null, {}, 'find');
    assert.strictEqual(result, undefined);
  });

  // regression: replaceValue.match(re) is null for any non-matching string, and the
  // old code did found.groups.caseModifier unconditionally -> TypeError
  test('REGRESSION: an ordinary string with no extension-defined variable no longer throws, and is returned unchanged', async () => {
    let result;
    await assert.doesNotReject(async () => {
      result = await resolveVariables.resolveExtensionDefinedVariables('hello world', {}, 'find');
    });
    assert.strictEqual(result, 'hello world');
  });

  test('REGRESSION: a string containing an ordinary (non-extension) ${...} variable no longer throws', async () => {
    let result;
    await assert.doesNotReject(async () => {
      result = await resolveVariables.resolveExtensionDefinedVariables('some ${notAnExtensionVar} text', {}, 'replace');
    });
    assert.strictEqual(result, 'some ${notAnExtensionVar} text');
  });
});


suite('resolveVariables.js - $${script:name}$$ named scripts', () => {

  test('resolves a $${script:name}$$ reference the same as the equivalent inline jsOp', async () => {
    await scriptStorage.save('test-plain-script', "return 'hello ' + 'world';");

    try {
      const inline = await resolveVariables.resolveVariables(
        { replace: "$${ return 'hello ' + 'world'; }$$" }, 'replace', [], null, null, null);
      const named = await resolveVariables.resolveVariables(
        { replace: '$${script:test-plain-script}$$' }, 'replace', [], null, null, null);

      assert.strictEqual(named, 'hello world');
      assert.strictEqual(named, inline);
    } finally {
      await scriptStorage.delete('test-plain-script');
    }
  });

  test('resolveJSOperations() (used directly by runInSearchPanel) resolves a $${script:name}$$ reference the same as resolveVariables()', async () => {
    await scriptStorage.save('test-plain-script', "return 'hello ' + 'world';");

    try {
      const viaResolveVariables = await resolveVariables.resolveVariables(
        { replace: '$${script:test-plain-script}$$' }, 'replace', [], null, null, null);
      const viaResolveJSOperations = await resolveVariables.resolveJSOperations(
        '$${script:test-plain-script}$$', {}, 'replace', [], null, null, null);

      assert.strictEqual(viaResolveJSOperations, 'hello world');
      assert.strictEqual(viaResolveJSOperations, viaResolveVariables);
    } finally {
      await scriptStorage.delete('test-plain-script');
    }
  });

  test('a named script that require()s its own `path` module resolves correctly', async () => {
    await scriptStorage.save('test-path-script', "const path = require('path');\nreturn path.basename('/a/b/c.txt');");

    try {
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:test-path-script}$$' }, 'replace', [], null, null, null);

      assert.strictEqual(result, 'c.txt');
    } finally {
      await scriptStorage.delete('test-path-script');
    }
  });

  test('REGRESSION: a script that require()s vscode itself does not throw a parameter-redeclaration SyntaxError', async () => {
    await scriptStorage.save('test-require-vscode-script', "const vscode = require('vscode');\nreturn typeof vscode.window;");

    try {
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:test-require-vscode-script}$$' }, 'replace', [], null, null, null);

      assert.strictEqual(result, 'object');
    } finally {
      await scriptStorage.delete('test-require-vscode-script');
    }
  });

  test('a reference to a script that does not exist throws a clear error', async () => {
    await assert.rejects(
      resolveVariables.resolveVariables({ replace: '$${script:does-not-exist}$$' }, 'replace', [], null, null, null),
      /No saved script named "does-not-exist"/
    );
  });

  test('REGRESSION: a named script resolves capture groups ($1) just like an equivalent inline jsOp', async () => {
    await scriptStorage.save('test-capture-group-script', "return '$1'.toLocaleUpperCase();");

    try {
      const groups = ['trouble', 'trouble'];
      const inline = await resolveVariables.resolveVariables(
        { replace: "$${ return '$1'.toLocaleUpperCase(); }$$" }, 'replace', groups, null, null, null);
      const named = await resolveVariables.resolveVariables(
        { replace: '$${script:test-capture-group-script}$$' }, 'replace', groups, null, null, null);

      assert.strictEqual(named, 'TROUBLE');
      assert.strictEqual(named, inline);
    } finally {
      await scriptStorage.delete('test-capture-group-script');
    }
  });

  test('REGRESSION: a $1 inside a named script auto-escapes the generated find and sets isRegex, without needing isRegex set explicitly', async () => {
    await scriptStorage.save('test-capgroup-find-script', "return '$1'.toLocaleUpperCase();");

    try {
      // a whole line of code, containing regex-special characters like ( ) . ;
      const line = "const x = getValue(y);";

      const result = await resolveVariables.adjustValueForRegex(
        line, '$${script:test-capgroup-find-script}$$', false, false, false, true);

      assert.strictEqual(result.isRegex, true);

      // the generated find must still literally match the original line -
      // proving the special characters were escaped, not left as live regex syntax
      const re = new RegExp(result.findValue);
      const match = re.exec(line);
      assert.ok(match, `expected "${ result.findValue }" to match "${ line }"`);
      assert.strictEqual(match[0], line);
    } finally {
      await scriptStorage.delete('test-capgroup-find-script');
    }
  });

  test('REGRESSION: ${BLOCK_COMMENT_START}/${BLOCK_COMMENT_END} resolve inside a named script exactly like an equivalent inline jsOp', async () => {
    const code = "return '${BLOCK_COMMENT_START}' + '$1' + '${BLOCK_COMMENT_END}';";
    await scriptStorage.save('test-block-comment-script', code);

    try {
      const groups = ['trouble', 'trouble'];
      const inline = await resolveVariables.resolveVariables(
        { replace: `$\${ ${ code } }$$` }, 'replace', groups, null, null, null);
      const named = await resolveVariables.resolveVariables(
        { replace: '$${script:test-block-comment-script}$$' }, 'replace', groups, null, null, null);

      // both must resolve identically, whatever this test environment's active
      // language's block comment tokens happen to be (including "" if undefined) -
      // the point is the named-script path is no longer stuck at "" unconditionally
      assert.strictEqual(named, inline);
    } finally {
      await scriptStorage.delete('test-block-comment-script');
    }
  });

  test('$${script:name(arg)}$$ exposes the argument as `arg` inside the script', async () => {
    await scriptStorage.save('test-arg-script', "return arg.toLocaleUpperCase();");

    try {
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:test-arg-script(hello)}$$' }, 'replace', [], null, null, null);

      assert.strictEqual(result, 'HELLO');
    } finally {
      await scriptStorage.delete('test-arg-script');
    }
  });

  test('REGRESSION: $${script:name}$$ with no parentheses still resolves, with `arg` undefined', async () => {
    await scriptStorage.save('test-no-arg-script', "return typeof arg;");

    try {
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:test-no-arg-script}$$' }, 'replace', [], null, null, null);

      assert.strictEqual(result, 'undefined');
    } finally {
      await scriptStorage.delete('test-no-arg-script');
    }
  });

  test('the argument in $${script:name($1)}$$ is resolved through the normal pipeline before the script runs', async () => {
    await scriptStorage.save('test-resolved-arg-script', "return arg.toLocaleUpperCase();");

    try {
      const groups = ['trouble', 'trouble'];
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:test-resolved-arg-script($1)}$$' }, 'replace', groups, null, null, null);

      assert.strictEqual(result, 'TROUBLE');
    } finally {
      await scriptStorage.delete('test-resolved-arg-script');
    }
  });

  // A .js script file is read as raw text (not JSON-parsed like a keybinding value), so a
  // double-escaped '\\U' really does arrive with both backslashes. Matching only one used
  // to strand the other in the generated source, where JS read it as an escape: dropped
  // before an uppercase letter, but a newline before 'n' and a SyntaxError before 'u'.
  test('a double-escaped \\\\U case modifier in a script resolves the same as the single-backslash form', async () => {
    await scriptStorage.save('test-single-backslash', "return '\\U$1';");
    await scriptStorage.save('test-double-backslash', "return '\\\\U$1';");

    try {
      const groups = ['trouble', 'trouble'];
      const single = await resolveVariables.resolveVariables(
        { replace: '$${script:test-single-backslash}$$' }, 'replace', groups, null, null, null);
      const double = await resolveVariables.resolveVariables(
        { replace: '$${script:test-double-backslash}$$' }, 'replace', groups, null, null, null);

      assert.strictEqual(single, 'TROUBLE');
      assert.strictEqual(double, single);
    } finally {
      await scriptStorage.delete('test-single-backslash');
      await scriptStorage.delete('test-double-backslash');
    }
  });

  // '\l' lowercases the first letter, so the stranded backslash used to land in front of a
  // lowercase 'u' -> 'SyntaxError: Invalid Unicode escape sequence', not a silent mangle
  test('REGRESSION: a double-escaped \\\\l case modifier no longer throws an Invalid Unicode escape', async () => {
    await scriptStorage.save('test-double-backslash-lower', "return '\\\\l$1';");

    try {
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:test-double-backslash-lower}$$' }, 'replace', ['Under', 'Under'], null, null, null);

      assert.strictEqual(result, 'under');
    } finally {
      await scriptStorage.delete('test-double-backslash-lower');
    }
  });

  test('one shared script returns different values for two find/replace pairs via arg', async () => {
    await scriptStorage.save('test-shared-script', "if (arg === 'function') return 'first thing'; else if (arg === 'alpha') return 'second thing'; else return 'unknown';");

    try {
      const firstPair = await resolveVariables.resolveVariables(
        { replace: '$${script:test-shared-script($1)}$$' }, 'replace', ['function', 'function'], null, null, null);
      const secondPair = await resolveVariables.resolveVariables(
        { replace: '$${script:test-shared-script($1)}$$' }, 'replace', ['alpha', 'alpha'], null, null, null);

      assert.strictEqual(firstPair, 'first thing');
      assert.strictEqual(secondPair, 'second thing');
    } finally {
      await scriptStorage.delete('test-shared-script');
    }
  });

  test('REGRESSION: a script name containing a space still resolves correctly with no parentheses', async () => {
    await scriptStorage.save('open snippets', "return 'opened';");

    try {
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:open snippets}$$' }, 'replace', [], null, null, null);

      assert.strictEqual(result, 'opened');
    } finally {
      await scriptStorage.delete('open snippets');
    }
  });

  // A script file holds raw code, not JSON, so a case modifier takes ONE
  // backslash there (\U$1) where a keybinding needs two ("\\U$1"). Arithmetic
  // has to sit outside the quotes/backticks - a bare $n is substituted as raw
  // source text, so it can be used as a number.
  test('a case modifier and bare-$n arithmetic resolve inside a named script', async () => {
    await scriptStorage.save('test-case-math-script', "return `\\U$1 ` + ($2 * 3);");

    try {
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:test-case-math-script}$$' }, 'replace', ['other 123', 'other', '123'], null, null, null);

      assert.strictEqual(result, 'OTHER 369');
    } finally {
      await scriptStorage.delete('test-case-math-script');
    }
  });

  test('putting the arithmetic inside the backticks makes it literal text, not a calculation', async () => {
    await scriptStorage.save('test-inside-ticks-script', "return `\\U$1 $2*3`;");

    try {
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:test-inside-ticks-script}$$' }, 'replace', ['other 123', 'other', '123'], null, null, null);

      assert.strictEqual(result, 'OTHER 123*3');
    } finally {
      await scriptStorage.delete('test-inside-ticks-script');
    }
  });

  test('a script that fails to compile reports the resolved code, and names the script', async () => {
    // missing the '+' operator, so the resolved source is a syntax error
    await scriptStorage.save('test-bad-syntax-script', "return '$1' $2 * 3;");

    try {
      await assert.rejects(
        resolveVariables.resolveVariables(
          { replace: '$${script:test-bad-syntax-script}$$' }, 'replace', ['other 123', 'other', '123'], null, null, null),
        (/** @type {Error} */ error) => {
          assert.match(error.message, /SyntaxError/);
          // the point of the fix: the post-substitution source is shown, so the
          // missing operator is visible rather than just "Unexpected number"
          assert.match(error.message, /return 'other' 123 \* 3;/);
          assert.match(error.message, /named script "test-bad-syntax-script"/);
          return true;
        }
      );
    } finally {
      await scriptStorage.delete('test-bad-syntax-script');
    }
  });

  // A script file is raw text: without comment-masking, a '\U$1'/'${...}' mentioned in a
  // '// ...' line gets silently resolved like live code would - and a variable that shows
  // a real UI prompt (${getInput}) would pop it for a comment that never executes. Proven
  // here via the syntax-error reporting path (deterministic, no real UI involved) rather
  // than by actually invoking ${getInput}, since a masking regression would otherwise hang
  // the test run waiting on a real input box instead of failing cleanly.
  test('a capture-group reference mentioned in a script comment is left unresolved, not silently rewritten', async () => {
    // the comment mentions \U$1 (which real code below it does NOT use); the actual code
    // is deliberately invalid so the post-substitution source shows up in the error
    await scriptStorage.save('test-comment-not-resolved',
      '// could write \\U$1 here, should stay exactly as written\nsyntax( error here;');

    try {
      await assert.rejects(
        resolveVariables.resolveVariables(
          { replace: '$${script:test-comment-not-resolved}$$' }, 'replace', ['World', 'World'], null, null, null),
        (/** @type {Error} */ error) => {
          // the comment survives verbatim - proves it was masked out of the variable pass
          assert.match(error.message, /could write \\U\$1 here, should stay exactly as written/);
          // and definitely wasn't resolved to the uppercased capture group
          assert.doesNotMatch(error.message, /could write WORLD here/);
          return true;
        }
      );
    } finally {
      await scriptStorage.delete('test-comment-not-resolved');
    }
  });

  test('a comment mentioning capture-group syntax does not interfere with real code using the same capture group', async () => {
    await scriptStorage.save('test-comment-alongside-real-capture-group',
      "// example: could write \\U$1 here, but this uses $1 directly instead\nreturn '$1'.toUpperCase();");

    try {
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:test-comment-alongside-real-capture-group}$$' }, 'replace', ['hello', 'hello'], null, null, null);

      assert.strictEqual(result, 'HELLO');
    } finally {
      await scriptStorage.delete('test-comment-alongside-real-capture-group');
    }
  });
});


suite('resolveVariables.js - inline $${ ... }$$ jsOps', () => {

  test('REGRESSION: an inline await jsOp referencing vscode. resolves its real value, not the string "undefined"', async () => {
    const result = await resolveVariables.resolveVariables(
      { replace: "$${ await new Promise(r => setTimeout(r, 1)); return typeof vscode.window; }$$" },
      'replace', [], null, null, null);

    assert.strictEqual(result, 'object');
  });

  test('an inline await jsOp referencing path. also resolves its real value', async () => {
    const result = await resolveVariables.resolveVariables(
      { replace: "$${ await new Promise(r => setTimeout(r, 1)); return path.basename('/a/b/c.txt'); }$$" },
      'replace', [], null, null, null);

    assert.strictEqual(result, 'c.txt');
  });

  test('an inline await jsOp referencing neither vscode. nor path. still resolves its real value', async () => {
    const result = await resolveVariables.resolveVariables(
      { replace: "$${ await new Promise(r => setTimeout(r, 1)); return 42; }$$" },
      'replace', [], null, null, null);

    assert.strictEqual(result, '42');
  });

  test('an inline jsOp that fails to compile reports the resolved code, without claiming to be a script', async () => {
    await assert.rejects(
      resolveVariables.resolveVariables(
        { replace: "$${ return '$1' $2 * 3; }$$" }, 'replace', ['other 123', 'other', '123'], null, null, null),
      (/** @type {Error} */ error) => {
        assert.match(error.message, /SyntaxError/);
        assert.match(error.message, /return 'other' 123 \* 3;/);
        assert.match(error.message, /resolved jsOperation code that failed/);
        return true;
      }
    );
  });

  // capGroupCaseModifierRE's brace-pairing bug (regex.js) isn't specific to
  // conditionals - a bare \U$1 immediately before ANY "}", including a
  // jsOp's own closing "}$$" delimiter, used to swallow that brace too and
  // corrupt the delimiter. No backticks or quotes involved, so the fix that
  // paired the braces (rather than leaving them independently optional)
  // fixes this the same way it fixes ${1:+\U$1}.
  test('a case-modified group immediately before an inline jsOp\'s own closing "}$$" resolves without corrupting the delimiter', async () => {
    const result = await resolveVariables.resolveVariables(
      { replace: "$${ return \\U$1}$$" }, 'replace', ['5', '5'], null, null, null);

    assert.strictEqual(result, '5');
  });

  // Same underlying bug, the (?!:) lookahead side: a bare \U$1 immediately
  // followed by a literal ":" (a ternary or object-literal key, not a
  // conditional's if/else divider) used to be skipped by
  // capGroupCaseModifierRE entirely, leaving "\U" as literal text next to
  // the un-cased value - here that stray "\U5" would be a SyntaxError.
  test('a case-modified group immediately before a literal ":" (e.g. a ternary) resolves the case modifier instead of leaving it as literal text', async () => {
    const result = await resolveVariables.resolveVariables(
      { replace: "$${ return true ? \\U$1:\\U$2; }$$" }, 'replace', ['5 7', '5', '7'], null, null, null);

    assert.strictEqual(result, '5');
  });
});


// When a findInCurrentFile command has no 'find', makeFind() derives one from
// the cursor: on a word it uses the word, on an empty line it falls back to
// '^$', and - the previously-untested case - anywhere else on a non-empty
// line (whitespace/punctuation, touching no word) it leaves find as "" and
// records the cursor in emptyPointSelections instead, so callers can treat it
// as a zero-width point rather than a real match.
suite('resolveVariables.js - makeFind() cursor-not-on-a-word fallback', () => {

  let document;
  let editor;

  suiteSetup(async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('ArturoDent.find-and-transform');
    if (extension && !extension.isActive) await extension.activate();

    // A genuinely separate untitled scratch document - see the identical note
    // in findInCurrentFile.test.js for why this can't be a real fixture file.
    document = await vscode.workspace.openTextDocument({ content: '' });
    editor = await vscode.window.showTextDocument(document, { preview: false });
  });

  suiteTeardown(async () => {
    // Deliberately not reverting/closing here: `document` is an untitled scratch
    // doc with unsaved content by now - closing it would prompt "Save changes?".
    // The whole VS Code test instance is torn down non-interactively once Mocha
    // finishes.
  });

  /**
   * Load marked text (see testHelpers.parseSelectionMarkers) into the shared
   * document and set editor.selections to the selection(s) its markers described.
   * @param {string} markedText
   * @returns {Promise<{ text: string, selections: import("vscode").Selection[] }>}
   */
  async function loadMarkedContent(markedText) {
    const { text, selections } = testHelpers.parseSelectionMarkers(markedText);
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    await editor.edit(editBuilder => editBuilder.replace(fullRange, text));
    editor.selections = selections;
    return { text, selections };
  }

  /**
   * Poll the shared document's text until it matches expectedText or timeoutMs
   * elapses, then assert. Guards against the same command-completion timing
   * issue noted in findInCurrentFile.test.js/restrictFind.test.js.
   * @param {string} expectedText
   * @param {number} [timeoutMs]
   */
  async function assertEventualText(expectedText, timeoutMs = 3000) {
    let actualText = document.getText();
    const deadline = Date.now() + timeoutMs;

    while (actualText !== expectedText && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      actualText = document.getText();
    }

    assert.strictEqual(actualText, expectedText);
  }

  // "aaa" and "bbb" each stay 2+ characters away from the marked cursor, so
  // it touches no word on either side - only whitespace - while sitting on a
  // non-empty line (unlike the existing '^$'-on-an-empty-line coverage).
  const markedLine = 'aaa  |  bbb';

  test('find stays empty and the cursor is recorded in emptyPointSelections, not "^$"', async () => {
    await loadMarkedContent(markedLine);

    const result = await resolveVariables.makeFind(editor.selections, {});

    assert.strictEqual(result.find, '');
    assert.strictEqual(result.mustBeRegex, false);
    assert.deepStrictEqual([...result.emptyPointSelections], [editor.selections[0]]);
  });

  test('no find, no replace: findInCurrentFile is a silent no-op', async () => {
    const { text, selections } = await loadMarkedContent(markedLine);

    await vscode.commands.executeCommand('findInCurrentFile', {});

    await assertEventualText(text);
    assert.deepStrictEqual([...editor.selections], selections);
  });

  test('no find, with replace: the replace text is inserted at the cursor as a zero-width point match', async () => {
    const { text, selections } = await loadMarkedContent(markedLine);
    const offset = selections[0].start.character;

    await vscode.commands.executeCommand('findInCurrentFile', { replace: 'XYZ' });

    await assertEventualText(text.slice(0, offset) + 'XYZ' + text.slice(offset));
  });
});
