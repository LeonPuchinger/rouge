import {
  AnalysisSymbolTable,
  InterpreterSymbolTable,
  SymbolTable,
} from "./symbol.ts";
import { TypeTable } from "./type.ts";

/**
 * Encapsulates the entire state of the interpreter throughout static
 * analysis and interpretation. An instance of the environment is passed
 * down the call stack to every function that requires access to the state.
 */
export class ExecutionEnvironment {
  analysisTable!: AnalysisSymbolTable;
  runtimeTable!: InterpreterSymbolTable;
  typeTable!: TypeTable;
  source!: string;

  constructor(params: {
    analysisTable?: AnalysisSymbolTable;
    runtimeTable?: InterpreterSymbolTable;
    typeTable?: TypeTable;
    source: string;
  }) {
    params.analysisTable ??= new SymbolTable();
    params.runtimeTable ??= new SymbolTable();
    params.typeTable ??= new TypeTable();
    Object.assign(this, params);
  }
}
