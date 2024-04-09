import * as ast from "./ast.ts";

// TODO: move to an appropriate file
export const analyze = (node: ast.AST) => node.check();
