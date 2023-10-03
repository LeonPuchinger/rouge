import { AstNode } from "./ast.ts";
import { none, Option, some } from "./util/monad.ts";

export enum SymbolType {
  variable,
}

interface SymbolParams {
  symbolType: SymbolType;
  node?: AstNode;
}

export class Symbol {
  symbolType: SymbolType;
  node: Option<AstNode>;

  constructor(params: SymbolParams) {
    this.node = params.node ? some(params.node) : none();
    this.symbolType = params.symbolType;
  }
}

type Scope = Map<string, Symbol>;

export class Table {
  private scopes: Scope[] = [new Map()];

  pushScope() {
    this.scopes.push(new Map());
  }

  popScope() {
    this.scopes.pop();
    if (this.scopes.length == 0) {
      // panic & log error
    }
  }

  private findSymbolInScope(name: string, scope: Scope, symbolType?: SymbolType): Option<Symbol> {
    const symbol = scope.get(name);
    if (symbolType && symbol?.symbolType) {
      return some(symbol);
    }
    return none();
  }

  findSymbol(name: string, symbolType?: SymbolType): Option<Symbol> {
    for (const current_scope of this.scopes.toReversed()) {
      const symbol = this.findSymbolInScope(name, current_scope, symbolType);
      if (symbol.kind === "none") {
        continue;
      }
      return symbol;
    }
    return none();
  }

  setSymbol(name: string, symbol: Symbol) {
    const current_scope = this.scopes[this.scopes.length - 1];
    current_scope.set(name, symbol);
  }
}
