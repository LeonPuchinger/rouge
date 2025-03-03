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
    private subscribers: ((chunk: string) => void)[] = [];
    private closeSubscribers: (() => void)[] = [];
    private lineBuffer: FixedSizeQueue<string>;

    constructor(bufferSize: number = 500) {
        this.lineBuffer = new FixedSizeQueue(bufferSize);
    }

    onNewChunk(fn: (chunk: string) => void): StreamSubscription {
        let disableBufferFlush = false;
        setTimeout(() => {
            this.subscribers.push(fn);
            while (this.lineBuffer.size() >= 2) {
                if (disableBufferFlush) {
                    return;
                }
                const line = this.lineBuffer.dequeue()!;
                fn(`${line}\n`);
            }
            if (this.lineBuffer.size() === 1) {
                if (!disableBufferFlush) {
                    fn(this.lineBuffer.dequeue()!);
                }
            }
        }, 0);
        return {
            cancel: () => {
                disableBufferFlush = true;
                this.subscribers = this.subscribers.filter(
                    (subscriber) => subscriber !== fn,
                );
            },
        };
    }

    readChunk(): Promise<string> {
        return new Promise((resolve) => {
            const subscriber = this.onNewChunk((chunk) => {
                resolve(chunk);
                subscriber.cancel();
            });
        });
    }

    writeLine(line: string): void {
        this.writeChunk(`${line}\n`);
    }

    writeChunk(chunk: string): void {
        const anySubscribers = this.subscribers.length > 0;
        const lines = chunk.split("\n");
        const enqueue = this.lineBuffer.enqueue.bind(this.lineBuffer);
        if (!anySubscribers) {
            if (this.lineBuffer.isEmpty()) {
                lines.forEach(enqueue);
            } else {
                lines.slice(0, 1).forEach((line) => {
                    this.lineBuffer.apply(
                        -1,
                        (current) => `${current}${line}`,
                    );
                });
                lines.slice(1).forEach(enqueue);
            }
        } else {
            this.subscribers.forEach((subscriber) => subscriber(chunk));
        }
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

    close(): void {
        setTimeout(() => {
            this.subscribers = [];
            this.lineBuffer.clear();
            this.closeSubscribers.forEach((subscriber) => subscriber());
            this.closeSubscribers = [];
        }, 0);
    }
}
