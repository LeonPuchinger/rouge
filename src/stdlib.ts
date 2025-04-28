import { AST } from "./ast.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { analysisTable, runtimeTable } from "./symbol.ts";
import { typeTable } from "./type.ts";
import { updateEnvironment } from "./util/environment.ts";
import { InternalError } from "./util/error.ts";

const stdlib = `
    type Option<T> {
        has_value: Function() -> Boolean,
        get_value: Function(Option<T>) -> T,
    }

    type Nothing<T> implements Option<T> {
        has_value = function() -> Boolean {
            return false
        }

        get_value = function(this: Nothing<T>) -> T {
            runtime_panic("get_value called on a Nothing object")
        }
    }

    type Something<T> implements Option<T> {
        value: T

        has_value = function() -> Boolean {
            return true
        }

        get_value = function(this: Something<T>) -> T {
            return this.value
        }
    }

    type Result<T, E> {
        is_ok: Function() -> Boolean
        get_value: Function(Result<T, E>) -> T
        get_error: Function(Result<T, E>) -> E
        map: Function(Result<T, E>, Function(T) -> T) -> Result<T, E>
    }

    type Ok<T, E> implements Result<T, E> {
        value: T

        is_ok = function() -> Boolean {
            return true
        }

        get_value = function(this: Ok<T, E>) -> T {
            return this.value
        }

        get_error = function(this: Ok<T, E>) -> E {
            panic("get_error called on an Ok object")
        }

        map = function(
            this: Ok<T, E>,
            transform: Function(T) -> T
        ) -> Result<T, E> {
            mapped_value = transform(this.value)
            return Ok<T, E>(mapped_value)
        }
    }

    type Error<T, E> implements Result<T, E> {
        error: E

        is_ok = function() -> Boolean {
            return false
        }

        get_value = function(this: Error<T, E>) -> T {
            panic("get_value called on an Error object")
        }

        get_error = function(this: Error<T, E>) -> E {
            return this.error
        }

        map = function(
            this: Error<T, E>,
            transform: Function(T) -> T
        ) -> Result<T, E> {
            return this
        }
    }

    print = function(message: String) {
        runtime_print_newline(message)
    }

    print_no_newline = function(message: String) {
        runtime_print_no_newline(message)
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
    typeTable.setGlobalFlagOverrides({ readonly: true, stdlib: true });
    typeTable.ignoreRuntimeTypes = false;
    const analysisFindings = stdlibAst.analyze();
    updateEnvironment({ source: "" });
    analysisTable.setGlobalFlagOverrides({
        readonly: "notset",
        stdlib: "notset",
    });
    analysisTable.ignoreRuntimeBindings = true;
    typeTable.setGlobalFlagOverrides({ readonly: "notset", stdlib: "notset" });
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
    typeTable.setGlobalFlagOverrides({ readonly: true, stdlib: true });
    stdlibAst.interpret();
    runtimeTable.setGlobalFlagOverrides({
        readonly: "notset",
        stdlib: "notset",
    });
    typeTable.setGlobalFlagOverrides({ readonly: "notset", stdlib: "notset" });
    updateEnvironment({ source: "" });
}
