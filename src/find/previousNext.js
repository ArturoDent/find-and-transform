const { window, WorkspaceEdit, TextEdit, Range, Selection, workspace } = require('vscode');

const commands = require('../commands');
const resolve = require('../resolveVariables');
// const utilities = require('../utilities');
const transforms = require('../transform');



/**
 * Replace the previous or next find match in the entire document
 * Select or not
 *
 * @param {window.activeTextEditor} editor
 * @param {Object} args - keybinding/settings args
 */
exports.replacePreviousOrNextInWholeDocument = async function (editor, args) {

  // make work for multiple selections ?? TODO
  const document = editor.document;
  let resolvedReplace;
  let matchEndPos;

  let previous = args.restrictFind?.startsWith('previous') || false;
  let next = args.restrictFind?.startsWith('next') || false;

  let nextMatches;
  let previousMatches;
  let match;
  
  const wsEdit = new WorkspaceEdit();
  const textEdits = [];  // TextEdit[]

  const docString = document.getText();
  let cursorIndex = document.offsetAt(editor.selection.active);

  // const resolvedFind = await resolve.resolveFind(editor, args, null, null);
  const findObject = await resolve.resolveFind(editor, args, null, null);
  const resolvedFind = findObject.findValue;
  args.isRegex = findObject.isRegex;

  if (!resolvedFind) return;

  if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
    // lineCount is 1-based, so need to subtract 1 from it
    const lastLineRange = document.lineAt(document.lineCount - 1).range;
    const restOfDocRange = new Range(editor.selection.active.line, editor.selection.active.character, document.lineCount - 1, lastLineRange.end.character);
    nextMatches = transforms.buildLineNumberMatches(resolvedFind, restOfDocRange);

    const docRangeBeforeCursor = new Range(0, 0, editor.selection.active.line, editor.selection.active.character);
    previousMatches = transforms.buildLineNumberMatches(resolvedFind, docRangeBeforeCursor);
  }
  else {
    const re = new RegExp(resolvedFind, args.regexOptions);
    let restOfDocument = docString.substring(cursorIndex);  // text after cursor
    nextMatches = [...restOfDocument.matchAll(re)];
    
    // TODO test: skip first match if it is the current find location
    if (nextMatches[0]?.index === 0) nextMatches.shift();

    const documentBeforeCursor = docString.substring(0, cursorIndex);
    previousMatches = [...documentBeforeCursor.matchAll(re)];
    
    // TODO test: skip last match if it is the current find location
    const { selection } = window.activeTextEditor;
    if (previousMatches.at(-1)?.index === document.offsetAt(selection.active)) previousMatches.pop();
  }

  // refactor to a function
  if (resolvedFind === "^(?!\n)" || resolvedFind === "$(?!\n)") {
    if (next) {
      if (nextMatches.length > 1) match = nextMatches[1];
      else if (previousMatches.length) {
        match = previousMatches[0];
        cursorIndex = 0;
      }
      else {
        nextMatches = [];
        previousMatches = [];
      }
    }
    else if (previous) {
      if (previousMatches.length > 1) {
        match = previousMatches.at(-2);
        cursorIndex = 0;
      }
      else if (nextMatches.length) {
        match = nextMatches.at(-1);
      }
      else {
        previousMatches = [];
        nextMatches = [];
      }
    }
  }
  else if (previous && previousMatches?.length) {
    match = previousMatches.at(-1);  // the last array item
    cursorIndex = 0;
  }
  else if (previous && !previousMatches?.length && nextMatches.length) {
    match = nextMatches.at(-1);   // the last array item
  }
  else if (next && nextMatches?.length) {
    match = nextMatches[0];
  }
  else if (next && !nextMatches?.length && previousMatches.length) {
    match = previousMatches[0];
    cursorIndex = 0;
  }
  else {
    if (args.run && args.runWhen === "onceOnNoMatches")
      await resolve.resolveVariables(args, "run", null, editor.selection, null, null);
    return;
  }

  if (!previousMatches.length && !nextMatches.length) {
    // TODO: is the following necessary after the above resolve.resolveVariables() ?
    if (args.run && args.runWhen === "onceOnNoMatches")
      await resolve.resolveVariables(args, "run", null, editor.selection, null, null);
    return;  // no match before or after cursor
  }

  // await editor.edit(async function (edit) {

  let index = 0;

  if (args.replace) {
    resolvedReplace = await resolve.resolveVariables(args, "replace", match, editor.selection, cursorIndex + match.index, index);
    index++;

    if (args.isRegex) resolvedReplace = resolvedReplace?.replace(/(?<!\r)\n/g, "\r\n");

    const startPos = document.positionAt(cursorIndex + match.index);
    const endPos = document.positionAt(cursorIndex + match.index + match[0].length);
    const matchRange = new Range(startPos, endPos);
    // edit.replace(matchRange, resolvedReplace);
    textEdits.push(new TextEdit(matchRange, resolvedReplace));
  }
  
  wsEdit.set(editor.document.uri, textEdits);
  await workspace.applyEdit(wsEdit);
  
  // textEdits.map(edit => {
  //   const endPos = new Position(edit.range.end.line, edit.range.start.character + edit.newText.length);
  //   foundSelections.push(new Selection(edit.range.start, endPos));
  // })
  
  // editor.selections = foundSelections; 
  
  const matchStartPos = document.positionAt(cursorIndex + match.index);
  if (args.replace) {
    matchEndPos = document.positionAt(cursorIndex + match.index + resolvedReplace?.length);
  }
  else matchEndPos = document.positionAt(cursorIndex + match.index + match[0].length);

  // if previous, put cursor at beginning of word = reverse selection
  // if next, put cursor at end of word = forward selection
  if (args.restrictFind !== "nextDontMoveCursor" && args.restrictFind !== "previousDontMoveCursor") {

    if (args.restrictFind === "nextSelect") editor.selections = [new Selection(matchStartPos, matchEndPos)];
    else if (args.restrictFind === "previousSelect") editor.selections = [new Selection(matchEndPos, matchStartPos)];
    else if (args.restrictFind === "nextMoveCursor") editor.selections = [new Selection(matchEndPos, matchEndPos)];
    else if (args.restrictFind === "previousMoveCursor") editor.selections = [new Selection(matchStartPos, matchStartPos)];

    editor.revealRange(new Range(matchStartPos, matchEndPos), 2);           // InCenterIfOutsideViewport
  }

  else if (args.restrictFind === "nextDontMoveCursor" || args.restrictFind === "previousDontMoveCursor") {
    // 2 = vscode.TextEditorRevealType.InCenterIfOutsideViewport
    editor.revealRange(new Range(matchStartPos, matchEndPos), 2); // why reveal if nextDontMoveCursor
  }   // do nothing, edit already made

  if (args.run && args.runWhen !== "onceOnNoMatches" && match.length)    // so args.run only runs if there is a match
    await resolve.resolveVariables(args, "run", match, editor.selection, null, null);
  else if (args.run  && args.runWhen === "onceOnNoMatches" && !match.length)
    await resolve.resolveVariables(args, "run", null, editor.selection, null, null);
  
    // TODO: test below, so original find/replace is still selected (after run)
    // if (foundSelections.length && args.run) Object.assign(foundSelections, editor.selections);
  
  if ((nextMatches.length || previousMatches.length) && args.postCommands) await commands.runPrePostCommands(args.postCommands, "postCommands");
  // if ((nextMatches.length || args.run) && args.postCommands) await transforms.runPostCommands(args, nextMatches, editor.selections, editor.selection);
  if ((nextMatches.length || args.run) && args.postCommands) await transforms.runPostCommands(args, nextMatches, editor.selections, editor.selection);
};