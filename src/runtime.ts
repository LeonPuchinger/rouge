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
import { InternalError } from "./util/error.ts";
import { nothingType } from "./util/type.ts";

/**
 * Runtime bindings can be parametrized by pushing the parameter
 * values onto the symbol table. This function retrieves the underlying
 * values from the corresponding symbol stored in the table via a name.
 */
function retrieveRuntimeParameter<T>(
    name: string,
): T {
    const symbol = runtimeTable.findSymbol(name)
        .map(([symbol, _flags]) => symbol)
        .unwrapOrThrow(
            new InternalError(
                "The underlying hook for a runtime binding tried to access a parameter that should have been supplied to the runtime binding.",
                `However, the parameter called "${name}" could not be found in the symbol table.`,
            ),
        );
    return symbol.value.value as T;
}

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

    /**
     * It is assumed that this method is never going to be called.
     * A `RuntimeStatementAstNode` is supposed to be the only child
     * of a `StatementsAstNode` when it is used as a runtime binding.
     * The `analyze` method of the `RuntimeStatementAstNode` will never
     * yield any findings, which means that no snippet of this AST node
     * ever has to be generated. Therefore, the token range is never accessed.
     */
    tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
        throw new InternalError(
            "The token range for a RuntimeStatementAstNode should never be accessed.",
        );
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
