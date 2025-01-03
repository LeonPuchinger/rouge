export function range(n: number, m: number): number[] {
  const result = [];
  for (let i = n; i <= m; i++) {
    result.push(i);
  }
  return result;
}

/**
 * Locates all duplicates in an array. Duplicates are returned as a map
 * where each duplicate input is mapped to an array of indices where they occur.
 *
 * Example:
 *
 * input: [1, 2, 3, 1, 2, 4, 2]
 * output: Map { 1 => [0, 3], 2 => [1, 4, 6] }
 */
export function findDuplicates<T>(array: T[]): Map<T, number[]> {
  const ocurrences = new Map<T, number[]>();
  for (const [index, item] of array.entries()) {
    const locations = ocurrences.get(item) ?? [];
    ocurrences.set(item, [...locations, index]);
  }
  const duplicates = new Map<T, number[]>(
    Array.from(ocurrences.entries()).filter(([, indices]) =>
      indices.length > 1
    ),
  );
  return duplicates;
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

/**
 * Combines two arrays into a new array so that each entry in the new array
 * contains a tuple of the two corresponding values of the input arrays as well as an index.
 * The size of the new array equals the size of the shorter input array.
 */
export function zip<T, U>(a: T[], b: U[]): [T, U, number][] {
  const shortestArrayLength = Math.min(a.length, b.length);
  const trimmedA = a.slice(0, shortestArrayLength);
  return trimmedA.map((item, index) => [item, b[index], index]);
}
