import { rule } from "typescript-parsec";
import * as ast from "../ast.ts";
import { TokenType } from "../lexer.ts";

/*
This file can be used to forward-declare parser rules to avoid circular imports.

Example:
Boolean expressions can consist of general expressions.
However, general expressions also depend on boolean expressions.
Assuming that both parsers are declared in separate files which both import each other in a circular way,
typescript will throw an "access before initialization" error.
ES module import statements are hoisted to the top of every file,
therefore it is useless to place the forward declaration before the import statement in at least one of the files.
To mitigate this issue, the parsers can be declared in this (separate) file.
*/

export const booleanlessExpression = rule<TokenType, ast.ExpressionAstNode>();
