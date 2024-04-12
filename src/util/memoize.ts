// deno-lint-ignore-file no-explicit-any
import { None, Option, Some } from "./monad/index.ts";

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
