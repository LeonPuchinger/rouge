import { InternalError } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { surroundWithIfNonEmpty } from "./util/string.ts";
import { WithOptionalAttributes } from "./util/type.ts";

type PrimitiveSymbolTypeKind = "Number" | "Boolean" | "String";

interface SymbolTypeMismatchHandler {
  onIdMismatch?(params: { expected: string; found: string }): void;
  onFunctionReturnTypeMismatch?(params: {
    expected: SymbolType;
    found: SymbolType;
  }): void;
  onFunctionParameterCountMismatch?(params: {
    expected: number;
    found: number;
  }): void;
  onFunctionParameterTypeMismatch?(params: {
    expected: SymbolType;
    found: SymbolType;
    index: number;
  }): void;
  onPlaceholderCountMismatch?(params: {
    expected: number;
    found: number;
  }): void;
  onPlaceholderNameMissing?(params: { expected: string }): void;
  onPlaceholderTypeMismatch?(
    params: {
      expected: SymbolType;
      found: SymbolType;
      name: string;
      index: number;
    },
  ): void;
  onFieldCountMismatch?(params: {
    expected: number;
    found: number;
  }): void;
  onFieldNameMissing?(params: { expected: string }): void;
  onFieldTypeMismatch?(
    params: { expected: SymbolType; found: SymbolType; index: number },
  ): void;
}

export interface SymbolType {
  placeholders: Map<string, PlaceholderSymbolType>;
  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
  ): boolean;
  displayName(): string;
  complete(): boolean;
  fork(bindPlaceholders: Map<string, SymbolType>): SymbolType;
  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean;
  isFunction(): boolean;
}

export class FunctionSymbolType implements SymbolType {
  parameters!: SymbolType[];
  returnType!: SymbolType;
  placeholders!: Map<string, PlaceholderSymbolType>;

  constructor(params: {
    parameters: SymbolType[];
    returnType: SymbolType;
    placeholders?: Map<string, PlaceholderSymbolType>;
  }) {
    params.placeholders ??= new Map();
    Object.assign(this, params);
  }

