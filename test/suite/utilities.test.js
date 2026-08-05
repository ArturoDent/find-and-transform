const assert = require('assert');
const { Position, Selection } = require('vscode');
const utilities = require('../../src/utilities');

suite('utilities.js - getSelectionToReveal()', () => {

  const sel1 = new Selection(new Position(1, 0), new Position(1, 5));
  const sel2 = new Selection(new Position(3, 0), new Position(3, 5));
  const sel3 = new Selection(new Position(7, 0), new Position(7, 5));
  const foundSelections = [sel1, sel2, sel3];

  test('returns the only selection when foundSelections.length === 1, regardless of whichReveal', async () => {
    const only = [sel2];
    const result = await utilities.getSelectionToReveal(only, new Position(0, 0), 'bogus');
    assert.strictEqual(result, sel2);
  });

  test('whichReveal === "first" returns foundSelections[0]', async () => {
    const result = await utilities.getSelectionToReveal(foundSelections, new Position(0, 0), 'first');
    assert.strictEqual(result, sel1);
  });

  test('whichReveal === "last" returns the last selection', async () => {
    const result = await utilities.getSelectionToReveal(foundSelections, new Position(0, 0), 'last');
    assert.strictEqual(result, sel3);
  });

  test('whichReveal === "next" returns the first selection after the cursor', async () => {
    const cursorPosition = new Position(5, 0);   // between sel2 (line 3) and sel3 (line 7)
    const result = await utilities.getSelectionToReveal(foundSelections, cursorPosition, 'next');
    assert.strictEqual(result, sel3);
  });

  test('whichReveal === "next" wraps around to foundSelections[0] when cursor is after all selections', async () => {
    const cursorPosition = new Position(20, 0);
    const result = await utilities.getSelectionToReveal(foundSelections, cursorPosition, 'next');
    assert.strictEqual(result, sel1);
  });

  // regression: a truthy-but-unrecognized whichReveal used to fall through with an
  // implicit `undefined` return (the TS "missing return statement" error)
  test('REGRESSION: an unrecognized whichReveal value no longer returns undefined/null', async () => {
    const result = await utilities.getSelectionToReveal(foundSelections, new Position(0, 0), 'bogusRevealValue');
    assert.notStrictEqual(result, null);
    assert.notStrictEqual(result, undefined);
    assert.strictEqual(result, sel1);
    assert.doesNotThrow(() => {
      const { start, end } = result;
      assert.ok(start && end);
    });
  });

  // regression: a falsy whichReveal used to explicitly `return null`
  test('REGRESSION: whichReveal === undefined no longer returns null', async () => {
    const result = await utilities.getSelectionToReveal(foundSelections, new Position(0, 0), undefined);
    assert.notStrictEqual(result, null);
    assert.strictEqual(result, sel1);
  });
});


suite('utilities.js - checkArgs()', () => {

  // key/value shapes taken from src/args/findOptions.js's getKeys()/getValues()

  test('recognized fromWhere ("findBinding") with fully valid args returns {}', async () => {
    const args = { title: 'My Command', find: 'foo', isRegex: true };
    const result = await utilities.checkArgs(args, 'findBinding');
    assert.deepStrictEqual(result, {});
  });

  test('recognized fromWhere ("findBinding") still flags a bad key and a bad value', async () => {
    const args = { title: 'My Command', notAKey: 'oops', isRegex: 'yes' };  // isRegex should be boolean
    const result = await utilities.checkArgs(args, 'findBinding');
    assert.strictEqual(result.fromWhere, 'findBinding');
    assert.deepStrictEqual(result.badKeys, ['notAKey']);
    assert.deepStrictEqual(result.badValues, [{ isRegex: 'yes' }]);
  });

  // regression: goodKeys/goodValues used to be `undefined` for any other fromWhere,
  // throwing inside Object.keys(args).filter(...) / for...of goodKeys
  test('REGRESSION: an unrecognized fromWhere no longer throws, and reports every key as bad', async () => {
    // an unhandled rejection here would already fail this test, so no doesNotReject wrapper is needed
    const args = { title: 'x', find: 'y' };
    const result = await utilities.checkArgs(args, 'someTypoedFromWhere');
    assert.strictEqual(result.fromWhere, 'someTypoedFromWhere');
    assert.deepStrictEqual(result.badKeys.sort(), ['find', 'title']);
    assert.deepStrictEqual(result.badValues, []);
  });

  test('REGRESSION: an unrecognized fromWhere with empty args no longer throws, and returns {}', async () => {
    const result = await utilities.checkArgs({}, 'someTypoedFromWhere');
    assert.deepStrictEqual(result, {});
  });
});
