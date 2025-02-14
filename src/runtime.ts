import { StatementsAstNode } from "./features/statement.ts";
import {
    analysisTable,
    FunctionSymbolValue,
    RuntimeSymbol,
    runtimeTable,
    StaticSymbol,
} from "./symbol.ts";
import { FunctionSymbolType, SymbolType } from "./type.ts";
import { nothingType } from "./util/type.ts";

export function injectRuntimeBindings() {
    const statements = new StatementsAstNode({
        children: [],
    });

    const parameterTypes = new Map<string, SymbolType>();
    const returnType = nothingType;
    const fnType = new FunctionSymbolType({
        parameterTypes: Array.from(parameterTypes.values()),
        returnType: returnType,
    });

    const symbolValue = new FunctionSymbolValue({
        value: statements,
        parameterTypes: parameterTypes,
        returnType: nothingType,
    });

    const rtSymbol = new RuntimeSymbol({
        value: symbolValue,
    });

    const stSymbol = new StaticSymbol({
        valueType: fnType,
    });

    runtimeTable.setRuntimeBinding("runtime_print_no_newline", rtSymbol);
    analysisTable.setRuntimeBinding("runtime_print_no_newline", stSymbol);
}
