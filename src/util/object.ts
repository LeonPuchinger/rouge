/**
 * Handles deep cloning of objects, arrays, and class instances.
 */
export function deepCopy<T>(input: T, seen = new WeakMap()): T {
    // Handle primitive types and null
    if (input === null || typeof input !== "object") {
        return input;
    }
    // Detect circular references
    if (seen.has(input)) {
        return seen.get(input);
    }
    // Handle special built-in objects
    if (input instanceof Date) {
        return new Date(input.getTime()) as T;
    }
    if (input instanceof RegExp) {
        return new RegExp(input.source, input.flags) as T;
    }
    if (input instanceof Map) {
        const mapClone = new Map();
        seen.set(input, mapClone);
        for (const [key, value] of input.entries()) {
            mapClone.set(key, deepCopy(value, seen));
        }
        return mapClone as T;
    }
    if (input instanceof Set) {
        const setClone = new Set();
        seen.set(input, setClone);
        for (const value of input.values()) {
            setClone.add(deepCopy(value, seen));
        }
        return setClone as T;
    }
    // Handle arrays
    if (Array.isArray(input)) {
        // deno-lint-ignore no-explicit-any
        const arrayClone: any[] = [];
        seen.set(input, arrayClone);
        for (const item of input) {
            arrayClone.push(deepCopy(item, seen));
        }
        return arrayClone as T;
    }
    // Handle class instances & plain objects
    const prototype = Object.getPrototypeOf(input);
    const isPlainObject = prototype === Object.prototype || prototype === null;
    // deno-lint-ignore no-explicit-any
    const output: any = isPlainObject ? {} : Object.create(prototype);
    seen.set(input, output);
    for (const key of Reflect.ownKeys(input)) {
        // deno-lint-ignore no-explicit-any
        output[key] = deepCopy((input as any)[key], seen);
    }
    return output;
}
