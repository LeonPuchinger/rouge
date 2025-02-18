import { AnalysisFindings } from "./finding.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { injectRuntimeBindings } from "./runtime.ts";
import { analyzeStdlib, injectStdlib, parseStdlib } from "./stdlib.ts";
import { typeTable } from "./type.ts";
import { updateEnvironment } from "./util/environment.ts";

export type {
  AnalysisFinding,
  AnalysisFindingKind,
  AnalysisFindings,
} from "./finding.ts";
export type { Option, Result } from "./util/monad/index.ts";

export function run(source: string): AnalysisFindings {
  injectRuntimeBindings();
  const stdlibAst = parseStdlib();
  analyzeStdlib(stdlibAst);
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  const ast = parse(tokenStream);
  const analysisFindings = ast.analyze();
  typeTable.reset();
  if (analysisFindings.errors.length == 0) {
    injectStdlib(stdlibAst);
    ast.interpret();
  }
  return analysisFindings;
}

export function analyze(source: string): AnalysisFindings {
  // TODO: inject runtime bindings
  const stdlibAst = parseStdlib();
  analyzeStdlib(stdlibAst);
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  const ast = parse(tokenStream);
  const analysisFindings = ast.analyze();
  return analysisFindings;
}
