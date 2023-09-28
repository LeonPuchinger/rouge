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

  private findSymbolInScope(name: string, scope: Scope): Symbol | undefined {
    return scope.get(name);
  }

  findSymbol(name: string, symbolType?: SymbolType): Symbol | undefined {
    for (const current_scope of this.scopes) {
      const symbol = this.findSymbolInScope(name, current_scope);
      if (symbol === undefined) {
        continue;
      }
      if (symbolType && symbol.symbolType !== symbolType) {
        continue;
      }
      return symbol;
    }
    return undefined;
  }

  setSymbol(name: string, symbol: Symbol) {
    const current_scope = this.scopes[this.scopes.length - 1];
    current_scope.set(name, symbol);
  }
}
