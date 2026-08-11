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

  test('a whole quoted value with double-escaped \\U/\\E case-modifier tokens is unescaped to single backslashes', () => {
    const result = scriptCommands.extractCodeFromSelection('"$${\\\\U$1\\\\E}$$"');
    assert.deepStrictEqual(result, {
      code: '\\U$1\\E',
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

  test('array-style lines with double-escaped \\L/\\l case-modifier tokens are unescaped to single backslashes', () => {
    const selection = '"return \\\\L$1\\\\E + \\\\l$2;",\n"return true;"';
    const result = scriptCommands.extractCodeFromSelection(selection);
    assert.strictEqual(result.code, 'return \\L$1\\E + \\l$2;\nreturn true;');
    assert.strictEqual(result.needsQuotes, true);
  });

  test('blank lines between array-style lines are preserved as empty lines', () => {
    const result = scriptCommands.extractCodeFromSelection('"const a = 1;",\n\n"const b = 2;",');
    assert.strictEqual(result.code, 'const a = 1;\n\nconst b = 2;');
  });
});


suite('scriptCommands.js - findSourceConfigText()', () => {

  const keybindings = [
    '[',
    '  {',
    '    "key": "alt+q",',
    '    "command": "some.other.command"',
    '  },',
    '  {',
    '    "key": "alt+n",',
    '    "command": "findInCurrentFile",',
    '    "args": {',
    '      "description": "Open html snippets path",',
    '      "replace": [',
    '        "$${",',
    '        "const langID = document.languageId;",',
    '        "}$$"',
    '      ]',
    '    },',
    '    "when": "editorTextFocus"',
    '  }',
    ']'
  ].join('\n');

  const settings = [
    '{',
    '  "editor.fontSize": 12,',
    '  "findInCurrentFile": {',
    '    "upcaseSwap": {',
    '      "title": "Upcase Swap",',
    '      "replace": "$${ return \'$1\'.toUpperCase(); }$$"',
    '    }',
    '  }',
    '}'
  ].join('\n');

  const workspaceFile = [
    '{',
    '  "folders": [],',
    '  "settings": {',
    '    "findInCurrentFile": {',
    '      "upcaseSwap": {',
    '        "title": "Upcase Swap",',
    '        "replace": "$${ return \'$1\'.toUpperCase(); }$$"',
    '      }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  /**
   * An offset inside the given text, i.e. where a selection of it would start.
   * @param {string} documentText
   * @param {string} snippet
   * @returns {number}
   */
  const offsetOf = (documentText, snippet) => documentText.indexOf(snippet) + 3;

  test('keybindings.json: the whole keybinding object, with no command name', () => {
    const result = scriptCommands.findSourceConfigText(keybindings, offsetOf(keybindings, 'const langID'));
    assert.ok(result);
    assert.strictEqual(result.command, undefined);
    assert.strictEqual(result.text, [
      '{',
      '  "key": "alt+n",',
      '  "command": "findInCurrentFile",',
      '  "args": {',
      '    "description": "Open html snippets path",',
      '    "replace": [',
      '      "$${",',
      '      "const langID = document.languageId;",',
      '      "}$$"',
      '    ]',
      '  },',
      '  "when": "editorTextFocus"',
      '}'
    ].join('\n'));
  });

  test('settings.json: the whole named setting, key included, plus the command name', () => {
    const result = scriptCommands.findSourceConfigText(settings, offsetOf(settings, "return '$1'"));
    assert.ok(result);
    assert.strictEqual(result.command, 'findInCurrentFile');
    assert.strictEqual(result.text, [
      '"upcaseSwap": {',
      '  "title": "Upcase Swap",',
      '  "replace": "$${ return \'$1\'.toUpperCase(); }$$"',
      '}'
    ].join('\n'));
  });

  test('.code-workspace: the "settings" wrapper is skipped', () => {
    const result = scriptCommands.findSourceConfigText(workspaceFile, offsetOf(workspaceFile, "return '$1'"), true);
    assert.ok(result);
    assert.strictEqual(result.command, 'findInCurrentFile');
    assert.strictEqual(result.text, [
      '"upcaseSwap": {',
      '  "title": "Upcase Swap",',
      '  "replace": "$${ return \'$1\'.toUpperCase(); }$$"',
      '}'
    ].join('\n'));
  });

  test('unparseable text returns undefined', () => {
    assert.strictEqual(scriptCommands.findSourceConfigText('not json at all', 3), undefined);
  });

  test('an offset above a named setting (too short a path) returns undefined', () => {
    assert.strictEqual(scriptCommands.findSourceConfigText(settings, settings.indexOf('12')), undefined);
  });
});


suite('scriptCommands.js - makeSourceComment()', () => {

  test('a keybinding gets the keybinding header', () => {
    const result = scriptCommands.makeSourceComment('{\n  "key": "alt+n"\n}', undefined);
    assert.strictEqual(result, '/*\nsaved from this keybinding:\n\n{\n  "key": "alt+n"\n}\n*/\n\n');
  });

  test('a setting gets the setting header, naming the command', () => {
    const result = scriptCommands.makeSourceComment('"upcaseSwap": {}', 'findInCurrentFile');
    assert.strictEqual(result, '/*\nsaved from this setting, under "findInCurrentFile":\n\n"upcaseSwap": {}\n*/\n\n');
  });

  test('a literal */ in the config is escaped so it cannot end the comment early', () => {
    const result = scriptCommands.makeSourceComment('"replace": "*/",', undefined);
    assert.ok(result.includes('"replace": "*\\/",'));
    // the only */ left is the one closing the comment
    assert.strictEqual(result.split('*/').length - 1, 1);
  });

});


suite('scriptCommands.js - makeHeaderComment()', () => {

  test('a setting: title first, description under it, then a blank line', () => {
    const result = scriptCommands.makeHeaderComment('Transform to PascalCase', 'bumps the version on save');
    assert.strictEqual(result, '// Transform to PascalCase\n// bumps the version on save\n\n');
  });

  test('a keybinding (no title): the description alone', () => {
    const result = scriptCommands.makeHeaderComment(undefined, 'Open html snippets path');
    assert.strictEqual(result, '// Open html snippets path\n\n');
  });

  test('a title with no description', () => {
    const result = scriptCommands.makeHeaderComment('Upcase Swap', undefined);
    assert.strictEqual(result, '// Upcase Swap\n\n');
  });

  test('neither: no comment at all, so the file starts at the require header', () => {
    assert.strictEqual(scriptCommands.makeHeaderComment(undefined, undefined), '');
  });

  test('a multi-line label is flattened, so it cannot break out of the // comment', () => {
    const result = scriptCommands.makeHeaderComment('line one\nline two', undefined);
    assert.strictEqual(result, '// line one line two\n\n');
  });
});


suite('scriptCommands.js - findSiblingLabels()', () => {

  const settings = [
    '{',
    '  "findInCurrentFile": {',
    '    "bumpSaveVersion": {',
    '      "title": "Transform to PascalCase",',
    '      "description": "bumps the version on save",',
    '      "replace": "$${ return \'$1\'; }$$"',
    '    }',
    '  }',
    '}'
  ].join('\n');

  const keybindings = [
    '[',
    '  {',
    '    "key": "alt+n",',
    '    "command": "findInCurrentFile",',
    '    "args": {',
    '      "description": "Open html snippets path",',
    '      "replace": [',
    '        "$${",',
    '        "const langID = document.languageId;",',
    '        "}$$"',
    '      ]',
    '    }',
    '  }',
    ']'
  ].join('\n');

  test('a setting yields both its title and its description', () => {
    const result = scriptCommands.findSiblingLabels(settings, settings.indexOf("return '$1'"));
    assert.deepStrictEqual(result, { title: 'Transform to PascalCase', description: 'bumps the version on save' });
  });

  test('a keybinding has no title, and the description is found from inside a nested array', () => {
    const result = scriptCommands.findSiblingLabels(keybindings, keybindings.indexOf('const langID'));
    assert.deepStrictEqual(result, { title: undefined, description: 'Open html snippets path' });
  });

  test('unparseable text yields both undefined', () => {
    assert.deepStrictEqual(scriptCommands.findSiblingLabels('not json at all', 3), { title: undefined, description: undefined });
  });
});
