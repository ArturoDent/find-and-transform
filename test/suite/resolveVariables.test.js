const assert = require('assert');
const resolveVariables = require('../../src/resolveVariables');

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
