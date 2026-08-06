const assert = require('assert');
const scriptCommands = require('../../src/scriptCommands');

suite('scriptCommands.js - extractCodeFromSelection()', () => {

  const expectedCode = [
    'const langID = document.languageId;',
    "const userSnippetsUri = vscode.Uri.joinPath(context.globalStorageUri, '..', '..', 'snippets');",
    "const uri = vscode.Uri.joinPath(userSnippetsUri, langID + '.json');",
    "vscode.commands.executeCommand('vscode.open', uri);"
  ].join('\n');

  const codeLines = [
    '        "const langID = document.languageId;",',
    '        "const userSnippetsUri = vscode.Uri.joinPath(context.globalStorageUri, \'..\', \'..\', \'snippets\');",',
    '        "const uri = vscode.Uri.joinPath(userSnippetsUri, langID + \'.json\');",',
    '        "vscode.commands.executeCommand(\'vscode.open\', uri);",'
  ].join('\n');

  test('just the inner code (no delimiters, no brackets): plain inline substring', () => {
    const result = scriptCommands.extractCodeFromSelection(" return 'hello'; ");
    assert.deepStrictEqual(result, { code: "return 'hello';", needsQuotes: false, needsDelimiters: false, keyPrefix: '', trailingComma: '' });
  });

  test('just the inner code (no delimiters, no brackets): multi-line quoted array lines', () => {
    const result = scriptCommands.extractCodeFromSelection(codeLines);
    assert.deepStrictEqual(result, { code: expectedCode, needsQuotes: true, needsDelimiters: false, keyPrefix: '', trailingComma: '' });
  });

  test('the whole $${ ... }$$ block, delimiters included: plain inline substring', () => {
    const result = scriptCommands.extractCodeFromSelection("$${ return 'hello'; }$$");
    assert.deepStrictEqual(result, { code: "return 'hello';", needsQuotes: false, needsDelimiters: true, keyPrefix: '', trailingComma: '' });
  });

  test('the whole "$${", ..., "}$$", block, delimiters included: array-style lines', () => {
    const selection = ['        "$${",', codeLines, '        "}$$",'].join('\n');
    const result = scriptCommands.extractCodeFromSelection(selection);
    assert.deepStrictEqual(result, { code: expectedCode, needsQuotes: true, needsDelimiters: true, keyPrefix: '', trailingComma: '' });
  });

  test('the entire replace array, brackets included, no key, no sibling property after', () => {
    const selection = ['[', '  "$${",', codeLines, '  "}$$"', ']'].join('\n');
    const result = scriptCommands.extractCodeFromSelection(selection);
    assert.deepStrictEqual(result, { code: expectedCode, needsQuotes: true, needsDelimiters: true, keyPrefix: '', trailingComma: '' });
  });

  test('the entire replace block, key and brackets included, no sibling property after', () => {
    const selection = ['"replace": [', '  "$${",', codeLines, '  "}$$"', ']'].join('\n');
    const result = scriptCommands.extractCodeFromSelection(selection);
    assert.deepStrictEqual(result, { code: expectedCode, needsQuotes: true, needsDelimiters: true, keyPrefix: '"replace": ', trailingComma: '' });
  });

  test('REGRESSION: a trailing comma before a sibling property (e.g. "run": [...], "runWhen": ...) is preserved', () => {
    const selection = ['"run": [', '  "$${",', codeLines, '  "}$$",', '],'].join('\n');
    const result = scriptCommands.extractCodeFromSelection(selection);
    assert.deepStrictEqual(result, { code: expectedCode, needsQuotes: true, needsDelimiters: true, keyPrefix: '"run": ', trailingComma: ',' });
  });

  test('the entire replace block for a simple inline value, key and quotes included, with a sibling property after', () => {
    const result = scriptCommands.extractCodeFromSelection('"replace": "$${ return \'hello\'; }$$",');
    assert.deepStrictEqual(result, { code: "return 'hello';", needsQuotes: true, needsDelimiters: true, keyPrefix: '"replace": ', trailingComma: ',' });
  });

  test('a whole quoted value with surrounding text around the jsOp is saved verbatim, quoted and delimited', () => {
    const selection = "\"${BLOCK_COMMENT_START} $${return '$1'.toLocaleUpperCase();}$$ ${BLOCK_COMMENT_START}\"";
    const result = scriptCommands.extractCodeFromSelection(selection);
    assert.deepStrictEqual(result, {
      code: "${BLOCK_COMMENT_START} $${return '$1'.toLocaleUpperCase();}$$ ${BLOCK_COMMENT_START}",
      needsQuotes: true,
      needsDelimiters: true,
      keyPrefix: '',
      trailingComma: ''
    });
  });

  test('array-style lines with JSON-escaped quotes and a trailing comment are unescaped correctly', () => {
    const selection = '"const s = \\"hi\\";",  // a comment\n"return s;"';
    const result = scriptCommands.extractCodeFromSelection(selection);
    assert.strictEqual(result.code, 'const s = "hi";\nreturn s;');
    assert.strictEqual(result.needsQuotes, true);
  });

  test('blank lines between array-style lines are preserved as empty lines', () => {
    const result = scriptCommands.extractCodeFromSelection('"const a = 1;",\n\n"const b = 2;",');
    assert.strictEqual(result.code, 'const a = 1;\n\nconst b = 2;');
  });
});
