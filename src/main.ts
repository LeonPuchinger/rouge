import { interpret } from "./interpreter.ts";
import { lexer } from "./lexer.ts";
import { parse } from "./parser.ts";
import { AppError, Panic } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";

export function run(source: string): Option<AppError> {
  const tokenStream = lexer.parse(source);
  if (tokenStream === undefined) {
    // TODO: move responsibility of checking this to the lexer
    // move logic to `tokenize` function in lexer (analogous to parser)
    throw Panic("tokenStream is empty");
  }
  const parseResult = parse(tokenStream);
  if (parseResult.kind === "err") {
    const parseError = parseResult.unwrapError();
    console.log(parseError);
    return Some(parseError);
  }
  const ast = parseResult.unwrap();
  const interpretationError = interpret(ast);
  if (interpretationError.kind === "some") {
    const error = interpretationError.unwrap();
    console.log(error);
    return Some(error);
  }
  return None();
}