  /**
   * Invocations are only realized using positional parameters at this point.
   * Therefore, comparing the names of parameters is not necessary.
   */
  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: Partial<SymbolTypeMismatchHandler>,
  ): boolean {
    if (!(other instanceof FunctionSymbolType)) {
      mismatchHandler?.onIdMismatch?.({
        expected: this.displayName(),
        found: other.displayName(),
      });
      return false;
    }
    if (this.placeholders.size !== other.placeholders.size) {
      mismatchHandler?.onPlaceholderCountMismatch?.({
        expected: this.placeholders.size,
        found: other.placeholders.size,
      });
      return false;
    }
    const placeholderNames = Array.from(this.placeholders.keys());
    const placeholderTypes = Array.from(this.placeholders.values());
    const placeholderIndicies = Array.from(
      placeholderNames,
      (_, index) => index,
    );
    for (const index of placeholderIndicies) {
      const placeholderName = placeholderNames[index];
      const placeholderType = placeholderTypes[index];
      const otherPlaceholder = other.placeholders.get(placeholderName);
      if (otherPlaceholder === undefined) {
        mismatchHandler?.onPlaceholderNameMissing?.({
          expected: placeholderType.name,
        });
        return false;
      }
      if (!placeholderType.typeCompatibleWith(otherPlaceholder)) {
        mismatchHandler?.onPlaceholderTypeMismatch?.({
          expected: placeholderType,
          found: otherPlaceholder,
          name: placeholderName,
          index: index,
        });
        return false;
      }
    }
    const matchingReturnTypes = other.returnType
      .typeCompatibleWith(this.returnType);
    if (!matchingReturnTypes) {
      mismatchHandler?.onFunctionReturnTypeMismatch?.({
        expected: this.returnType,
        found: other.returnType,
      });
      return false;
    }
    if (other.parameters.length !== this.parameters.length) {
      mismatchHandler?.onFunctionParameterCountMismatch?.({
        expected: this.parameters.length,
        found: other.parameters.length,
      });
      return false;
    }
    return this.parameters.reduce(
      (previous, current, index) => {
        const thisType = current;
        const otherType = other.parameters.at(index)!;
        const matching = thisType.typeCompatibleWith(otherType);
        if (!matching) {
          mismatchHandler?.onFunctionParameterTypeMismatch?.({
            expected: thisType,
            found: otherType,
            index: index,
          });
        }
        if (previous === false) {
          return false;
        }
        return matching;
      },
      true,
    );
  }

  displayName(): string {
    const placeholders = Array.from(this.placeholders.entries())
      .map(([_name, type]) => type.displayName())
      .join(" , ");
    const parameters = Array.from(this.parameters.entries())
      .map(([name, type]) => `${name}: ${type.displayName()}`)
      .join(" , ");
    const returnType = this.returnType.displayName();
    return `Function${
      surroundWithIfNonEmpty(placeholders, "<", ">")
    }(${parameters}) -> ${returnType}`;
  }

  complete(): boolean {
    return Array.from(this.placeholders.entries())
      .map(([_name, type]) => type.complete())
      .every((entry) => entry === true);
  }

  fork(bindPlaceholders: Map<string, SymbolType>): SymbolType {
    const copy = new FunctionSymbolType({
      parameters: this.parameters,
      returnType: this.returnType,
      placeholders: new Map(),
    });
    for (const [name, placeholder] of this.placeholders) {
      if (name in bindPlaceholders) {
        const boundPlaceholder = new PlaceholderSymbolType({
          name: name,
          reference: copy.placeholders.get(name),
        });
        copy.placeholders.set(name, boundPlaceholder);
      } else {
        copy.placeholders.set(name, placeholder);
      }
    }
    return copy;
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
  id!: string;
  fields!: Map<string, SymbolType>;
  placeholders!: Map<string, PlaceholderSymbolType>;

  /**
   * @param fields The key-value pairs of name and type that make up this user defined type.
   */
  constructor(
    params: {
      id: string;
      fields?: Map<string, SymbolType>;
      placeholders?: Map<string, PlaceholderSymbolType>;
    },
  ) {
    params.fields ??= new Map();
    params.placeholders ??= new Map();
    Object.assign(this, params);
  }

  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
  ): boolean {
    if (!(other instanceof CompositeSymbolType)) {
      mismatchHandler?.onIdMismatch?.({
        expected: this.id,
        // The only other possible SymbolType is FunctionSymbolType
        // since PlaceholderSymbolType only delegates to a Composite- or FunctionSymbolType.
        found: "Function",
      });
      return false;
    }
    if (this.id !== other.id) {
      mismatchHandler?.onIdMismatch?.({
        expected: this.id,
        found: other.id,
      });
      return false;
    }
    if (this.placeholders.size !== other.placeholders.size) {
      mismatchHandler?.onPlaceholderCountMismatch?.({
        expected: this.placeholders.size,
        found: other.placeholders.size,
      });
      return false;
    }
    const placeholderNames = Array.from(this.placeholders.keys());
    const placeholderTypes = Array.from(this.placeholders.values());
    const placeholderIndicies = Array.from(
      placeholderNames,
      (_, index) => index,
    );
    for (const index of placeholderIndicies) {
      const placeholderName = placeholderNames[index];
      const placeholderType = placeholderTypes[index];
      const otherPlaceholder = other.placeholders.get(placeholderName);
      if (otherPlaceholder === undefined) {
        mismatchHandler?.onPlaceholderNameMissing?.({
          expected: placeholderType.name,
        });
        return false;
      }
      if (!placeholderType.typeCompatibleWith(otherPlaceholder)) {
        mismatchHandler?.onPlaceholderTypeMismatch?.({
          expected: placeholderType,
          found: otherPlaceholder,
          name: placeholderName,
          index: index,
        });
        return false;
      }
    }
    const thisKeys = Array.from(this.fields.keys());
    const otherKeys = Array.from(other.fields.keys());
    if (thisKeys.length !== otherKeys.length) {
      throw new InternalError(
        "Encountered two CompositeSymbolTypes with matching IDs but different amounts of fields.",
      );
    }
    for (const key of thisKeys) {
      if (!other.fields.has(key)) {
        throw new InternalError(
          "Encountered two CompositeSymbolTypes with matching IDs but different names for their fields.",
        );
      }
      if (!other.fields.get(key)?.typeCompatibleWith(this.fields.get(key)!)) {
        throw new InternalError(
          "Encountered two CompositeSymbolTypes with matching IDs but at least one type-incompatible field.",
        );
      }
    }
    return true;
  }

  displayName(): string {
    const placeholders = Array.from(this.placeholders.entries())
      .map(([_name, type]) => type.displayName())
      .join(" , ");
    return `${this.id}${surroundWithIfNonEmpty(placeholders, "<", ">")}`;
  }

  complete(): boolean {
    return Array.from(this.placeholders.entries())
      .map(([_name, type]) => type.complete())
      .every((entry) => entry === true);
  }

  fork(bindPlaceholders: Map<string, SymbolType>): SymbolType {
    const copy = new CompositeSymbolType({
      id: this.id,
      fields: this.fields,
      placeholders: new Map(),
    });
    for (const [name, placeholder] of this.placeholders) {
      if (name in bindPlaceholders) {
        copy.placeholders.set(
          name,
          placeholder.bind(bindPlaceholders.get(name)!),
        );
      } else {
        copy.placeholders.set(name, placeholder);
      }
    }
    return copy;
  }

  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean {
    return this.id === kind;
  }

  isFunction(): boolean {
    return false;
  }
}

