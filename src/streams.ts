export interface ReadableStream<T> {
    onNewLine(fn: (line: T) => void): void;
    readLine(): Promise<T>;
    onNewChunk(fn: (chunk: T) => void): void;
    readChunk(): Promise<T>;
    onClose(fn: () => void): void;
    [Symbol.asyncIterator](): AsyncIterator<T>;
}

export interface WritableStream<T> {
    writeLine(line: T): void;
    writeChunk(chunk: T): void;
    close(): void;
}
