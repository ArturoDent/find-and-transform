const assert = require('assert');
const parseCommands = require('../../src/parseCommands');

suite('parseCommands.js - buildJSOperationsFromArgs()', () => {

  test('a // comment element does not swallow a later return statement', async () => {
    const args = [
      "",
      "$${",
      "// some comment",
      "return $1 + '\"qrs\"';",
      "}$$"
    ];
    const result = await parseCommands.buildJSOperationsFromArgs(args);
    assert.strictEqual(result.length, 2);
    assert.ok(result[1].includes("return $1 + '\"qrs\"';"), `expected the return statement to survive, got: ${result[1]}`);
  });

  test('a /* block comment */ element survives in the joined output', async () => {
    const args = [
      "$${",
      "/* keep me */",
      "return 1;",
      "}$$"
    ];
    const result = await parseCommands.buildJSOperationsFromArgs(args);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].includes('/* keep me */'));
    assert.ok(result[0].includes('return 1;'));
  });

  test('a // inside a string literal element is not stripped', async () => {
    const args = [
      "$${",
      "return 'http://example.com';",
      "}$$"
    ];
    const result = await parseCommands.buildJSOperationsFromArgs(args);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].includes("return 'http://example.com';"));
  });

  test('regression: a comment-free array-form jsOp still flattens to one space-joined element', async () => {
    const args = [
      "$${",
      "let a = 10;",
      "return 'howdy';",
      "}$$"
    ];
    const result = await parseCommands.buildJSOperationsFromArgs(args);
    assert.deepStrictEqual(result, [
      "$${ let a = 10; return 'howdy'; }$$"
    ]);
  });
});
