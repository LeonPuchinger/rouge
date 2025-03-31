import { rule } from "typescript-parsec";
import { TokenKind } from "../lexer.ts";
import { ConditionAstNode } from "./condition.ts";
import {
  FunctionDefinitionAstNode,
  ReturnStatementAstNode,
} from "./function.ts";
import { InvocationAstNode } from "./invocation.ts";
import { StatementsAstNode } from "./statement.ts";

/*
This file contains uninitialized parser declarations.
The declarations are kept in this separate file to break
cyclic dependencies in regards to the ES6 module system.
The parsers are initialized using the `setPattern` member function
in each individual feature file. To trigger the initialization,
the feature files are imported from a central location: `parser.ts`.

Example: the condition parser has a dependency on the statements parser.
However, the statements parser also has a dependency on the condition parser,
thus creating a cyclic dependeny. In case those two parsers were defined in the same file,
this would not be an issue using the `setPattern` approach. However, spreading the parsers
over two files creates a problem. ESM imports are hoisted to the top of each file.
Therefore, the imports cannot be "timed" in the right way (like with requireJS).
In this case, "timing" refers to strategically placing the imports statements in each file
in order to not import a field from another file too early.
To resolve the issue, the declaration for one of the parsers (condition) is moved to a
dedicated declarations file (this one). The declarations file does not import any fields
from within the project that are not types (the issue does not arise when importing just types).
Now, statements can reference the condition parser without a cyclic dependency.
The only thing remaining to do is initialize the condition parser. The `setPatter` method
is called from within conditions feature file, which is imported from the central `parser.ts` file.
Triggering the initialization from `parser.ts` has the advantage that the parsers are guaranteed
to be initialized before parsing starts.

Before:

statements -> condition -> statements -> ...

After:

statements -> declarations
condition -> declarations
parser -> condition
*/

export const condition = rule<TokenKind, ConditionAstNode>();

export const functionDefinition = rule<TokenKind, FunctionDefinitionAstNode>();

export const returnStatement = rule<TokenKind, ReturnStatementAstNode>();

export const invocation = rule<TokenKind, InvocationAstNode>();

export const statements = rule<TokenKind, StatementsAstNode>();
