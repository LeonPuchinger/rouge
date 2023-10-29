import { interpret } from "./interpreter.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { updateEnvironment } from "./util/environment.ts";
import { AppError } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";

export function run(source: string): Option<AppError> {
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  if (tokenStream.kind === "err") {
    return Some(tokenStream.unwrapError());
  }
  const ast = parse(tokenStream.unwrap());
  if (ast.kind === "err") {
    return Some(ast.unwrapError());
  }
  const interpretationError = interpret(ast.unwrap());
  if (interpretationError.kind === "some") {
    return Some(interpretationError.unwrap());
  }
  return None();
}
