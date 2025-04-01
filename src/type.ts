import { SymbolValue } from "./symbol.ts";
import { zip } from "./util/array.ts";
import { InternalError } from "./util/error.ts";
import { globalAutoincrement } from "./util/increment.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { surroundWithIfNonEmpty } from "./util/string.ts";

export type FundamentalSymbolTypeKind = "Number" | "Boolean" | "String";

/**
 * A type that allows callers of type comparisons to gain insight into why the type comparison failed.
 * For instance, this can be handy when the caller needs to provide a reason for the type mismatch in an error message.
 * An instance of this type can be passed to the type comparions.
 * The caller only needs to implement the callbacks that are of initerest to them.
 */
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
      index: number;
    },
  ): void;
  onFieldCountMismatch?(params: {
    expected: number;
    found: number;
  }): void;
  onFieldNameMissing?(params: { expected: string }): void;
  onFieldTypeMismatch?(
    params: {
      expected: SymbolType;
      found: SymbolType;
      index: number;
    },
  ): void;
}

/**
 * A `SymbolType` is used to describe data types within the language.
 */
export interface SymbolType {
  /**
   * Compares this type to another type.
   * By passing an instance of `SymbolTypeMismatchHandler`,
   * the caller can gain insight into why the type comparison failed.
   */
  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
    memo?: Map<SymbolType, Set<SymbolType>>,
  ): boolean;

  /**
   * Provides a pretty-printed representation of the type that can be shown to the user.
   * In case the type is a (chain of) placeholder(s), the type is resolved first.
   */
  displayName(): string;

  /**
   * Similar to `displayName`, but only returns the name of the type without any additional information.
   * Take the following table as an example on the difference between `resolveId` and `displayName`:
   *
   * | resolveId() | displayName()       |
   * |-------------|---------------------|
   * | Function    | Function<A>(A) -> A |
   * | Bar         | Bar<T, U>           |
   * | T           | T                   |
   */
  resolveId(): string;

  /**
   * Similar to `resolveId`, but in case the type is a placeholder, does not resolve the type first.
   * For instance, in case a placeholder called `T` is bound to `Number`, `resolveId` would return `T`.
   */
  unresolvedId(): string;

  /**
   * Returns `true` in case the type (including all its subtypes) does not contain any unboud placeholders.
   */
  complete(memo?: Map<SymbolType, boolean>): boolean;

  /**
   * Returns `false` in case the type is an unbound placeholder.
   * Returns `true` in any other case.
   */
  bound(): boolean;

  /**
   * In case the type is a placeholder, allows binding it to another type.
   * This method does not have any effect if called on any other type than a placeholder.
   */
  bind(to: SymbolType): void;

  /**
   * In case the type is a chain of placeholders, returns the last type in the chain.
   * In case the type is not a placeholder, returns the type itself.
   */
  peel(): SymbolType;

  /**
   * Creates a deep copy of the type.
   */
  fork(memo?: Map<SymbolType, SymbolType>): SymbolType;

  /**
   * Whether this type represents one of the fundamental types.
   */
  isFundamental(kind: FundamentalSymbolTypeKind): boolean;

  /**
   * Whether this type represents a function type.
   */
  isFunction(): boolean;

  /**
   * Whether to ignore potential analysis findings that are caused by this type.
   */
  ignore(): boolean;
}

export class FunctionSymbolType implements SymbolType {
  parameterTypes!: SymbolType[];
  placeholders!: Map<string, PlaceholderSymbolType>;
  returnType!: SymbolType;

