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

/**
 * Represents a user defined type that is made up of other types.
 * The individual types that make up the type as a whole are referred to as fields.
 * Each field consists of a name and a type.
 * Two instances of `CompositeSymbolType` are type compatible in case they contain
 * the same amount of field, the fields have the same names,
 * and the types for each field are type compatible themselves.
 */
export class CompositeSymbolType implements SymbolType {
  fields!: Map<string, SymbolType>;

  /**
   * @param fields The key-value pairs of name and type that make up this user defined type.
   */
  constructor(params: Attributes<CompositeSymbolType>) {
    Object.assign(this, params);
  }

  typeCompatibleWith(other: SymbolType): boolean {
    if (!(other instanceof CompositeSymbolType)) {
      return false;
    }
    const thisKeys = Array.from(this.fields.keys());
    const otherKeys = Array.from(other.fields.keys());
    if (thisKeys.length !== otherKeys.length) {
      return false;
    }
    for (const key of thisKeys) {
      if (!other.fields.has(key)) {
        return false;
      }
      if (other.fields.get(key)?.typeCompatibleWith(this.fields.get(key)!)) {
        return false;
      }
    }
    return true;
  }

  isPrimitive(_kind: PrimitiveSymbolTypeKind): boolean {
    return false;
  }
}

type Scope = {
  types: Map<string, SymbolType>;
  returnType: Option<SymbolType>;
};

export class TypeTable {
  private scopes: Scope[] = [];

  constructor() {
    this.pushScope();
  }

  pushScope() {
    this.scopes.push({ types: new Map(), returnType: None() });
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
    return Some(scope.types.get(name));
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
    currentScope.types.set(name, symbolType);
  }

  setReturnType(returnType: SymbolType) {
    const current = this.scopes.at(-1)!;
    current.returnType = Some(returnType);
  }

  getReturnType(): Option<SymbolType> {
    const current = this.scopes.at(-1)!;
    return current.returnType;
  }
}

export const typeTable = new TypeTable();
typeTable.setType("number", new PrimitiveSymbolType("number"));
typeTable.setType("boolean", new PrimitiveSymbolType("boolean"));

/* ~~~ TEMPORARY ~~~ */

// will be replaced by stdlib implementation in the future

typeTable.setType("Nothing", new CompositeSymbolType({ fields: new Map() }));

/* ~~~ TEMPORARY ~~~ */
