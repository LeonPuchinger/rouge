import { Token } from "typescript-parsec";
import { InterpretableAstNode } from "./ast.ts";
import { StatementsAstNode } from "./features/statement.ts";
import { AnalysisFindings } from "./finding.ts";
import { TokenKind } from "./lexer.ts";
import {
    analysisTable,
    FunctionSymbolValue,
    RuntimeSymbol,
    runtimeTable,
    StaticSymbol,
} from "./symbol.ts";
import { FunctionSymbolType, SymbolType } from "./type.ts";
import { nothingType } from "./util/type.ts";

export class RuntimeStatementAstNode implements InterpretableAstNode {
    private hook!: () => void;

    constructor(params: { hook: () => void }) {
        Object.assign(this, params);
    }

    interpret(): void {
        this.hook();
    }

    analyze(): AnalysisFindings {
        return AnalysisFindings.empty();
    }

    tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
        throw new Error("Method not implemented.");
    }
}

export function injectRuntimeBindings() {
    const statements = new StatementsAstNode({
        children: [
            new RuntimeStatementAstNode({
                hook: () => {
                    console.log("hello from print!");
                },
            }),
        ],
    });

    const parameterTypes = new Map<string, SymbolType>();
    const returnType = nothingType;

    const symbolValue = new FunctionSymbolValue({
        value: statements,
        parameterTypes: parameterTypes,
        returnType: nothingType,
    });
    const rtSymbol = new RuntimeSymbol({
        value: symbolValue,
    });

    const fnType = new FunctionSymbolType({
        parameterTypes: Array.from(parameterTypes.values()),
        returnType: returnType,
    });
    const stSymbol = new StaticSymbol({
        valueType: fnType,
    });

    runtimeTable.setRuntimeBinding("runtime_print_no_newline", rtSymbol);
    analysisTable.setRuntimeBinding("runtime_print_no_newline", stSymbol);
}
