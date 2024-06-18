import { InternalError } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { Attributes } from "./util/type.ts";

export interface SymbolType {
  typeCompatibleWith(other: SymbolType): boolean;
  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean;
  isFunction(): boolean;
}

type PrimitiveSymbolTypeKind = "Number" | "Boolean" | "String";

export class PrimitiveSymbolType implements SymbolType {
  constructor(private kind: PrimitiveSymbolTypeKind) {}

  typeCompatibleWith(other: SymbolType): boolean {
    return other instanceof PrimitiveSymbolType && other.kind === this.kind;
  }

  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean {
    return kind === this.kind;
  }

  isFunction(): boolean {
    return false;
  }
}

export class FunctionSymbolType implements SymbolType {
  parameters!: Record<string, SymbolType>;
  returnType!: SymbolType;

  constructor(params: Attributes<FunctionSymbolType>) {
    Object.assign(this, params);
  }

  typeCompatibleWith(other: SymbolType): boolean {
    if (!(other instanceof FunctionSymbolType)) {
      return false;
    }
    const matchingReturnTypes = other.returnType
      .typeCompatibleWith(this.returnType);
    if (!matchingReturnTypes) {
      return false;
    }
    const otherParameterNames = Object.keys(other.parameters);
    const thisParameterNames = Object.keys(this.parameters);
    if (otherParameterNames.length !== thisParameterNames.length) {
      return false;
    }
    const matchingNames = otherParameterNames.every((name) =>
      name in thisParameterNames
    );
    if (!matchingNames) {
      return false;
    }
    return otherParameterNames.every((name) =>
      other.parameters[name].typeCompatibleWith(this.parameters[name])
    );
  }

  isPrimitive(): boolean {
    return false;
  }

  isFunction(): boolean {
    return true;
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
  constructor(params: { fields: Record<string, SymbolType> }) {
    this.fields = new Map(Object.entries(params.fields));
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

  isFunction(): boolean {
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
    this.reset();
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
    const current = this.scopes.at(-1);
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

  typeResolvable(name: string): boolean {
    return this.findType(name).kind === "some";
  }

  setType(name: string, symbolType: SymbolType) {
    const currentScope = this.scopes[this.scopes.length - 1];
    currentScope.types.set(name, symbolType);
  }

  setReturnType(returnType: SymbolType) {
    const current = this.scopes.at(-1)!;
    current.returnType = Some(returnType);
  }

  findReturnTypeInCurrentScope(): Option<SymbolType> {
    const current = this.scopes.at(-1)!;
    return current.returnType;
  }

  findReturnType(): Option<SymbolType> {
    for (const currentScope of this.scopes.toReversed()) {
      const returnType = currentScope.returnType;
      if (returnType.kind === "none") {
        continue;
      }
      return returnType;
    }
    return None();
  }

  initializeStandardLibraryTypes() {
    this.setType("Number", new PrimitiveSymbolType("Number"));
    this.setType("Boolean", new PrimitiveSymbolType("Boolean"));
    this.setType("String", new PrimitiveSymbolType("String"));

    /* ~~~ TEMPORARY ~~~ */

    // will be replaced by stdlib implementation in the future

    this.setType("Nothing", new CompositeSymbolType({ fields: {} }));

    /* ~~~ TEMPORARY ~~~ */
  }

  reset() {
    this.scopes = [];
    this.pushScope();
    this.initializeStandardLibraryTypes();
  }
}

export const typeTable = new TypeTable();
