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
