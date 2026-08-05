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

  test('a named script using `path.` is routed through the same Function branch as an equivalent inline jsOp', async () => {
    await scriptStorage.save('test-path-script', "return path.basename('/a/b/c.txt');");

    try {
      const result = await resolveVariables.resolveVariables(
        { replace: '$${script:test-path-script}$$' }, 'replace', [], null, null, null);

      assert.strictEqual(result, 'c.txt');
    } finally {
      await scriptStorage.delete('test-path-script');
    }
  });

  test('a reference to a script that does not exist throws a clear error', async () => {
    await assert.rejects(
      resolveVariables.resolveVariables({ replace: '$${script:does-not-exist}$$' }, 'replace', [], null, null, null),
      /No saved script named "does-not-exist"/
    );
  });
});
