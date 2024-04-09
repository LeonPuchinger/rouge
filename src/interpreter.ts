import * as ast from "./ast.ts";

// TODO: move to an appropriate file
export const interpret = (node: ast.AST) => node.interpret();
