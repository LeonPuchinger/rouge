import { AST } from "./ast.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { analysisTable, runtimeTable } from "./symbol.ts";
import { typeTable } from "./type.ts";
import { updateEnvironment } from "./util/environment.ts";
import { InternalError } from "./util/error.ts";

const stdlib = `
    print = function(message: String) {
        runtime_print(message)
    }

    reverse = function(message: String) -> String {
        return runtime_reverse(message)
    }
`;

/**
 * Parses a separate and independent AST for the standard library.
 */
export function parseStdlib() {
    updateEnvironment({ source: stdlib });
    const tokenStream = tokenize(stdlib);
    const ast = parse(tokenStream);
    updateEnvironment({ source: "" });
    return ast;
}

/**
 * Performs static analyis on the stdlib.
 * Should be called before the stdlib is injected into the symbol table
 * or the static analyis of the input source is performed.
 */
export function analyzeStdlib(stdlibAst: AST) {
    updateEnvironment({ source: stdlib });
    analysisTable.setGlobalFlagOverrides({ readonly: true, stdlib: true });
    analysisTable.ignoreRuntimeBindings = false;
    typeTable.setGlobalFlagOverrides({ readonly: true });
    typeTable.ignoreRuntimeTypes = false;
    const analysisFindings = stdlibAst.analyze();
    updateEnvironment({ source: "" });
    analysisTable.setGlobalFlagOverrides({
        readonly: "notset",
        stdlib: "notset",
    });
    analysisTable.ignoreRuntimeBindings = true;
    typeTable.setGlobalFlagOverrides({ readonly: "notset" });
    typeTable.ignoreRuntimeTypes = true;
    if (analysisFindings.errors.length !== 0) {
        throw new InternalError(
            "The standard library contains static analysis errors.",
        );
    }
}

/**
 * Loads the standard library into the symbol and type table.
 * It is assumed that both tables are set to the global scope.
 */
export function injectStdlib(stdlibAst: AST) {
    updateEnvironment({ source: stdlib });
    runtimeTable.setGlobalFlagOverrides({ readonly: true, stdlib: true });
    typeTable.setGlobalFlagOverrides({ readonly: true });
    stdlibAst.interpret();
    runtimeTable.setGlobalFlagOverrides({
        readonly: "notset",
        stdlib: "notset",
    });
    typeTable.setGlobalFlagOverrides({ readonly: "notset" });
    updateEnvironment({ source: "" });
}
