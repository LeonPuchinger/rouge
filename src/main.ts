import { AnalysisFindings, analyze } from "./analysis.ts";
import { interpret } from "./interpreter.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { updateEnvironment } from "./util/environment.ts";

// TODO: pick back up
export function run(source: string): AnalysisFindings {
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  const ast = parse(tokenStream);
  const analysisFindings = analyze(ast);
  if (analysisFindings.errors.length == 0) {
    interpret(ast);
  }
  return analysisFindings;
}
