import { interpret } from "./interpreter.ts";
import { lexer } from "./lexer.ts";
import { parser } from "./parser.ts";

export function run(source: string) {
  const tokenStream = lexer.parse(source);
  const parseResult = parser.parse(tokenStream);
  if (!parseResult.successful) {
    console.log("An error occured while parsing:");
    console.log(parseResult.error);
    return;
  }
  const numberCandidates = parseResult.candidates.length;
  if (numberCandidates > 1) {
    console.log("Ambiguity detected");
    console.log(`There are ${numberCandidates} ways to parse the input.`);
    console.log("In the following, only the first possible AST is shown.");
    console.log("Use the debugger to inspect the other results.");
  }
  const first_candidate = parseResult.candidates[0];
  interpret(first_candidate.result);
}
