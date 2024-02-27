/**
 * Omits all properties of a type that are functions.
 */
type OmitFunctions<T> = {
  // deno-lint-ignore ban-types
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};

/**
 * Generate a type from all public members of a class (excluding methods).
 */
export type Attributes<T> = OmitFunctions<T>;
