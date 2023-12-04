import { analyze } from "./analysis.ts";
import { interpret } from "./interpreter.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { updateEnvironment } from "./util/environment.ts";
import { PrintableError } from "./util/error.ts";

export function run(source: string): PrintableError[] {
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  if (tokenStream.kind === "err") {
    return tokenStream.err().iter();
  }
  const parseResult = parse(tokenStream.unwrap());
  if (parseResult.kind === "err") {
    return parseResult.err().iter();
  }
  const ast = parseResult.unwrap();
  const analysisFindings = analyze(ast);
  if (analysisFindings.errors.length >= 1) {
    return analysisFindings.errors;
  }
  return interpret(ast).iter();
}
