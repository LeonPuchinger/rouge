export enum AstNodeType {
  assign,
  ident,
  int_literal,
}

export class AstNode {
  constructor(
    public nodeType: AstNodeType,
    public children: Array<AstNode> = [],
  ) {}

  addChild(child: AstNode) {
    this.children.push(child);
  }
}
