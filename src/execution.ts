import { AnalysisSymbolTable, InterpreterSymbolTable } from "./symbol.ts";
import { TypeTable } from "./type.ts";
import { Attributes } from "./util/type.ts";

export class ExecutionEnvironment {
  analysisTable!: AnalysisSymbolTable;
  runtimeTable!: InterpreterSymbolTable;
  typeTable!: TypeTable;
  source!: string;

  constructor(params: Attributes<ExecutionEnvironment>) {
    Object.assign(this, params);
  }
}
