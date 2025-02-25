import { FixedSizeQueue } from "./util/array.ts";

/**
 * Allows a subscriber of a stream to manage their subscription.
 */
export type StreamSubscription = {
    cancel(): void;
};

/**
 * Represents a readable stream of data that can be read from asynchronously.
 * Usually paired with a writable sink that produces the data.
 */
export interface ReadableStream<T> {
    /**
     * Be notified when a new line has been written to the stream.
     */
    onNewLine(fn: (line: T) => void): StreamSubscription;

    /**
     * Wait until a new line has been written to the stream.
     */
    readLine(): Promise<T>;

    /**
     * Be notified when a new chunk has been written to the stream.
     * A chunk may contain multiple lines. When a chunk is written to the file,
     * the stream will notify all chunk subscribers once, however, it will notify
     * all line subscribers for each line in the chunk.
     */
    onNewChunk(fn: (chunk: T) => void): StreamSubscription;

    /**
     * Wait until a new chunk has been written to the stream.
     */
    readChunk(): Promise<T>;

    /**
     * Registers a callback function to be called when the stream is closed.
     */
    onClose(fn: () => void): StreamSubscription;
}

/**
 * Represents a writable sink of data.
 * Usually paired with a readable stream to consume the data.
 */
export interface WritableSink<T> {
    /**
     * Writes a single line to the stream.
     */
    writeLine(line: T): void;

    /**
     * Writes a single chunk to the stream.
     * A chunk may contain multiple lines.
     */
    writeChunk(chunk: T): void;

    /**
     * Closes the stream by canceling all subscriptions.
     */
    close(): void;
}

export type FileLike<T> = ReadableStream<T> & WritableSink<T>;

/**
 * A text based, virtual (aka. in memory) file that can can be
 * read from and written to in an asynchronous fashion.
 * Automatically creates backpressure when there are no subscribers
 * to the stream by buffering the most recent `bufferSize` lines.
 */
export class VirtualTextFile
    implements ReadableStream<string>, WritableSink<string> {
    private lineSubscribers: ((line: string) => void)[] = [];
    private chunkSubscribers: ((chunk: string) => void)[] = [];
    private closeSubscribers: (() => void)[] = [];
    private lineBuffer: FixedSizeQueue<string>;

    constructor(bufferSize: number = 500) {
        this.lineBuffer = new FixedSizeQueue(bufferSize);
    }

    onNewLine(fn: (line: string) => void): StreamSubscription {
        while (this.lineBuffer.size() > 0) {
            fn(this.lineBuffer.dequeue()!);
        }
        this.lineSubscribers.push(fn);
        return {
            cancel: () => {
                this.lineSubscribers = this.lineSubscribers.filter(
                    (subscriber) => subscriber !== fn,
                );
            },
        };
    }

    readLine(): Promise<string> {
        return new Promise((resolve) => {
            if (this.lineBuffer.size() > 0) {
                resolve(this.lineBuffer.dequeue()!);
                return;
            }
            const subscriber = this.onNewLine((line) => {
                resolve(line);
                subscriber.cancel();
            });
        });
    }

    onNewChunk(fn: (chunk: string) => void): StreamSubscription {
        while (this.lineBuffer.size() > 1) {
            const line = this.lineBuffer.dequeue()!;
            fn(`${line}\n`);
        }
        if (this.lineBuffer.size() === 1) {
            fn(this.lineBuffer.get(-1)!);
        }
        this.chunkSubscribers.push(fn);
        return {
            cancel: () => {
                this.chunkSubscribers = this.chunkSubscribers.filter(
                    (subscriber) => subscriber !== fn,
                );
            },
        };
    }

    readChunk(): Promise<string> {
        return new Promise((resolve) => {
            if (this.lineBuffer.size() > 1) {
                const line = this.lineBuffer.dequeue()!;
                resolve(`${line}\n`);
                return;
            }
            if (this.lineBuffer.size() === 1) {
                resolve(this.lineBuffer.get(-1)!);
                return;
            }
            const subscriber = this.onNewChunk((chunk) => {
                resolve(chunk);
                subscriber.cancel();
            });
        });
    }

    onClose(fn: () => void): StreamSubscription {
        this.closeSubscribers.push(fn);
        return {
            cancel: () => {
                this.closeSubscribers = this.closeSubscribers.filter(
                    (subscriber) => subscriber !== fn,
                );
            },
        };
    }

    writeLine(line: string): void {
        const anySubscribers = [
            this.chunkSubscribers.length,
            this.lineSubscribers.length,
        ]
            .some((length) => length > 0);
        if (!anySubscribers) {
            this.lineBuffer.enqueue(line);
        }
        this.chunkSubscribers.forEach((subscriber) => subscriber(`${line}\n`));
        this.lineSubscribers.forEach((subscriber) => subscriber(line));
    }

    writeChunk(chunk: string): void {
        const anySubscribers = [
            this.chunkSubscribers.length,
            this.lineSubscribers.length,
        ]
            .some((length) => length > 0);
        this.chunkSubscribers.forEach((subscriber) => subscriber(chunk));
        chunk.split("\n")
            .forEach((line, index) => {
                if (!anySubscribers) {
                    if (index === 0) {
                        this.lineBuffer.edit(-1, line);
                    } else {
                        this.lineBuffer.enqueue(line);
                    }
                }
                this.lineSubscribers.forEach((subscriber) => subscriber(line));
            });
    }

    close(): void {
        this.chunkSubscribers = [];
        this.lineSubscribers = [];
        this.closeSubscribers.forEach((subscriber) => subscriber());
        this.closeSubscribers = [];
        this.lineBuffer.clear();
    }
}
