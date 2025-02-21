import { StreamSubscription } from "../streams.ts";

class LineSplitterStream extends TransformStream<string, string> {
  private buffer: string = "";

  constructor() {
    super({
      transform: (chunk, controller) => {
        this.buffer += chunk;
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop()!;
        for (const line of lines) {
          controller.enqueue(line);
        }
      },
      flush: (controller) => {
        if (this.buffer) {
          controller.enqueue(this.buffer);
        }
      },
    });
  }
}

/**
 * An abstraction over reading lines from a file that would otherwise require
 * working with the stream API directly. For every new line in the `file`, the
 * `onLine` callback is invoked. Returns a subscription that can be used to cancel
 * reading from the file prematurely (before the file itself is closed).
 */
export function onReadLine(
  file: { readable: ReadableStream<Uint8Array> },
  onLine: (line: string) => void,
): StreamSubscription {
  const readable = file.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new LineSplitterStream());
  const reader = readable.getReader();
  const abortController = new AbortController();
  const signal = abortController.signal;
  const subscription = {
    cancel: () => {
      abortController.abort();
      reader.cancel();
    },
  };
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) {
          break;
        }
        onLine(value);
      }
    } catch (error) {
      const typedError = error as { name?: string };
      if (typedError?.name && typedError.name !== "AbortError") {
        throw error;
      }
    } finally {
      reader.releaseLock();
    }
  })();
  return subscription;
}
