// Locate javascript comments in a named script's source, so the variable-resolution
// pass in resolveVariables.js can skip them.
//
// A script file is raw text, not JSON, so the variable pass (which is plain regex
// substitution, run before the code is ever compiled) has no way to tell a comment from
// live code. Without this, a '${getInput}' sitting in a '// ...' line pops an input box
// for a line that never runs, and a '\U$1' or '${1:text}' mentioned in a comment gets
// silently rewritten - which the generated script header's own warning comments do.
//
// Deliberately NOT string-aware in the masking sense: variables inside string literals
// still resolve, since `return "Hello ${getInput}"` is a normal way to use them. Strings
// are tracked here only so a '//' inside one (e.g. "https://example.com") isn't mistaken
// for the start of a comment.

// NUL can't appear in real source, so this can't collide with the script's own text, and
// it contains no '$' or '\' for the variable regexes to match. The masked code is never
// compiled - comments go back in before it reaches Function() - so it doesn't matter that
// a placeholder isn't itself valid javascript.
const NUL = String.fromCharCode(0);
const _placeholder = (index) => `${ NUL }FT-COMMENT-${ index }${ NUL }`;

// after one of these, a '/' starts a regex literal rather than being a division operator
const KEYWORD_BEFORE_REGEX = /(?:^|[^\w$.])(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)\s*$/;


/**
 * Find every comment span in javascript source, skipping any '//' or '/*' that is really
 * inside a string, template literal, or regex literal.
 * @param {string} code
 * @returns {Array<{start: number, end: number}>} - [start, end) offsets, in order
 */
exports.findCommentRanges = function (code) {

  const ranges = [];
  if (!code) return ranges;

  // each entry is a template literal we are inside of, holding the '{' depth of the
  // '${ ... }' expression currently being scanned (null = in the literal text itself)
  const templates = [];
  let index = 0;
  let prev = '';   // previous significant character, to tell a regex from a division

  const regexCanStartHere = () => {
    if (!prev) return true;
    if (!/[\w$)\]]/.test(prev)) return true;
    // 'return /re/' - the char before is a word char, but it ends a keyword
    return KEYWORD_BEFORE_REGEX.test(code.slice(0, index));
  };

  /** Advance past a quoted string, honouring backslash escapes. */
  const skipString = (quote) => {
    index++;
    while (index < code.length) {
      const ch = code[index];
      if (ch === '\\') { index += 2; continue; }
      if (ch === quote) { index++; return; }
      if (ch === '\n') return;   // unterminated - don't run past the line
      index++;
    }
  };

  /** Advance past a regex literal, honouring escapes and [...] character classes. */
  const skipRegex = () => {
    index++;
    let inClass = false;
    while (index < code.length) {
      const ch = code[index];
      if (ch === '\\') { index += 2; continue; }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) { index++; return; }
      else if (ch === '\n') return;   // unterminated
      index++;
    }
  };

  while (index < code.length) {

    const ch = code[index];
    const next = code[index + 1];

    // ---- inside a template literal's text (not inside its ${ ... }) ----
    if (templates.length && templates[templates.length - 1] === null) {
      if (ch === '\\') { index += 2; continue; }
      if (ch === '`') { templates.pop(); prev = '`'; index++; continue; }
      if (ch === '$' && next === '{') { templates[templates.length - 1] = 0; index += 2; continue; }
      index++;
      continue;
    }

    // ---- comments ----
    if (ch === '/' && next === '/') {
      const start = index;
      index += 2;
      while (index < code.length && code[index] !== '\n') index++;
      ranges.push({ start, end: index });
      continue;
    }

    if (ch === '/' && next === '*') {
      const start = index;
      index += 2;
      while (index < code.length && !(code[index] === '*' && code[index + 1] === '/')) index++;
      index = Math.min(index + 2, code.length);
      ranges.push({ start, end: index });
      continue;
    }

    // ---- strings / templates / regexes ----
    if (ch === '"' || ch === "'") { skipString(ch); prev = ch; continue; }

    if (ch === '`') { templates.push(null); index++; continue; }

    if (ch === '/' && regexCanStartHere()) { skipRegex(); prev = '/'; continue; }

    // ---- track '{' depth so we know when a template's ${ ... } ends ----
    if (templates.length) {
      const depth = templates[templates.length - 1];
      if (ch === '{') templates[templates.length - 1] = depth + 1;
      else if (ch === '}') {
        if (depth === 0) { templates[templates.length - 1] = null; index++; continue; }
        templates[templates.length - 1] = depth - 1;
      }
    }

    if (!/\s/.test(ch)) prev = ch;
    index++;
  }

  return ranges;
};


/**
 * Replace every comment in `code` with an inert placeholder, so a variable-resolution
 * pass leaves the comments' contents alone. Pair with restoreComments().
 * @param {string} code
 * @returns {{masked: string, comments: string[]}}
 */
exports.maskComments = function (code) {

  const ranges = exports.findCommentRanges(code);
  if (!ranges.length) return { masked: code, comments: [] };

  const comments = [];
  let masked = '';
  let last = 0;

  ranges.forEach((range, index) => {
    masked += code.slice(last, range.start) + _placeholder(index);
    comments.push(code.slice(range.start, range.end));
    last = range.end;
  });

  return { masked: masked + code.slice(last), comments };
};


/**
 * Put back the comments maskComments() took out.
 * @param {string} text - the masked code, after variable resolution
 * @param {string[]} comments
 * @returns {string}
 */
exports.restoreComments = function (text, comments) {

  let restored = text;

  comments.forEach((comment, index) => {
    // a replacer function, so '$1'/'$&' inside the comment aren't read as replacement patterns
    restored = restored.replace(_placeholder(index), () => comment);
  });

  return restored;
};


/**
 * Remove every '//' line comment from `code`, leaving '/* *\/' block comments in
 * place. For code about to be joined with other lines onto one line - a '//' has
 * no newline left to stop it there, so it would otherwise swallow everything
 * joined after it.
 * @param {string} code
 * @returns {string}
 */
exports.stripLineComments = function (code) {

  if (!code) return code;

  const ranges = exports.findCommentRanges(code);
  let result = code;

  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    if (code.slice(range.start, range.start + 2) === '//')
      result = result.slice(0, range.start) + result.slice(range.end);
  }

  return result;
};
