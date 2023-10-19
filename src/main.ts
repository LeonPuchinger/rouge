import { interpret } from "./interpreter.ts";
import { lexer } from "./lexer.ts";
import { parser } from "./parser.ts";
import { AppError, InternalError } from "./util/error.ts";
import * as logger from "./util/logger.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { toMultiline } from "./util/string.ts";

export function run(source: string): Option<AppError> {
  const tokenStream = lexer.parse(source);
  const parseResult = parser.parse(tokenStream);
  if (!parseResult.successful) {
    // TODO: error handling, logging
    console.log("An error occured while parsing:");
    console.log(parseResult.error);
    return None(); //TODO return an error here
  }
  const numberCandidates = parseResult.candidates.length;
  if (numberCandidates > 1) {
    logger.debug(toMultiline(
      "Ambiguity detected",
      `There are ${numberCandidates} ways to parse the input.`,
      "The first possible AST is used.",
      "Use the debugger to inspect other ways the input can be interpreted by the parser.",
    ));
  }
  const ast = parseResult.candidates[0].result;
  const interpretationError = interpret(ast);
  if (interpretationError.kind === "some") {
    console.log(interpretationError.unwrap().toString());
  }
  return None();
}
