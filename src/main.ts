import { analyze } from "./analysis.ts";
import { interpret } from "./interpreter.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { updateEnvironment } from "./util/environment.ts";
import { AppError } from "./util/error.ts";
import { Option, Some } from "./util/monad/index.ts";

export function run(source: string): Option<AppError[]> {
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  if (tokenStream.kind === "err") {
    return tokenStream.err().map((error) => [error]);
  }
  const parseResult = parse(tokenStream.unwrap());
  if (parseResult.kind === "err") {
    return parseResult.err().map((error) => [error]);
  }
  const ast = parseResult.unwrap();
  const analysisErrors = analyze(ast);
  if (analysisErrors.length >= 1) {
    return Some(analysisErrors);
  }
  return interpret(ast).map((error) => [error]);
}
