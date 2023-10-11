
export function Panic(reason: string): Error {
    return new Error(`PANIC: ${reason}.`);
}
