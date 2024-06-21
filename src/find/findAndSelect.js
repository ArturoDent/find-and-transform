const { Range, Position, Selection } = require('vscode');

const resolve = require('../resolveVariables');
const regexp = require('../regex');

const transforms = require('../transform');
const prePostCommands = require('../prePostCommands');



/**
 * If find but no replace, just select all matches in entire restrictFind option 
 * while removing all the original selections. 
 * Also covers no find/no replace, but not no find/replace b/c that is covered elsewhere.
 *
 * @param {import("vscode").TextEditor} editor
 * @param {Object} args - keybinding/settings args
 */
exports.findAndSelect = async function (editor, args) {

  const document = editor.document;
  let foundSelections = [];
  let matches;
  let foundMatches = [];
  
  if (args.restrictFind === "document") {

    let docRange;
    let fullText;

    // an undefined find will be converted to the empty string already, find = ''
    const findObject = await resolve.resolveFind(editor, args, null, null);
    const resolvedFind = findObject.findValue;
    args.isRegex = findObject.isRegex;

    // resolvedFind may = '', because on an empty selection
    // resolvedFind = "(^(?!\n)$(?!\n))", if on an empty line
    if (resolvedFind) {

      // if (resolvedFind?.search(/\$\{line(Number|Index)\}/) !== -1) {
      if (resolvedFind?.search(regexp.lineNumberIndexRE) !== -1) {
        // lineCount is 1-based, so need to subtract 1 from it
        const lastLineRange = document?.lineAt(document.lineCount - 1).range;
        docRange = new Range(0, 0, document?.lineCount - 1, lastLineRange?.end?.character);
        matches = transforms.buildLineNumberMatches(resolvedFind, docRange);
      }

      // else get all the matches in the document, resolvedFind !== lineNumber/lineIndex
      else if (resolvedFind.length) {
        fullText = document.getText();
        matches = [...fullText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
      }
      
      // Any way to designate a capture group to select, like '\\$1(\\d+)' ?
      matches?.forEach((match, index) => {
        const startPos = document?.positionAt(match.index);
        const endPos = document?.positionAt(match.index + match[0].length);
        const thisSelection = new Selection(startPos, endPos);
        foundSelections[index] = thisSelection;
      });
      
      foundMatches.push(...matches);
    }
  }

  else {  // restrictFind === "selections/once/onceIncludeCurrentWord/onceExcludeCurrentWord/line"

    let selectedRange;
    let lineMatches = []; // to keep track of which lines have been processed for once...
    
    await Promise.all(editor.selections.map(async (selection) => {
      
      if (!args.find && args.restrictFind !== "selections") {
        const lineSelections = editor.selections.filter(eachSelection => eachSelection.active.line === selection.active.line);
        // const findObject = resolve.makeFind(lineSelections, args);
        const findObject = await resolve.makeFind(lineSelections, args);
        ({ find: args.find, emptyPointSelections: args.pointReplaces } = findObject);
        args.madeFind = true;
        args.isRegex ||= findObject.mustBeRegex;
      }
      const findObject = await resolve.resolveFind(editor, args, null, selection);
      const resolvedFind = findObject.findValue;
      args.isRegex = findObject.isRegex;
      
      let searchText;

      if (args.restrictFind === "selections") {

        if (selection.isEmpty) {
          // pointSelections here?
          selectedRange = document.getWordRangeAtPosition(selection.start);
        }
        else selectedRange = new Range(selection.start, selection.end);
        if (!selectedRange) return;

        // if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1)
        if (resolvedFind.search(regexp.lineNumberIndexRE) !== -1)
          matches = transforms.buildLineNumberMatches(resolvedFind, selectedRange);

        else if (resolvedFind?.length) {
          searchText = document.getText(selectedRange);
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
        }
        
        matches?.forEach((match) => {
          const selectionStartIndex = document.offsetAt(selectedRange.start);
          const startPos = document.positionAt(selectionStartIndex + match.index);
          const endPos = document.positionAt(selectionStartIndex + match.index + match[0].length);
          // reveal will use the **last** selection's foundSelections
          foundSelections.push(new Selection(startPos, endPos));
        });
        
        foundMatches.push(...matches);
      }
      
      else if (args.restrictFind === "matchAroundCursor") { 
        
        let [foundSelection, foundMatch] = transforms.matchAroundCursor(args, resolvedFind, selection);
        if (foundSelection) foundSelections.push(foundSelection);
        if (foundMatch) foundMatches.push(foundMatch);
      }

      else if (args.restrictFind === "line") {

        let lineIndex = 0;

        // if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
        if (resolvedFind.search(regexp.lineNumberIndexRE) !== -1) {
          let selectedLineRange = document.lineAt(selection.active.line).range;
          matches = transforms.buildLineNumberMatches(resolvedFind, selectedLineRange);
        }
        else if (resolvedFind?.length) {
          searchText = document.lineAt(selection.active.line).text;
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
          lineIndex = document.offsetAt(new Position(selection.active.line, 0));
        }

       matches?.forEach((match) => {
          const startPos = document.positionAt(lineIndex + match.index);
          const endPos = document.positionAt(lineIndex + match.index + match[0].length);
          foundSelections.push(new Selection(startPos, endPos));
        });
        foundMatches.push(...matches);
      }

      else if (args.restrictFind?.startsWith("once")) {

        const currentWordRange = document.getWordRangeAtPosition(selection.active);

        // if (resolvedFind.search(/\$\{line(Number|Index)\}/) !== -1) {
        if (resolvedFind.search(regexp.lineNumberIndexRE) !== -1) {
          
          let lineRange = document.lineAt(selection.active.line).range;
          let subLineRange = lineRange.with({ start: selection.active });
          
          if ((args.restrictFind === "onceIncludeCurrentWord") && currentWordRange)
            subLineRange = lineRange.with({ start: document.getWordRangeAtPosition(selection.active)?.start });

          matches = transforms.buildLineNumberMatches(resolvedFind, subLineRange);
        }

        else if (resolvedFind?.length) {
          const fullLine = document.lineAt(selection.active.line).text;
          const wordRangeAtCursor = document.getWordRangeAtPosition(selection.active);
          searchText = fullLine.substring(selection?.end?.character);  // once, onceExcludeCurrentWord
          
          if ((args.restrictFind === "onceIncludeCurrentWord") && wordRangeAtCursor?.start) {
            searchText = fullLine.substring(wordRangeAtCursor?.start?.character);
          }
          if (!searchText) return;
          
          matches = [...searchText.matchAll(new RegExp(resolvedFind, args.regexOptions))];
        }
        
        if (matches.length > 1) matches = [matches[0]];  // handles two+ matches in one line with one selection
          
        if (matches?.length) {
          
          let lineIndex = document.offsetAt(new Position(selection.active.line, 0));
          let subStringIndex = selection.active?.character;
          let doContinue = true;
          
          const sameLineFound = lineMatches.findIndex(lineMatch => lineMatch.lineIndex === lineIndex);
          
          if (sameLineFound !== -1) {
            const foundHigherIndex = lineMatches.findIndex(lineMatch => (lineMatch.lineIndex === lineIndex) && (lineMatch.subStringIndex > subStringIndex));
            if (foundHigherIndex !== -1) {
              lineMatches.splice(foundHigherIndex, 1);
              // remove from foundSelections and foundMatches too
              foundSelections.splice(foundHigherIndex, 1);
              foundMatches.splice(foundHigherIndex, 1);
            }
            else {
              const foundLowerIndex = lineMatches.findIndex(lineMatch => (lineMatch.lineIndex === lineIndex) && (lineMatch.subStringIndex > subStringIndex));
              if (foundLowerIndex === -1)
                doContinue = false;
              // const foundLowerIndex = lineMatches.findIndex(lineMatch => (lineMatch.lineIndex === lineIndex) && (lineMatch.subStringIndex > subStringIndex));
              // lineMatches.push({ lineIndex, subStringIndex });
            }
          }
          
          if (doContinue) {
           
            lineMatches.push({ lineIndex, subStringIndex });
        
            if ((args.restrictFind === "onceIncludeCurrentWord") && currentWordRange) {
              subStringIndex = currentWordRange?.start?.character;
            }
         
            const startPos = document.positionAt(lineIndex + subStringIndex + matches[0].index);
            const endPos = document.positionAt(lineIndex + subStringIndex + matches[0].index + matches[0][0].length);
            foundSelections.push(new Selection(startPos, endPos));
            foundMatches.push(matches[0]);
          }
        }
      }
    }));
  }
  
  // 'run' might want to access the selections
  
  // ignore args.preserveSelections in findAndSelect
  if (foundSelections.length) editor.selections = foundSelections;
  
  await transforms.runWhen(args, foundMatches, foundSelections, editor.selection);
  
  // get the "new" selections after 'run'
  // Object.assign() because editor.selections is readonly and cannot be directly set to foundSelections
  if (foundSelections.length && args.run) Object.assign(foundSelections, editor.selections);
  
  // sendSequence will resolve certain vars automatically
  
  if (args.postCommands) await prePostCommands.runPost(args, foundMatches, foundSelections, editor.selection);
};