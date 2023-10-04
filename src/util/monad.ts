export interface Option<T> {
  kind: "some" | "none";
  map<U>(fn: (value: T) => U): Option<U>;
}

export function Some<T>(value: T): Option<T> {
  return {
    kind: "some",

    map: function<U> (fn: (value: T) => U): Option<U> {
      return Some(fn(value));
    },
  }
}

export function None<T>(): Option<T> {
  return {
    kind: "none",
    
    map: function<U> (_fn: (value: T) => U): Option<U> {
      return None() as Option<U>;
    },
  }
}
