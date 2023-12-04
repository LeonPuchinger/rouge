import { Err, Result } from "./index.ts";

export function flattenResult<T, E>(
  result: Result<Result<T, E>, E>,
): Result<T, E> {
  if (result.kind === "err") {
    return Err(result.unwrapError());
  }
  return result.unwrap();
}
