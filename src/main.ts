import { AnalysisFindings } from "./finding.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { updateEnvironment } from "./util/environment.ts";

export function run(source: string): AnalysisFindings {
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  const ast = parse(tokenStream);
  ast.configure({ representsGlobalScope: true });
  const analysisFindings = ast.analyze();
  if (analysisFindings.errors.length == 0) {
    ast.interpret();
  }
  return analysisFindings;
}
