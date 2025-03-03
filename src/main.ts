import { AnalysisFindings } from "./finding.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { injectRuntimeBindings } from "./runtime.ts";
import { analyzeStdlib, injectStdlib, parseStdlib } from "./stdlib.ts";
import { FileLike, VirtualTextFile } from "./streams.ts";
import { analysisTable, runtimeTable } from "./symbol.ts";
import { typeTable } from "./type.ts";
import { updateEnvironment } from "./util/environment.ts";

export type {
  AnalysisFinding,
  AnalysisFindingKind,
  AnalysisFindings,
} from "./finding.ts";
export { VirtualTextFile } from "./streams.ts";
export type {
  ReadableStream,
  StreamSubscription,
  WritableSink,
} from "./streams.ts";
export type { Option, Result } from "./util/monad/index.ts";

export function run(
  source: string,
  stdout: FileLike<string> = new VirtualTextFile(),
  stderr: FileLike<string> = new VirtualTextFile(),
  stdin: FileLike<string> = new VirtualTextFile(),
): AnalysisFindings {
  typeTable.reset();
  analysisTable.reset(false);
  runtimeTable.reset(false);
  injectRuntimeBindings(false, stdout, stderr, stdin);
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
  typeTable.reset();
  analysisTable.reset(true);
  injectRuntimeBindings(true);
  const stdlibAst = parseStdlib();
  analyzeStdlib(stdlibAst);
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  const ast = parse(tokenStream);
  const analysisFindings = ast.analyze();
  return analysisFindings;
}
