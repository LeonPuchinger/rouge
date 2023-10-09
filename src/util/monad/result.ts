export interface Result<T, E> {
  kind: "ok" | "err";
  map<U>(fn: (value: T) => U): Result<U, E>;
  mapError<U>(fn: (value: E) => U): Result<T, U>;
  unwrap(): T;
  unwrapError(): E;
  unwrapOr(defaultValue: T): T;
}

export function Ok<T, E>(value: T): Result<T, E> {
  return {
    kind: "ok",

    map<U>(fn: (value: T) => U): Result<U, E> {
      return Ok(fn(value));
    },

    mapError<U>(_fn: (value: E) => U): Result<T, U> {
      return Ok(value);
    },

    unwrap(): T {
      return value;
    },

    unwrapError(): E {
      // TODO: error handling: panic!
      throw new Error("this should panic, not implemented yet!");
    },

    unwrapOr(_defaultValue: T): T {
      return value;
    },
  };
}

export function Err<T, E>(value: E): Result<T, E> {
  return {
    kind: "err",

    map<U>(_fn: (value: T) => U): Result<U, E> {
      return Err(value);
    },

    mapError<U>(fn: (value: E) => U): Result<T, U> {
      return Err(fn(value));
    },

    unwrap(): T {
      // TODO: error handling: panic!
      throw new Error("this should panic, not implemented yet!");
    },

    unwrapError(): E {
      return value;
    },

    unwrapOr(defaultValue: T): T {
      return defaultValue;
    },
  };
}
