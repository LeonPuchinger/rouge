import { interpret } from "./interpreter.ts";
import { lexer } from "./lexer.ts";
import { parser } from "./parser.ts";

export function run(source: string) {
  const tokenStream = lexer.parse(source);
  const parseResult = parser.parse(tokenStream);
  if (!parseResult.successful) {
    // TODO: error handling, logging
    console.log("An error occured while parsing:");
    console.log(parseResult.error);
    return;
  }
  const numberCandidates = parseResult.candidates.length;
  if (numberCandidates > 1) {
    // TODO: error handling, logging
    console.log("Ambiguity detected");
    console.log(`There are ${numberCandidates} ways to parse the input.`);
    console.log("In the following, the first possible AST is used.");
    console.log("Use the debugger to inspect the other results.");
  }
  const ast = parseResult.candidates[0].result;
  interpret(ast);
}
