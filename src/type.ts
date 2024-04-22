import { InternalError } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { Attributes } from "./util/type.ts";

export interface SymbolType {
  typeCompatibleWith(other: SymbolType): boolean;
  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean;
}

type PrimitiveSymbolTypeKind = "number" | "boolean";

export class PrimitiveSymbolType implements SymbolType {
  constructor(private kind: PrimitiveSymbolTypeKind) {}

  typeCompatibleWith(other: SymbolType): boolean {
    return other instanceof PrimitiveSymbolType && other.kind === this.kind;
  }

  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean {
    return kind === this.kind;
  }
}

export class FunctionSymbolType implements SymbolType {
  parameters!: SymbolType[];
  returnType!: Option<SymbolType>;

  constructor(params: Attributes<FunctionSymbolType>) {
    Object.assign(this, params);
  }

  typeCompatibleWith(other: SymbolType): boolean {
    if (!(other instanceof FunctionSymbolType)) {
      return false;
    }
    const matchingReturnTypes = other.returnType
      .zip(this.returnType)
      .map((returnTypes) => returnTypes[0].typeCompatibleWith(returnTypes[1]))
      .unwrapOr(false);
    if (!matchingReturnTypes) {
      return false;
    }
    if (other.parameters.length !== this.parameters.length) {
      return false;
    }
    return other.parameters.every((value, index) =>
      value.typeCompatibleWith(this.parameters[index])
    );
  }

  isPrimitive(): boolean {
    return false;
  }
}

type Scope = Map<string, SymbolType>;

// TODO: register primitives (e.g. in constructor)
export class TypeTable {
  private scopes: Scope[] = [new Map()];

  pushScope() {
    this.scopes.push(new Map());
  }

  popScope() {
    this.scopes.pop();
    if (this.scopes.length === 0) {
      throw new InternalError(
        "The outermost scope of the type table has been popped.",
        "The type table always needs to consist of at least one scope.",
      );
    }
  }

  private findTypeInScope(
    name: string,
    scope: Scope,
  ): Option<SymbolType> {
    return Some(scope.get(name));
  }

  findTypeInCurrentScope(name: string): Option<SymbolType> {
    const current = this.scopes.toReversed().at(0);
    if (current !== undefined) {
      return this.findTypeInScope(name, current);
    }
    return None();
  }

  findType(name: string): Option<SymbolType> {
    for (const currentScope of this.scopes.toReversed()) {
      const symbolType = this.findTypeInScope(name, currentScope);
      if (symbolType.kind === "none") {
        continue;
      }
      return symbolType;
    }
    return None();
  }

  setType(name: string, symbolType: SymbolType) {
    const currentScope = this.scopes[this.scopes.length - 1];
    currentScope.set(name, symbolType);
  }
}

export const typeTable = new TypeTable();
