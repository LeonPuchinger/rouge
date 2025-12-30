import { Option } from "./main.ts";
import { FileLike } from "./streams.ts";
import {
  AnalysisSymbolTable,
  InterpreterSymbolTable,
  SymbolTable,
} from "./symbol.ts";
import { TypeTable } from "./type.ts";
import { Some } from "./util/monad/option.ts";

/**
 * Encapsulates the entire state of the interpreter throughout static
 * analysis and interpretation. An instance of the environment is passed
 * down the call stack to every function that requires access to the state.
 */
export class ExecutionEnvironment {
  analysisTable!: AnalysisSymbolTable;
  runtimeTable!: InterpreterSymbolTable;
  typeTable!: TypeTable;
  stdout!: Option<FileLike<string>>;
  stderr!: Option<FileLike<string>>;
  stdin!: Option<FileLike<string>>;
  source!: string;

  constructor(params: {
    analysisTable?: AnalysisSymbolTable;
    runtimeTable?: InterpreterSymbolTable;
    typeTable?: TypeTable;
    stdout?: FileLike<string>;
    stderr?: FileLike<string>;
    stdin?: FileLike<string>;
    source: string;
  }) {
    params.analysisTable ??= new SymbolTable();
    params.runtimeTable ??= new SymbolTable();
    params.typeTable ??= new TypeTable();
    Object.assign(this, params);
    this.stdout = Some(params.stdout);
    this.stderr = Some(params.stderr);
    this.stdin = Some(params.stdin);
  }
}

/**
 * These options are intended for developers of the interpreter
 * to enable or disable certain sanity checks and debugging features.
 * They should not be enabled in production environments.
 * The options are exposed as the global constant `DEVELOPER_OPTIONS` within the project.
 */
type DeveloperOptions = {
  /**
   * Sanity checks are additional checks that verify the internal consistency
   * of the interpreter state at various points during execution. They can help
   * to identify errors made during development, but may introduce significant
   * overhead.
   */
  enableSanityChecks: boolean;
};

export const DEVELOPER_OPTIONS: DeveloperOptions = {
  enableSanityChecks: false,
};
