const assert = require('assert');
const resolveVariables = require('../../src/resolveVariables');
const scriptStorage = require('../../src/scriptStorage');

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
});
