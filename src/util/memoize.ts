// deno-lint-ignore-file no-explicit-any
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
  originalMethod: any,
  _ctx: ClassMethodDecoratorContext,
): any {
  const cache = new WeakMap();
  return function (...args: unknown[]) {
    // @ts-ignore: Implicit 'this' has type 'any'
    if (!cache.has(this)) {
      // @ts-ignore: Implicit 'this' has type 'any'
      const result = originalMethod.apply(this, args);
      // @ts-ignore: Implicit 'this' has type 'any'
      cache.set(this, result);
      return result;
    }
    // @ts-ignore: Implicit 'this' has type 'any'
    return cache.get(this);
  };
}
