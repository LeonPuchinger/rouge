interface ReadableTextStream {
    onNewLine(fn: (line: string) => void): void;
    readLine(): Promise<string>;
    onNewChunk(fn: (chunk: string) => void): void;
    readChunk(): Promise<string>;
    onClose(fn: () => void): void;
    [Symbol.asyncIterator](): AsyncIterator<string>;
}
