export function range(n: number, m: number): number[] {
  const result = [];
  for (let i = n; i <= m; i++) {
    result.push(i);
  }
  return result;
}

declare global {
  interface Array<T> {
    /**
     * Maps every element of an array using a callback function until a condition is met.
     * Returns the last mapped element.
     *
     * @param fn Maps each element from type T to type U
     * @param condition The mapping is stopped when this condition is met
     * @param defaultValue The value that is returned in case the condition is never met
     */
    mapUntil<U>(
      fn: (item: T) => U,
      condition: (result: U) => boolean,
      defaultValue: U,
    ): U;

    /**
     * Returns the first element in the array.
     * In case the array is empty, return `undefined`.
     */
    first(): T;

    /**
     * Returns the last element in the array.
     * In case the array is empty, return `undefined`.
     */
    last(): T;
  }
}

Array.prototype.mapUntil = function <T, U>(
  fn: (item: T) => U,
  condition: (result: U) => boolean,
  defaultValue: U,
): U {
  for (const item of this) {
    const result = fn(item);
    if (condition(result)) {
      return result;
    }
  }
  return defaultValue;
};

Array.prototype.first = function <T>(): T {
  return this.at(0);
};

Array.prototype.last = function <T>(): T {
  return this.slice(-1).at(0);
};
