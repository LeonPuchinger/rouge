import { ExecutionEnvironment } from "./execution.ts";
import { AnalysisFindings } from "./finding.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { injectRuntimeBindings } from "./runtime.ts";
import { analyzeStdlib, injectStdlib, parseStdlib } from "./stdlib.ts";
import { FileLike, VirtualTextFile } from "./streams.ts";
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
  const environment = new ExecutionEnvironment({ source });
  environment.typeTable.reset();
  environment.analysisTable.reset(false);
  environment.runtimeTable.reset(false);
  injectRuntimeBindings(environment, false, stdout, stderr, stdin);
  const stdlibAst = parseStdlib(environment);
  analyzeStdlib(
    environment,
    stdlibAst,
  );
  // TODO: update new environment
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  const ast = parse(environment, tokenStream);
  const analysisFindings = ast.analyze(environment);
  environment.typeTable.reset();
  if (analysisFindings.errors.length == 0) {
    injectStdlib(
      environment,
      stdlibAst,
    );
    ast.interpret(environment);
  }
  return analysisFindings;
}

export function analyze(source: string): AnalysisFindings {
  const environment = new ExecutionEnvironment({ source });
  environment.typeTable.reset();
  environment.analysisTable.reset(true);
  injectRuntimeBindings(environment, true);
  const stdlibAst = parseStdlib(environment);
  analyzeStdlib(environment, stdlibAst);
  // TODO: update new environment
  updateEnvironment({ source: source });
  const tokenStream = tokenize(source);
  const ast = parse(environment, tokenStream);
  const analysisFindings = ast.analyze(environment);
  return analysisFindings;
}
