import { pipeline } from 'node:stream';
import type { Readable, Writable } from 'node:stream';

/**
 * Streams `source` into `res` and ends it. An upstream failure tears the response down instead
 * of surfacing as an uncaught stream error, and a client disconnect destroys the upstream.
 */
export function pipeToResponse(
  source: Readable,
  res: Writable,
  onError?: (error: Error) => void,
): void {
  pipeline(source, res, (error) => {
    if (error) {
      onError?.(error);
    }
  });
}

/**
 * Writes one `source` segment into `res`, ending `res` only when `end` is set. Resolves when the
 * segment ends; rejects, destroying `source`, when it fails or the client disconnects first.
 */
export function pipeSegment(
  source: Readable,
  res: Writable,
  { end }: { end: boolean },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      source.off('end', onEnd);
      source.off('error', onError);
      res.off('close', onClose);
    };
    const onEnd = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      source.destroy();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      source.destroy();
      reject(new Error('Client disconnected'));
    };
    source.on('end', onEnd);
    source.on('error', onError);
    res.on('close', onClose);
    source.pipe(res, { end });
  });
}
