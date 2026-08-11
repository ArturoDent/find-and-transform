const assert = require('assert');
const jsComments = require('../../src/jsComments');

suite('jsComments.js - findCommentRanges()', () => {

  test('finds a // line comment', () => {
    const code = '// ${getInput} here\nreturn 1;';
    const ranges = jsComments.findCommentRanges(code);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(code.slice(ranges[0].start, ranges[0].end), '// ${getInput} here');
  });

  test('finds a /* */ block comment', () => {
    const code = '/* ${getInput} */ return 1;';
    const ranges = jsComments.findCommentRanges(code);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(code.slice(ranges[0].start, ranges[0].end), '/* ${getInput} */');
  });

  test('an unterminated line comment runs to end of string when there is no trailing newline', () => {
    const code = 'return 1; // trailing, no newline';
    const ranges = jsComments.findCommentRanges(code);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(code.slice(ranges[0].start, ranges[0].end), '// trailing, no newline');
  });

  test('REGRESSION: "//" inside a double-quoted string is not a comment', () => {
    const code = 'const u = "https://example.com"; return u;';
    assert.deepStrictEqual(jsComments.findCommentRanges(code), []);
  });

  test('REGRESSION: "//" inside a single-quoted string is not a comment', () => {
    const code = "const s = '// not a comment'; return s;";
    assert.deepStrictEqual(jsComments.findCommentRanges(code), []);
  });

  test('REGRESSION: "//" inside a template literal is not a comment', () => {
    const code = 'const u = `https://example.com`; return u;';
    assert.deepStrictEqual(jsComments.findCommentRanges(code), []);
  });

  test('REGRESSION: "//" inside a regex literal is not a comment', () => {
    const code = 'const re = /a\\/\\/b/; return re.source;';
    assert.deepStrictEqual(jsComments.findCommentRanges(code), []);
  });

  test('a real comment after a regex literal (division vs regex disambiguation) is still found', () => {
    const code = 'const x = 10 / 2 / 1; // ${getInput}\nreturn x;';
    const ranges = jsComments.findCommentRanges(code);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(code.slice(ranges[0].start, ranges[0].end), '// ${getInput}');
  });

  test('a comment after a template literal with a ${...} expression is still found', () => {
    const code = 'const t = `x${1 + 1}y`; // ${getInput}\nreturn t;';
    const ranges = jsComments.findCommentRanges(code);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(code.slice(ranges[0].start, ranges[0].end), '// ${getInput}');
  });

  test('a block comment inside a template literal\'s ${...} expression is found', () => {
    const code = 'const t = `x${ /* ${getInput} */ 1 }y`; return t;';
    const ranges = jsComments.findCommentRanges(code);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(code.slice(ranges[0].start, ranges[0].end), '/* ${getInput} */');
  });

  test('no comments at all returns an empty array', () => {
    assert.deepStrictEqual(jsComments.findCommentRanges('return "${getInput}";'), []);
  });

  test('empty/falsy input returns an empty array', () => {
    assert.deepStrictEqual(jsComments.findCommentRanges(''), []);
  });
});


suite('jsComments.js - maskComments() / restoreComments()', () => {

  test('round-trips arbitrary code back to itself exactly', () => {
    const code = '// ${getInput} explanation\nconst re = /a\\/b/; // trailing\nreturn `x${1 + 1}y`; /* note */';
    const { masked, comments } = jsComments.maskComments(code);
    assert.notStrictEqual(masked, code);   // it actually did something
    assert.strictEqual(jsComments.restoreComments(masked, comments), code);
  });

  test('the masked text contains none of the original comments\' variable-looking text', () => {
    const code = '// ${getInput}\nreturn 1;';
    const { masked } = jsComments.maskComments(code);
    assert.ok(!masked.includes('${getInput}'));
  });

  test('code with no comments is returned unchanged and with an empty comments list', () => {
    const code = 'return "${getInput}";';
    const { masked, comments } = jsComments.maskComments(code);
    assert.strictEqual(masked, code);
    assert.deepStrictEqual(comments, []);
  });

  test('REGRESSION: "$1"/"$&" inside a comment survive restoreComments literally, not as replacement patterns', () => {
    const code = "// use $1 and $& here\nreturn 'x';";
    const { masked, comments } = jsComments.maskComments(code);
    assert.strictEqual(jsComments.restoreComments(masked, comments), code);
  });

  test('multiple comments in one script all round-trip in order', () => {
    const code = '// first\nreturn 1; // second\n/* third */';
    const { masked, comments } = jsComments.maskComments(code);
    assert.strictEqual(comments.length, 3);
    assert.strictEqual(jsComments.restoreComments(masked, comments), code);
  });
});


suite('jsComments.js - stripLineComments()', () => {

  test('a whole element that is just a // comment becomes an empty string', () => {
    assert.strictEqual(jsComments.stripLineComments('// some comment;'), '');
  });

  test('a trailing // comment is removed but the code before it is kept', () => {
    assert.strictEqual(jsComments.stripLineComments("return $1;  // trailing note"), 'return $1;  ');
  });

  test('a /* */ block comment is left in place', () => {
    const code = "return /* keep me */ $1;";
    assert.strictEqual(jsComments.stripLineComments(code), code);
  });

  test('REGRESSION: "//" inside a string literal is left alone', () => {
    const code = "return 'http://example.com';";
    assert.strictEqual(jsComments.stripLineComments(code), code);
  });

  test('multiple // comments in one string are all removed', () => {
    const code = '// one\nreturn 1; // two';
    assert.strictEqual(jsComments.stripLineComments(code), '\nreturn 1; ');
  });

  test('empty/falsy input is returned unchanged', () => {
    assert.strictEqual(jsComments.stripLineComments(''), '');
  });
});
