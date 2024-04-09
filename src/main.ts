import { AnalysisFindings } from "./finding.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { updateEnvironment } from "./util/environment.ts";

// TODO: pick back up
export function run(source: string): AnalysisFindings {
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  const ast = parse(tokenStream);
  const analysisFindings = ast.check();
  if (analysisFindings.errors.length == 0) {
    ast.interpret();
  }
  return analysisFindings;
}