export class PlaceholderSymbolType implements SymbolType {
  reference!: Option<SymbolType>;
  name!: string;

  constructor(
    // exclude getter/setter properties from constructor invocation
    params: Omit<WithOptionalAttributes<PlaceholderSymbolType>, "placeholders">,
  ) {
    this.reference = Some(params.reference);
  }

  get placeholders(): Map<string, PlaceholderSymbolType> {
    return this.reference
      .map((reference) => reference.placeholders)
      .unwrapOr(new Map());
  }

  set placeholders(placeholders: Map<string, PlaceholderSymbolType>) {
    this.reference
      .then((reference) => reference.placeholders = placeholders);
  }

  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
  ): boolean {
    return this.reference
      .map((reference) => reference.typeCompatibleWith(other, mismatchHandler))
      .unwrapOr(true);
  }

  displayName(): string {
    return this.reference
      .map((reference) => reference.displayName())
      .unwrapOr(this.name);
  }

  complete(): boolean {
    return this.reference
      .map((reference) => reference.complete())
      .unwrapOr(false);
  }

  fork(bindPlaceholders: Map<string, SymbolType>): SymbolType {
    return this.reference
      .map((type) => type.fork(bindPlaceholders))
      .unwrapOr(this);
  }

  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean {
    return this.reference
      .map((reference) => reference.isPrimitive(kind))
      .unwrapOr(false);
  }

  isFunction(): boolean {
    return this.reference
      .map((reference) => reference.isFunction())
      .unwrapOr(false);
  }

  bind(to: SymbolType) {
    if (this.isBound()) {
      throw new InternalError(
        "A PlaceholderSymbolType can only be bound to another type once.",
      );
    }
    return new PlaceholderSymbolType({
      name: this.name,
      reference: to,
    });
  }

  isBound(): boolean {
    return this.reference.hasValue();
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
    this.setType("Number", new CompositeSymbolType({ id: "Number" }));
    this.setType("Boolean", new CompositeSymbolType({ id: "Boolean" }));
    this.setType("String", new CompositeSymbolType({ id: "String" }));

    /* ~~~ TEMPORARY ~~~ */

    // will be replaced by stdlib implementation in the future

    this.setType("Nothing", new CompositeSymbolType({ id: "Nothing" }));

    /* ~~~ TEMPORARY ~~~ */
  }

  reset() {
    this.scopes = [];
    this.pushScope();
    this.initializeStandardLibraryTypes();
  }
}

export const typeTable = new TypeTable();
