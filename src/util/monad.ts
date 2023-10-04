export interface Option<T> {
  kind: "some" | "none";
  map<U>(fn: (value: T) => U): Option<U>;
  unwrapOr(defaultValue: T): T;
}

export function Some<T>(value: T): Option<T> {
  return {
    kind: "some",

    map<U>(fn: (value: T) => U): Option<U> {
      return Some(fn(value));
    },

    unwrapOr(_defaultValue: T): T {
      return value;
    },
  };
}

export function None<T>(): Option<T> {
  return {
    kind: "none",

    map<U>(_fn: (value: T) => U): Option<U> {
      return None() as Option<U>;
    },

    unwrapOr(defaultValue: T): T {
      return defaultValue;
    },
  };
}
