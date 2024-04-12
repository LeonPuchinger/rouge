// deno-lint-ignore-file no-explicit-any
import { None, Option, Some } from "./monad/index.ts";

/**
 * A decorator used for caching return values of methods.
 * The decorator works lazily which means the result is calculated the first time the method is called.
 * All subsequent calls to the method return the cached result from the first call.
 * For instance, this decorator can be used to cache the return values when evaluating AST nodes (see example below).
 *
 * Example:
 *
 * class MyAstNode implements EvaluableAstNode {
 *
 *  @memoize
 *  evaluate() {
 *    return expensiveComputation();
 *  }
 *
 *  // remaining methods
 *
 * }
 */
export function memoize(
  _target: any,
  _key: string,
  descriptor: TypedPropertyDescriptor<(...args: any[]) => any>,
): any {
  const originalMethod = descriptor.value!;
  let cache: Option<any> = None();
  // set wrapper function
  descriptor.value = function (...args: any[]): any {
    if (cache.kind === "none") {
      const result = originalMethod.apply(this, args);
      cache = Some(result);
      return result;
    }
    return cache.unwrap();
  };
  return descriptor;
}
