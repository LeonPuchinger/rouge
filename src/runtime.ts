import { Token } from "typescript-parsec";
import { InterpretableAstNode } from "./ast.ts";
import { ReturnValueContainer } from "./features/function.ts";
import { StatementsAstNode } from "./features/statement.ts";
import { AnalysisFindings } from "./finding.ts";
import { TokenKind } from "./lexer.ts";
import { ReadableStream, WritableSink } from "./streams.ts";
import {
    analysisTable,
    FunctionSymbolValue,
    RuntimeSymbol,
    runtimeTable,
    StaticSymbol,
    StringSymbolValue,
    SymbolValue,
} from "./symbol.ts";
import {
    CompositeSymbolType,
    FunctionSymbolType,
    PlaceholderSymbolType,
    SymbolType,
} from "./type.ts";
import { InternalError, PanicError } from "./util/error.ts";
import { nothingInstance, nothingType } from "./util/type.ts";

/**
 * Runtime bindings can be parametrized by pushing the parameter
 * values onto the symbol table. This function retrieves the symbol value
 * from the corresponding symbol stored in the table via a name.
 * It also asserts that the symbol exists in the table.
 */
function resolveRuntimeParameter(
    name: string,
): SymbolValue {
    const symbol = runtimeTable.findSymbol(name)
        .map(([symbol, _flags]) => symbol)
        .unwrapOrThrow(
            new InternalError(
                "The underlying hook for a runtime binding tried to access a parameter that should have been supplied to the runtime binding.",
                `However, the parameter called "${name}" could not be found in the symbol table.`,
            ),
        );
    return symbol.value;
}

/**
 * This AST node is the key as to how runtime bindings are implemented.
 * From the perspective of the interpreter, this AST node allows injecting
 * native behavior into its `interpret` method via the `hook` callback.
 * From the perspective of the language, this AST node represents a regular
 * statement. When a runtime binding is created, a function is created that only
 * contains a single statement, which is an instance of this AST node.
 * Therefore, when this artificial runtime function is invocated, the language
 * actually invokes the provided `hook`.
 */
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

type HookParameter = {
    name: string;
    symbolType: SymbolType;
};

/**
 * Responsible for creating the runtime symbol for a runtime binding
 * that will end up in the runtime table.
 */
export function createRuntimeBindingRuntimeSymbol(
    parameters: HookParameter[],
    returnType: SymbolType,
    hook: (params: Map<string, SymbolValue>) => SymbolValue | void,
    placeholders: Map<string, PlaceholderSymbolType> = new Map(),
): RuntimeSymbol<SymbolValue> {
    const parameterTypes = new Map<string, SymbolType>(
        parameters.map((param) => [param.name, param.symbolType]),
    );
    const statements = new StatementsAstNode({
        children: [
            new RuntimeStatementAstNode({
                hook: () => {
                    const resolvedParameters = new Map<string, SymbolValue>(
                        parameters.map((param) => [
                            param.name,
                            resolveRuntimeParameter(param.name),
                        ]),
                    );
                    const returnValue = hook(resolvedParameters) ??
                        nothingInstance;
                    throw new ReturnValueContainer(returnValue);
                },
            }),
        ],
    });
    const symbolValue = new FunctionSymbolValue({
        value: statements,
        parameterTypes: parameterTypes,
        placeholderTypes: placeholders,
        returnType: returnType,
    });
    return new RuntimeSymbol({
        value: symbolValue,
    });
}

/**
 * Responsible for creating the static symbol for a runtime binding
 * that will end up in the analysis table.
 */
function createRuntimeBindingStaticSymbol(
    parameters: HookParameter[],
    returnType: SymbolType = nothingType,
): StaticSymbol {
    const parameterTypes = parameters.map((param) => param.symbolType);
    return new StaticSymbol({
        valueType: new FunctionSymbolType({
            parameterTypes: Array.from(parameterTypes),
            returnType: returnType,
        }),
    });
}

/**
 * Creates a new runtime binding and injects it into the symbol table with the
 * given `name`. The `hook` defines the behavior of the binding. Finally,
 * the `onlyAnalysis` flag can be used to only inject the binding into the
 * analysis table.
 */
function createRuntimeBinding(
    name: string,
    parameters: HookParameter[],
    returnType: SymbolType,
    hook: (params: Map<string, SymbolValue>) => SymbolValue | void,
    onlyAnalysis: boolean = false,
) {
    if (!onlyAnalysis) {
        runtimeTable.setRuntimeBinding(
            name,
            createRuntimeBindingRuntimeSymbol(parameters, returnType, hook),
        );
    }
    analysisTable.setRuntimeBinding(
        name,
        createRuntimeBindingStaticSymbol(parameters, returnType),
    );
}

/**
 * Creates all the necessary runtime bindings for the stdlib to function properly.
 * The `onlyAnalysis` flag can be used to only inject the bindings into the
 * analysis table.
 */
export function injectRuntimeBindings(
    onlyAnalysis: boolean = false,
    stdout?: WritableSink<string>,
    stderr?: WritableSink<string>,
    stdin?: ReadableStream<string>,
) {
    const stdStreamsDefined = [stdout, stderr, stdin]
        .every((stream) => stream !== undefined);
    if (!onlyAnalysis && !stdStreamsDefined) {
        throw new InternalError(
            "The standard streams may only be omitted when the runtime bindings are injected for static analysis.",
        );
    }

    createRuntimeBinding(
        "runtime_print_newline",
        [{
            name: "message",
            symbolType: new CompositeSymbolType({ id: "String" }),
        }],
        nothingType,
        (params) => {
            const message = params.get("message")!.value as string;
            stdout?.writeLine(message);
        },
        onlyAnalysis,
    );

    createRuntimeBinding(
        "runtime_print_no_newline",
        [{
            name: "message",
            symbolType: new CompositeSymbolType({ id: "String" }),
        }],
        nothingType,
        (params) => {
            const message = params.get("message")!.value as string;
            stdout?.writeChunk(message);
        },
        onlyAnalysis,
    );

    createRuntimeBinding(
        "runtime_panic",
        [{
            name: "reason",
            symbolType: new CompositeSymbolType({ id: "String" }),
        }],
        nothingType,
        (params) => {
            const reason = params.get("reason")!.value as string;
            throw new PanicError(reason);
        },
        onlyAnalysis,
    );

    createRuntimeBinding(
        "runtime_reverse",
        [{
            name: "message",
            symbolType: new CompositeSymbolType({ id: "String" }),
        }],
        new CompositeSymbolType({ id: "String" }),
        (params) => {
            const message = params.get("message")!.value as string;
            const reversed = message.split("").reverse().join("");
            return new StringSymbolValue(reversed);
        },
        onlyAnalysis,
    );
}
