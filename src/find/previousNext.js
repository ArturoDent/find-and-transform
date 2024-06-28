const { window, WorkspaceEdit, TextEdit, Range, Position, Selection, workspace } = require('vscode');

const resolve = require('../resolveVariables');
const regexp = require('../regex');

const transforms = require('../transform');
const prePostCommands = require('../prePostCommands');



/**
 * Replace the previous or next find match in the entire document
 * Select or not
 *
 * @param {window.activeTextEditor} editor
 * @param {Object} args - keybinding/settings args
 */
exports.replacePreviousOrNextInWholeDocument = async function (editor, args) {

  // make work for multiple selections
  const document = editor.document;
  const originalSelecton = editor.selection;
  
  let resolvedReplace;

  let previous = args.restrictFind?.startsWith('previous') || false;
  let next = args.restrictFind?.startsWith('next') || false;

  let nextMatches;
  let previousMatches;
  let match;
  let foundSelections = [];
  
  const textEdits = [];  // TextEdit[]

  const docString = document.getText();
  let cursorIndex = document.offsetAt(editor.selection.active);

  const findObject = await resolve.resolveFind(editor, args, null, null);
  const resolvedFind = findObject.findValue;
  args.isRegex = findObject.isRegex;

  if (!resolvedFind) return;

  // if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
  if (resolvedFind.search(regexp.lineNumberIndexRE) !== -1) {
    // lineCount is 1-based, so need to subtract 1 from it
    const lastLineRange = document.lineAt(document.lineCount - 1).range;
    const restOfDocRange = new Range(editor.selection.active.line, editor.selection.active.character, document.lineCount - 1, lastLineRange.end.character);
    nextMatches = transforms.buildLineNumberMatches(resolvedFind, restOfDocRange);

    const docRangeBeforeCursor = new Range(0, 0, editor.selection.active.line, editor.selection.active.character);
    previousMatches = transforms.buildLineNumberMatches(resolvedFind, docRangeBeforeCursor);
  }
  else {
    const re = new RegExp(resolvedFind, args.regexOptions);
    // consider cursorIndex+1 to skip 0-index match
    let restOfDocument = docString.substring(cursorIndex);  // text after cursor
    nextMatches = [...restOfDocument.matchAll(re)];
    
    // skip first match if it is the current find location
    if (nextMatches[0]?.index === 0) nextMatches.shift();
    
    const documentBeforeCursor = docString.substring(0, cursorIndex);
    previousMatches = [...documentBeforeCursor.matchAll(re)];
    
    // skip last match if it is the current find location
    const { selection } = window.activeTextEditor;
    if (previousMatches.at(-1)?.index === document.offsetAt(selection.active)) previousMatches.pop();
  }

  // refactor to a function
  if (resolvedFind === "^(?!\n)" || resolvedFind === "$(?!\n)" || resolvedFind === "^" ||
    resolvedFind === "^$" || resolvedFind === "^(?!\n)$(?!\n)") {
    
    if (next) {
      if (nextMatches.length) match = nextMatches[0];
      else if (!nextMatches.length && previousMatches.length) {
        match = previousMatches[0];
        cursorIndex = 0;
      }
      else {
        nextMatches = [];
        previousMatches = [];
      }
    }
    else if (previous) {
      if (previousMatches.length) {
        match = previousMatches.at(-1);
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
  
  
  // else {
  //   if (args.run && args.runWhen === "onceOnNoMatches")
  //     await resolve.resolveVariables(args, "run", null, editor.selection, null, null);
  //   // return;
  // }
  
  if (previousMatches.length || nextMatches.length) {
    
    let startPos = document.positionAt(cursorIndex + match.index);
    let endPos = document.positionAt(cursorIndex + match.index + match[0].length);
  
    if (args.restrictFind === "previousSelect")
      foundSelections.push(new Selection(endPos, startPos));
    else
      foundSelections.push(new Selection(startPos, endPos));
  
    editor.selections = foundSelections;
  }
  

  if (!previousMatches.length && !nextMatches.length) {
    if (args.run && args.runWhen === "onceOnNoMatches")
      await resolve.resolveVariables(args, "run", null, editor.selection, null, null);
    if (args.postCommands && args.runPostCommands === "onceOnNoMatches")
      await prePostCommands.runPost(args, [], [editor.selection], editor.selection);
    return;  // no match before or after cursor
  }

  let index = 0;

  if (args.replace) {
    resolvedReplace = await resolve.resolveVariables(args, "replace", match, editor.selection, cursorIndex + match.index, index);
    index++;

    if (args.isRegex) resolvedReplace = resolvedReplace?.replace(/(?<!\r)\n/g, "\r\n");

    textEdits.push(new TextEdit(editor.selection, resolvedReplace));
  }
  
  // if (textEdits.length) {
  //   await editor.edit(editBuilder => {
  //     editBuilder.replace(textEdits[0].range, textEdits[0].newText);
  //   });
  // }
  
  if (textEdits.length) {  
    await editor.edit(editBuilder => {
      textEdits.forEach(async textEdit => {
        await editBuilder.replace(textEdit.range, textEdit.newText);
      });
    });
  }
  
  const selection = editor.selection; 

  // if previous, put cursor at beginning of word = reverse selection
  // if next, put cursor at end of word = forward selection
  if (args.restrictFind !== "nextDontMoveCursor" && args.restrictFind !== "previousDontMoveCursor") {
    
    if (args.restrictFind === "nextMoveCursor") editor.selections = [new Selection(selection.active, selection.active)];
    
    else if (args.restrictFind === "previousMoveCursor") editor.selections = [new Selection(selection.anchor, selection.anchor)];

    editor.revealRange(new Range(selection.anchor, selection.active), 2);     // InCenterIfOutsideViewport
  }

  else if (args.restrictFind === "nextDontMoveCursor" || args.restrictFind === "previousDontMoveCursor") {
    editor.selection = originalSelecton;
    // 2 = vscode.TextEditorRevealType.InCenterIfOutsideViewport
    editor.revealRange(new Range(selection.anchor, selection.active), 2); // why reveal if nextDontMoveCursor
  }
  
  if (args.run && args.runWhen !== "onceOnNoMatches" && match.length)    // so args.run only runs if there is a match
    await resolve.resolveVariables(args, "run", match, editor.selection, null, null);
  else if (args.run  && args.runWhen === "onceOnNoMatches" && !match.length)
    await resolve.resolveVariables(args, "run", null, editor.selection, null, null);
  
    // TODO: test below, so original find/replace is still selected (after run)
    // if (foundSelections.length && args.run) Object.assign(foundSelections, editor.selections);
  
  // if ((nextMatches.length || args.run) && args.postCommands) await transforms.runPostCommands(args, nextMatches, editor.selections, editor.selection);
  // if (args.postCommands) await transforms.runPostCommands(args, [match], foundSelections, editor.selection);
  if (args.postCommands) await prePostCommands.runPost(args, [match], [editor.selection], editor.selection);
};