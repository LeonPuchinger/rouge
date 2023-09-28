import { AstNode } from "./ast.ts";
import { lexer } from "./lexer.ts";
import { parser } from "./parser.ts";

function preorder_ast(node: AstNode) {
  console.log(node);
  node.children.forEach((child) => preorder_ast(child));
}

export function interpret(source: string) {
  const tokenStream = lexer.parse(source);
  const parseResult = parser.parse(tokenStream);
  if (!parseResult.successful) {
    console.log("An error occured while parsing:");
    console.log(parseResult.error);
    return;
  }
  const numberCandidates = parseResult.candidates.length;
  if (numberCandidates > 1) {
    console.log("Ambiguity detected");
    console.log(`There are ${numberCandidates} ways to parse the input.`);
    console.log("In the following, only the first possible AST is shown.");
    console.log("Use the debugger to inspect the other results.");
  }
  const first_candidate = parseResult.candidates[0];
  // language is not implemented yet, preorder through AST instead
  preorder_ast(first_candidate.result);
}