  constructor(params: {
    parameterTypes: SymbolType[];
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
    memo = new Map<SymbolType, Set<SymbolType>>(),
  ): boolean {
    if (memo.get(this)?.has(other)) {
      return true;
    }
    if (!memo.has(this)) {
      memo.set(this, new Set());
    }
    memo.get(this)!.add(other);
    if (
      other instanceof PlaceholderSymbolType ||
      other instanceof IgnoreSymbolType
    ) {
      return other.typeCompatibleWith(this, mismatchHandler, memo);
    }
    // only fork types if no placeholders need to be assumed
    let self = this as FunctionSymbolType;
    if (!self.complete()) {
      self = self.fork();
    }
    if (!other.complete()) {
      other = other.fork();
    }
    // trivial case
    if (!(other instanceof FunctionSymbolType)) {
      mismatchHandler?.onIdMismatch?.({
        expected: self.displayName(),
        found: other.displayName(),
      });
      return false;
    }
    // prepare comparions of function parameters and return type
    if (other.parameterTypes.length !== self.parameterTypes.length) {
      mismatchHandler?.onFunctionParameterCountMismatch?.({
        expected: self.parameterTypes.length,
        found: other.parameterTypes.length,
      });
      return false;
    }
    for (
      const [selfParameter, otherParameter] of zip(
        [...self.parameterTypes, self.returnType],
        [...other.parameterTypes, other.returnType],
      )
    ) {
      const selfParameterBound = selfParameter.bound();
      const otherParameterBound = otherParameter.bound();
      if (!selfParameterBound && otherParameterBound) {
        selfParameter.bind(otherParameter);
      }
      if (selfParameterBound && !otherParameterBound) {
        otherParameter.bind(selfParameter);
      }
      if (!selfParameterBound && !otherParameterBound) {
        const uniqueType = new UniqueSymbolType();
        selfParameter.bind(uniqueType);
        otherParameter.bind(uniqueType);
      }
    }
    // compare function parameters
    for (
      const [selfParameter, otherParameter, index] of zip(
        self.parameterTypes,
        other.parameterTypes,
      )
    ) {
      if (
        !selfParameter.typeCompatibleWith(otherParameter, mismatchHandler, memo)
      ) {
        mismatchHandler?.onFunctionParameterTypeMismatch?.({
          index: index,
          expected: selfParameter,
          found: otherParameter,
        });
        return false;
      }
    }
    // compare return type
    if (
      !self.returnType.typeCompatibleWith(
        other.returnType,
        mismatchHandler,
        memo,
      )
    ) {
      mismatchHandler?.onFunctionReturnTypeMismatch?.({
        expected: self.returnType,
        found: other.returnType,
      });
      return false;
    }
    return true;
  }

  displayName(): string {
    const parameters = this.parameterTypes
      .map((type) => type.displayName())
      .join(" , ");
    const returnType = this.returnType.displayName();
    return `Function(${parameters}) -> ${returnType}`;
  }

  resolveId(): string {
    return "Function";
  }

  unresolvedId(): string {
    return this.resolveId();
  }

  complete(memo = new Map<SymbolType, boolean>()): boolean {
    if (memo.has(this)) {
      return memo.get(this)!;
    }
    memo.set(this, false);
    const result = [...this.parameterTypes, this.returnType]
      .map((type) => type.complete(memo))
      .every((entry) => entry === true);
    memo.set(this, result);
    return result;
  }

  bound(): boolean {
    return true;
  }

  bind(_to: SymbolType): void {
    return;
  }

  peel(): SymbolType {
    return this;
  }

  fork(memo = new Map<SymbolType, SymbolType>()): FunctionSymbolType {
    if (memo.has(this)) {
      return memo.get(this) as FunctionSymbolType;
    }
    const originalPlaceholders: SymbolType[] = Array.from(
      this.placeholders.values(),
    );
    const forkedPlaceholders = new Map<string, PlaceholderSymbolType>();
    const forkedParameters = this.parameterTypes.map((type) => {
      const forkedParameter = type.fork(memo);
      if (originalPlaceholders.includes(type)) {
        const forkedPlaceholder = forkedParameter as PlaceholderSymbolType;
        forkedPlaceholders.set(forkedPlaceholder.name, forkedPlaceholder);
      }
      return forkedParameter;
    });
    const originalReturnType = this.returnType;
    let forkedReturnType = originalReturnType.fork(memo);
    const returnTypeIsPlaceholder = originalPlaceholders.includes(
      originalReturnType,
    );
    if (returnTypeIsPlaceholder) {
      const forkedPlaceholder = forkedReturnType as PlaceholderSymbolType;
      const placeholderName = forkedPlaceholder.name;
      if (forkedPlaceholders.has(placeholderName)) {
        // the placeholder has already been used for a parameter
        forkedReturnType = forkedPlaceholders.get(placeholderName)!;
      } else {
        forkedPlaceholders.set(placeholderName, forkedPlaceholder);
      }
    }
    // fork placeholders that are not utilized by a parameter
    for (const [name, type] of this.placeholders) {
      if (!forkedPlaceholders.has(name)) {
        forkedPlaceholders.set(name, type.fork(memo) as PlaceholderSymbolType);
      }
    }
    const copy = new FunctionSymbolType({
      parameterTypes: forkedParameters,
      placeholders: forkedPlaceholders,
      returnType: forkedReturnType,
    });
    memo.set(this, copy);
    return copy;
  }

  isFundamental(): boolean {
    return false;
  }

  isFunction(): boolean {
    return true;
  }

  ignore(): boolean {
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
 * A `CompositeSymbolType` can contain default values for each of its fields,
 * which are only used during the instantiation of the type.
 * Default values are ignored during type comparisons.
 */
export class CompositeSymbolType implements SymbolType {
  id!: string;
  fields!: Map<string, SymbolType>;
  placeholders!: Map<string, PlaceholderSymbolType>;

  constructor(
    params: {
      id: string;
      fields?: Map<string, SymbolType>;
      defaultValues?: Map<string, SymbolValue>;
      placeholders?: Map<string, PlaceholderSymbolType>;
    },
  ) {
    params.fields ??= new Map();
    params.placeholders ??= new Map();
    params.defaultValues ??= new Map();
    Object.assign(this, params);
  }

  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
    memo = new Map<SymbolType, Set<SymbolType>>(),
  ): boolean {
    if (memo.get(this)?.has(other)) {
      return true;
    }
    if (!memo.has(this)) {
      memo.set(this, new Set());
    }
    memo.get(this)!.add(other);
    if (
      other instanceof PlaceholderSymbolType ||
      other instanceof IgnoreSymbolType
    ) {
      return other.typeCompatibleWith(this, mismatchHandler, memo);
    }
    if (!(other instanceof CompositeSymbolType)) {
      mismatchHandler?.onIdMismatch?.({
        expected: this.displayName(),
        found: other.displayName(),
      });
      return false;
    }
    if (this.id !== other.id) {
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
      if (
        !placeholderType.typeCompatibleWith(
          otherPlaceholder,
          mismatchHandler,
          memo,
        )
      ) {
        mismatchHandler?.onPlaceholderTypeMismatch?.({
          expected: placeholderType,
          found: otherPlaceholder,
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
      if (
        !other.fields.get(key)?.typeCompatibleWith(
          this.fields.get(key)!,
          mismatchHandler,
          memo,
        )
      ) {
        throw new InternalError(
          "Encountered two CompositeSymbolTypes with matching IDs but at least one type-incompatible field.",
        );
      }
    }
    return true;
  }

  displayName(): string {
    const placeholders = Array.from(this.placeholders.values())
      .map((type) => type.displayName())
      .join(" , ");
    return `${this.id}${surroundWithIfNonEmpty(placeholders, "<", ">")}`;
  }

  resolveId(): string {
    return this.id;
  }

  unresolvedId(): string {
    return this.resolveId();
  }

  complete(memo = new Map<SymbolType, boolean>()): boolean {
    if (memo.has(this)) {
      return memo.get(this)!;
    }
    memo.set(this, false);
    const result = Array.from(this.placeholders.entries())
      .map(([_name, type]) => type.complete(memo))
      .every((entry) => entry === true);
    memo.set(this, result);
    return result;
  }

  bound(): boolean {
    return true;
  }

  bind(_to: SymbolType): void {
    return;
  }

  peel(): SymbolType {
    return this;
  }

  fork(
    memo = new Map<CompositeSymbolType, CompositeSymbolType>(),
  ): CompositeSymbolType {
    if (memo.has(this)) {
      return memo.get(this)!;
    }
    const copy = new CompositeSymbolType({
      id: this.id,
      fields: new Map(),
      placeholders: new Map(),
    });
    memo.set(this, copy);
    const originalPlaceholders: SymbolType[] = Array.from(
      this.placeholders.values(),
    );
    for (const [fieldName, field] of this.fields) {
      const forkedField = field.fork(memo);
      if (originalPlaceholders.includes(field)) {
        const forkedPlaceholder = forkedField as PlaceholderSymbolType;
        copy.placeholders.set(forkedPlaceholder.name, forkedPlaceholder);
      }
      copy.fields.set(fieldName, forkedField);
    }
    // fork placeholders that are not utilized by a field
    for (const [name, type] of this.placeholders) {
      if (!copy.placeholders.has(name)) {
        copy.placeholders.set(name, type.fork(memo) as PlaceholderSymbolType);
      }
    }
    return copy;
  }

  isFundamental(kind: FundamentalSymbolTypeKind): boolean {
    return this.id === kind;
  }

  isFunction(): boolean {
    return false;
  }

  ignore(): boolean {
    return false;
  }
}

export class PlaceholderSymbolType implements SymbolType {
  reference!: Option<SymbolType>;
  name!: string;
  rebindingAllowed!: boolean;

  constructor({
    reference,
    name,
    rebindingAllowed = false,
  }: {
    reference?: SymbolType;
    name: string;
    rebindingAllowed?: boolean;
  }) {
    this.reference = Some(reference);
    this.name = name;
    this.rebindingAllowed = rebindingAllowed;
  }

  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
    memo = new Map<SymbolType, Set<SymbolType>>(),
  ): boolean {
    const resolvedA = this.peel();
    const resolvedB = other.peel();
    const bothBound = resolvedA.bound() && resolvedB.bound();
    if (bothBound) {
      return resolvedA.typeCompatibleWith(resolvedB, mismatchHandler, memo);
    }
    const bothUnbound = !resolvedA.bound() && !resolvedB.bound();
    if (bothUnbound) {
      // compare the first placeholders in both chains
      const firstNameMatch = this.unresolvedId() === other.unresolvedId();
      if (firstNameMatch) {
        return true;
      }
      // compare the last placeholders in both chains
      const lastNameMatch = resolvedA.resolveId() === resolvedB.resolveId();
      if (lastNameMatch) {
        return true;
      }
    }
    mismatchHandler?.onIdMismatch?.({
      expected: resolvedA.displayName(),
      found: resolvedB.displayName(),
    });
    return false;
  }

  displayName(): string {
    return this.reference
      .map((reference) => reference.displayName())
      // Use placeholder name in case the placeholder is bound to a `UniqueSymbolType`.
      // A `UniqueSymbolType` can be recognized by its empty display name.
      .map((name) => name === "" ? undefined : name)
      .unwrapOr(this.name);
  }

  resolveId(): string {
    return this.reference
      .map((reference) => reference.resolveId())
      // Use placeholder name in case the placeholder is bound to a `UniqueSymbolType`.
      // A `UniqueSymbolType` can be recognized by its empty id.
      .map((name) => name === "" ? undefined : name)
      .unwrapOr(this.name);
  }

  unresolvedId(): string {
    return this.name;
  }

  complete(memo = new Map<SymbolType, boolean>()): boolean {
    return this.reference
      .map((reference) => reference.complete(memo))
      .unwrapOr(false);
  }

  bound(): boolean {
    return this.reference.hasValue();
  }

  bind(to: SymbolType) {
    if (this.bound() && !this.rebindingAllowed) {
      throw new InternalError(
        "A PlaceholderSymbolType can only be bound to another type once.",
      );
    }
    this.reference = Some(to);
  }

  peel(): SymbolType {
    return this.reference
      .map((reference) => reference.peel())
      .unwrapOr(this);
  }

  fork(
    memo = new Map<SymbolType, SymbolType>(),
  ): SymbolType {
    const forkedReference = this.reference
      .map((reference) => reference.fork(memo));
    const copy = new PlaceholderSymbolType({
      name: this.name,
      reference: forkedReference.hasValue()
        ? forkedReference.unwrap()
        : undefined,
    });
    return copy;
  }

  isFundamental(kind: FundamentalSymbolTypeKind): boolean {
    return this.reference
      .map((reference) => reference.isFundamental(kind))
      .unwrapOr(false);
  }

  isFunction(): boolean {
    return this.reference
      .map((reference) => reference.isFunction())
      .unwrapOr(false);
  }

  ignore(): boolean {
    return this.reference
      .map((reference) => reference.ignore())
      .unwrapOr(false);
  }
}

/**
 * A SymbolType that is meant to produce no side effects. For instance,
 * comparing this type to any other type will always yield `true`, which
 * should result in no type mismatches in the analysis findings (which
 * are considered side effects here).
 * It is used primarily in two scenarios. First, in case the
 * analysis of a field or a variables yields erroneous findings,
 * the type of that field or variable cannot be determined safely.
 * In this case, the type can be set to an instance of `IgnoreSymbolType`.
 * This will allow the analysis to continue even without a proper type.
 * Second, when a type contains mutually dependent fields, it not possible
 * to perform analysis on one field when its dependent field has not yet
 * been analyzed. As a solution, each field is set to an instance of
 * `IgnoreSymbolType` first, which allows an initial pass of the analysis
 * to be performed. Later, when all fields have been analyzed in the first
 * pass, the types can be replaced with the correct types. Only then can the
 * analysis. An instance of `IgnoreSymbolType` is usually paired with an
 * instance of `PlaceholderSymbolType` which acts as a mutable reference that
 * allows replacing the `IgnoreSymbolType` once the "real" type can be determined.
 */
export class IgnoreSymbolType implements SymbolType {
  typeCompatibleWith(): boolean {
    return true;
  }

  displayName(): string {
    return "Ignore";
  }

  resolveId(): string {
    return "Ignore";
  }

  unresolvedId(): string {
    return "Ignore";
  }

  complete(): boolean {
    return true;
  }

  bound(): boolean {
    return true;
  }

  bind(): void {
    return;
  }

  peel(): SymbolType {
    return this;
  }

  fork(): SymbolType {
    return new IgnoreSymbolType();
  }

  isPrimitive(): boolean {
    return true;
  }

  isFundamental(): boolean {
    return true;
  }

  isFunction(): boolean {
    return true;
  }

  ignore(): boolean {
    return true;
  }
}

/**
 * A SymbolType that is only used during type comparisons of other SymbolTypes.
 * This SymbolType contains an index that that is uniquely assigned to each instance during its instantiation.
 * When two instances of this type are compared, they are considered equal in case their indices are equal.
 * The only way two instances can have the same index is when one instance is forked.
 *
 * Usually, when two types are compared and one of them is a placeholder, the placeholder is bound to the other type.
 * However, this approach cannot be used when both types are placeholders, in which case a `UniqueSymbolType` is used.
 * Consider the following two function types that are being compared, where `T` and `Y` are placeholders.
 * (It should be noted that the notation of the function types is used for demonstration purposes only
 * and is not syntactically valid in the language.)
 *
 * A: `Function(T) -> T`
 * B: `Function(Y) -> Y`
 *
 * During the type comparison, `T` and `Y` are` bound to the same instance of `UniqueSymbolType` when they are first encountered.
 * The next time either one of the placeholders are encountered, the bound instance is used for comparison.
 * In the above example, the comparison of the return types would yield `true` since both `T` and `Y` are bound to the same instance of `UniqueSymbolType`.
 */
export class UniqueSymbolType implements SymbolType {
  index!: number;

  constructor() {
    this.index = globalAutoincrement();
  }

  typeCompatibleWith(
    other: SymbolType,
    _mismatchHandler?: SymbolTypeMismatchHandler,
  ): boolean {
    if (!(other instanceof UniqueSymbolType)) {
      return false;
    }
    return this.index === other.index;
  }

  displayName(): string {
    // Placeholders will recognize the empty name and
    // substitute it with their own name instead.
    // This is done to make sure that the name of the `UniqueSymbolType`
    // does not end up in error or log messages.
    return "";
  }

  resolveId(): string {
    // Placeholders will recognize the empty name and
    // substitute it with their own name instead.
    // This is done to make sure that the name of the `UniqueSymbolType`
    // does not end up in error or log messages.
    return "";
  }

  unresolvedId(): string {
    return this.resolveId();
  }

  complete(): boolean {
    return true;
  }

  bound(): boolean {
    return true;
  }

  bind(_to: SymbolType): void {
    return;
  }

  peel(): SymbolType {
    return this;
  }

  fork(): SymbolType {
    const copy = new UniqueSymbolType();
    copy.index = this.index;
    return copy;
  }

  isFundamental(_kind: FundamentalSymbolTypeKind): boolean {
    return false;
  }

  isFunction(): boolean {
    return false;
  }

  ignore(): boolean {
    return false;
  }
}

/**
 * Additional flags that apply to types only
 * when they areinserted into the type table.
 */
type TypeFlags = {
  /**
   * Whether the type is readonly.
   * Mainly used to protect stdlib contents from being reassigned.
   */
  readonly: boolean;
};

type TypeEntry = TypeFlags & {
  type: SymbolType;
};

type Scope = {
  types: Map<string, TypeEntry>;
  returnType: Option<SymbolType>;
};

export class TypeTable {
  private scopes: Scope[] = [];
  /**
   * Types that belong to the runtime are kept in a separate namespace.
   * When looking up types via their name, runtime types are considered first.
   * This behavior can be disabled by setting `ignoreRuntimeTypes` to `true`.
   */
  private runtimeTypes = new Map<string, SymbolType>();
  /**
   * When a flag is set globally as an override, it is automatically
   * applied to all types that are inserted into the table.
   * This becomes useful, for instance, when initializing the stdlib.
   * There, the `readonly` flag can be set for all types contained in the stdlib.
   * When an override is set to `"notset"`, it is not applied to any type.
   * Also, in case a flag is explicitly set when a type is inserted
   * into the table, the global flag is ignored.
   */
  private globalFlagOverrides: {
    [K in keyof TypeFlags]: TypeFlags[K] | "notset";
  } = {
    readonly: "notset",
  };
  /**
   * When set to `true`, the table will act as if types stored
   * in the `runtimeTypes` namespace do not exists.
   */
  ignoreRuntimeTypes = true;

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

  private findTypeEntryInScope(
    name: string,
    scope: Scope,
  ): Option<TypeEntry> {
    return Some(scope.types.get(name));
  }

  findTypeInCurrentScope(name: string): Option<[SymbolType, TypeFlags]> {
    if (!this.ignoreRuntimeTypes) {
      const runtimeType = this.runtimeTypes.get(name);
      if (runtimeType !== undefined) {
        return Some([runtimeType, { readonly: true, runtimeBinding: true }]);
      }
    }
    const current = this.scopes.at(-1);
    if (current !== undefined) {
      return this.findTypeEntryInScope(name, current)
        .map((entry) => {
          const { type, ...flags } = entry;
          return [type, flags];
        });
    }
    return None();
  }

  findType(name: string): Option<[SymbolType, TypeFlags]> {
    if (!this.ignoreRuntimeTypes) {
      const runtimeType = this.runtimeTypes.get(name);
      if (runtimeType !== undefined) {
        return Some([runtimeType, { readonly: true, runtimeBinding: true }]);
      }
    }
    for (const currentScope of this.scopes.toReversed()) {
      const typeEntry = this.findTypeEntryInScope(name, currentScope)
        .map((entry) => {
          const { type, ...flags } = entry;
          return [type, flags];
        });
      if (!typeEntry.hasValue()) {
        continue;
      }
      return typeEntry as Option<[SymbolType, TypeFlags]>;
    }
    return None();
  }

  setRuntimeType(name: string, symbolType: SymbolType) {
    this.runtimeTypes.set(name, symbolType);
  }

  typeResolvable(name: string): boolean {
    return this.findType(name).hasValue();
  }

  setType(
    name: string,
    symbolType: SymbolType,
    flags: Partial<TypeFlags> = {},
  ) {
    const currentScope = this.scopes[this.scopes.length - 1];
    const existingEntry = Some(currentScope.types.get(name));
    existingEntry.then((entry) => {
      if (entry.readonly) {
        throw new InternalError(
          `Attempted to reassign the existing type with the name "${name}".`,
          `However, the type is flagged as readonly.`,
        );
      }
    });
    const entry: TypeEntry = {
      type: symbolType,
      readonly: flags.readonly ?? this.getGlobalFlagOverride("readonly"),
    };
    currentScope.types.set(name, entry);
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
    this.setType(
      "Number",
      new CompositeSymbolType({ id: "Number" }),
      { readonly: true },
    );
    this.setType(
      "Boolean",
      new CompositeSymbolType({ id: "Boolean" }),
      { readonly: true },
    );
    this.setType(
      "String",
      new CompositeSymbolType({ id: "String" }),
      { readonly: true },
    );

    /* ~~~ TEMPORARY ~~~ */

    // will be replaced by stdlib implementation in the future

    this.setType(
      "Nothing",
      new CompositeSymbolType({ id: "Nothing" }),
      { readonly: true },
    );

    /* ~~~ TEMPORARY ~~~ */
  }

  reset() {
    this.scopes = [];
    this.pushScope();
    this.initializeStandardLibraryTypes();
  }

  /**
   * See the `globalFlagOverrides` attribute for more information.
   */
  private getGlobalFlagOverride(
    flag: keyof TypeFlags,
  ): TypeFlags[keyof TypeFlags] {
    const override = this.globalFlagOverrides[flag];
    if (override === "notset") {
      return false;
    }
    return override;
  }

  /**
   * When a flag is set globally as an override, that flag is automatically
   * applied to all symbols that are inserted into the table.
   * Look at the `globalFlagOverrides` attribute for more information.
   */
  setGlobalFlagOverrides(
    flags: { [K in keyof TypeFlags]?: TypeFlags[K] | "notset" },
  ) {
    for (const [key, value] of Object.entries(flags)) {
      this.globalFlagOverrides[key as keyof TypeFlags] = value;
    }
  }
}

export const typeTable = new TypeTable();
