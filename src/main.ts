import { ExecutionEnvironment } from "./execution.ts";
import { AnalysisFindings } from "./finding.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { injectRuntimeBindings } from "./runtime.ts";
import { analyzeStdlib, injectStdlib, parseStdlib } from "./stdlib.ts";
import { FileLike, VirtualTextFile } from "./streams.ts";
import { Ok, Result } from "./util/monad/index.ts";
import { Err } from "./util/monad/result.ts";

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

/**
 * Performs the entire interpreter lifecycle (static analysis
 * and interpretation) on a given program. Standard streams can
 * be provided to capture output and provide input to the program.
 */
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
  environment.source = source;
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

/**
 * Initializes and returns the state of the interpreter to the point
 * where individual statements can be interpreted. The returned environment
 * needs to be passed to every invocation of `repl`.
 */
export function openRepl(
  stdout: FileLike<string> = new VirtualTextFile(),
  stderr: FileLike<string> = new VirtualTextFile(),
  stdin: FileLike<string> = new VirtualTextFile(),
): ExecutionEnvironment {
  const environment = new ExecutionEnvironment({ source: "" });
  environment.typeTable.reset();
  environment.analysisTable.reset(false);
  environment.runtimeTable.reset(false);
  injectRuntimeBindings(environment, false, stdout, stderr, stdin);
  const stdlibAst = parseStdlib(environment);
  analyzeStdlib(
    environment,
    stdlibAst,
  );
  environment.typeTable.reset();
  injectStdlib(
    environment,
    stdlibAst,
  );
  return environment;
}

/**
 * Perform static analysis and interpret a single statement in the REPL.
 */
export function invokeRepl(
  environment: ExecutionEnvironment,
  statement: string,
): Result<string, AnalysisFindings> {
  environment.source = statement;
  const tokenStream = tokenize(statement);
  const ast = parse(environment, tokenStream);
  // Save the state of the type table before performing analysis as the
  // modifications made during analysis can interfere with interpretation.
  // The state is restored after static analysis concludes.
  const typeTableWithoutAnalysis = environment.typeTable.createSnapshot();
  const analysisFindings = ast.analyze(environment);
  environment.typeTable.reset(typeTableWithoutAnalysis);
  if (analysisFindings.errors.length == 0) {
    const representation = ast.get_representation(environment);
    return Ok(representation);
  }
  return Err(analysisFindings);
}

/**
 * Free resouces used by the REPL. The environment itself can then
 * be let out of scope safely.
 */
export function closeRepl(environment: ExecutionEnvironment) {
  // TODO: close std streams (if requested)
  environment.typeTable.reset();
  environment.analysisTable.reset(false);
  environment.runtimeTable.reset(false);
  environment.source = "";
}

/**
 * Only perform static analysis on a given program without invoking the interpreter.
 */
export function analyze(source: string): AnalysisFindings {
  const environment = new ExecutionEnvironment({ source });
  environment.typeTable.reset();
  environment.analysisTable.reset(true);
  injectRuntimeBindings(environment, true);
  const stdlibAst = parseStdlib(environment);
  analyzeStdlib(environment, stdlibAst);
  environment.source = source;
  const tokenStream = tokenize(source);
  const ast = parse(environment, tokenStream);
  const analysisFindings = ast.analyze(environment);
  return analysisFindings;
}
