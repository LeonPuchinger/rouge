import {
  AnalysisSymbolTable,
  InterpreterSymbolTable,
  SymbolTable,
} from "./symbol.ts";
import { TypeTable } from "./type.ts";

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
