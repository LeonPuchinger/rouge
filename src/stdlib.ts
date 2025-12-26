import { AST } from "./ast.ts";
import { ExecutionEnvironment } from "./execution.ts";
import { tokenize } from "./lexer.ts";
import { parse } from "./parser.ts";
import { InternalError } from "./util/error.ts";

const stdlib = `
    type Option<T> {
        has_value: Function() -> Boolean,
        get_value: Function(Option<T>) -> T,
        map: Function(Option<T>, Function(T) -> T) -> Option<T>,
        flat_map: Function(Option<T>, Function(T) -> Option<T>) -> Option<T>,
        or: Function(Option<T>, Option<T>) -> Option<T>,
    }

    type Nothing<T> implements Option<T> {
        has_value = function() -> Boolean {
            return false
        },

        get_value = function(this: Nothing<T>) -> T {
            runtime_panic("get_value called on a Nothing object")
        },

        map = function(
            this: Nothing<T>,
            transform: Function(T) -> T
        ) -> Option<T> {
            return this
        },

        flat_map = function(
            this: Nothing<T>,
            transform: Function(T) -> Option<T>
        ) -> Option<T> {
            return this
        },

        or = function(
            this: Nothing<T>,
            alternative: Option<T>
        ) -> Option<T> {
            return alternative
        },
    }

    type Something<T> implements Option<T> {
        value: T

        has_value = function() -> Boolean {
            return true
        }

        get_value = function(this: Something<T>) -> T {
            return this.value
        }

        map = function(
            this: Something<T>,
            transform: Function(T) -> T
        ) -> Option<T> {
            mapped_value = transform(this.value)
            return Something<T>(mapped_value)
        },

        flat_map = function(
            this: Something<T>,
            transform: Function(T) -> Option<T>
        ) -> Option<T> {
            return transform(this.value)
        },

        or = function(
            this: Something<T>,
            alternative: Option<T>
        ) -> Option<T> {
            return this
        },
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
            runtime_panic("get_error called on an Ok object")
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
            runtime_panic("get_value called on an Error object")
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

    type Node<T> {
        append: Function(Node<T>, T) -> Node<T>,
        at: Function(Node<T>, Number) -> Option<T>,
        size: Function(Node<T>) -> Number,
    }

    type Container<T> implements Node<T> {
        next: Node<T>,
        value: T,

        append = function(this: Container<T>, element: T) -> Node<T> {
            this.next = this.next.append(element)
            return this
        },

        at = function(this: Container<T>, index: Number) -> Option<T> {
            if (index == 0) {
                return Something<T>(this.value)
            }
            return this.next.at(index - 1)
        },

        size = function(this: Container<T>) -> Number {
            return this.next.size() + 1
        },
    }

    type Empty<T> implements Node<T> {
        append = function(this: Empty<T>, element: T) -> Node<T> {
            return Container<T>(this, element)
        },

        at = function(this: Empty<T>, index: Number) -> Option<T> {
            return Nothing<T>()
        },

        size = function(this: Empty<T>) -> Number {
            return 0
        },
    }

    type List<T> {
        first: Node<T> = Empty<T>(),

        append = function(this: List<T>, element: T) {
            this.first = this.first.append(element)
        },

        prepend = function(this: List<T>, element: T) {
            this.first = Container<T>(this.first, element)
        },

        at = function(this: List<T>, index: Number) -> Option<T> {
            return this.first.at(index)
        },

        size = function(this: List<T>) -> Number {
            return this.first.size()
        },

        slice = function(this: List<T>, start: Number, end: Number) -> List<T> {
            current_size = this.size()
            copy = List<T>()
            if (current_size == 0) {
                return copy
            }
            slice_start = start
            if (slice_start > current_size - 1) {
                slice_start = current_size - 1
            }
            if (slice_start < 0) {
                slice_start = 0
            }
            slice_end = end
            if (slice_end > current_size) {
                slice_end = current_size
            }
            if (slice_end < 0) {
                slice_end = 0
            }
            if (slice_end < slice_start + 1) {
                return copy
            }
            index = slice_start
            while (index < slice_end) {
                element = this.at(index)
                copy.append(element.get_value())
                index = index + 1
            }
            return copy
        },
    }

    print = function(message: String) {
        runtime_print_newline(message)
    }

    print_no_newline = function(message: String) {
        runtime_print_no_newline(message)
    }

    floor = function(input: Number) -> Number {
        return runtime_floor(input)
    }
`;

/**
 * Parses a separate and independent AST for the standard library.
 */
export function parseStdlib(
    environment: ExecutionEnvironment,
) {
    environment.source = stdlib;
    const tokenStream = tokenize(stdlib);
    const ast = parse(environment, tokenStream);
    environment.source = "";
    return ast;
}

/**
 * Performs static analyis on the stdlib.
 * Should be called before the stdlib is injected into the symbol table
 * or the static analyis of the input source is performed.
 */
export function analyzeStdlib(
    environment: ExecutionEnvironment,
    stdlibAst: AST,
) {
    environment.source = stdlib;
    environment.analysisTable.setGlobalFlagOverrides({
        stdlib: true,
    });
    environment.analysisTable.setScopedFlagOverrides({
        readonly: true,
    });
    environment.analysisTable.ignoreRuntimeBindings = false;
    environment.typeTable.setGlobalFlagOverrides({
        readonly: true,
        stdlib: true,
    });
    environment.typeTable.ignoreRuntimeTypes = false;
    const analysisFindings = stdlibAst.analyze(environment);
    environment.source = "";
    environment.analysisTable.setGlobalFlagOverrides({
        stdlib: "notset",
    });
    environment.analysisTable.ignoreRuntimeBindings = true;
    environment.typeTable.setGlobalFlagOverrides({
        readonly: "notset",
        stdlib: "notset",
    });
    environment.typeTable.ignoreRuntimeTypes = true;
    if (analysisFindings.errors.length !== 0) {
        throw new InternalError(
            "The standard library contains static analysis errors.",
        );
    }
    // keep the stdlib in a separate scope
    environment.analysisTable.pushScope();
    environment.typeTable.pushScope();
}

/**
 * Loads the standard library into the symbol and type table.
 * It is assumed that both tables are set to the global scope.
 */
export function injectStdlib(
    environment: ExecutionEnvironment,
    stdlibAst: AST,
) {
    environment.source = stdlib;
    environment.runtimeTable.setGlobalFlagOverrides({
        stdlib: true,
    });
    environment.runtimeTable.setScopedFlagOverrides({
        readonly: true,
    });
    environment.typeTable.setGlobalFlagOverrides({
        readonly: true,
    });
    environment.typeTable.setScopedFlagOverrides({
        readonly: true,
    });
    stdlibAst.interpret(environment);
    environment.runtimeTable.setGlobalFlagOverrides({
        readonly: "notset",
        stdlib: "notset",
    });
    environment.typeTable.setGlobalFlagOverrides({
        readonly: "notset",
        stdlib: "notset",
    });
    environment.source = "";
    // keep the stdlib in a separate scope
    environment.runtimeTable.pushScope();
    environment.typeTable.pushScope();
}
