import { spawn } from 'child_process';
import { megabyte } from 'librechat-data-provider';
import { createConcurrencyLimiter } from '~/utils/promise';

/** Native document parsers are CPU and memory intensive even for small uploads. */
const NATIVE_PARSER_CONCURRENCY = 2;

/**
 * Largest extraction a child may hand back, matching the limit the upload path applies
 * to the stored text.
 *
 * The caps that bound decompression do not bound conversion: an archive of highly
 * compressible text passes both the per-entry and total inflate limits and still
 * converts to tens of megabytes of Markdown. Enforcing only in the parent means every
 * one of those bytes is serialized through IPC and rebuilt in the API process before
 * anything rejects it, and two children may be doing that at once. The child measures
 * its own output first, so an oversized parse costs a message instead of a copy.
 */
export const MAX_PARSER_OUTPUT_BYTES = 15 * megabyte;

/**
 * Per-page envelope charged on top of a page's own text, so a result is measured by
 * what crosses IPC rather than by its content alone. A page object that converted to
 * nothing still costs its keys, its number and its braces in both processes.
 */
export const PARSER_PAGE_OVERHEAD_BYTES = 64;

/**
 * Most pages a page-oriented parser may return.
 *
 * Byte accounting alone does not bound this: a page that produced no text contributes
 * almost nothing, so a document declaring hundreds of thousands of empty pages passes
 * the size cap while serializing an object array that large through IPC and rebuilding
 * it in the API process. A page costs an attacker roughly 110 bytes on disk, so the
 * 15MB upload limit buys well over a hundred thousand of them. The cap sits far above
 * any real document, and the pdfjs fallback refuses anything past 250 pages anyway.
 */
export const MAX_PARSER_PAGES = 10_000;

/**
 * Uploads waiting for one of those slots. Each waiter is a separate request that has
 * already read its document into memory (up to the parser's 15MB cap) and holds it for
 * the whole wait, and the timeout below only starts once a slot frees, so an unbounded
 * queue turns a burst of uploads into unbounded retained memory. Shedding at the door
 * with a named error is the honest answer: the caller can retry, where an accepted
 * request would have sat behind a queue with no deadline.
 */
const NATIVE_PARSER_MAX_QUEUED = 6;

/** Shared across AnyDoc and pdf-inspector so their child counts cannot add together. */
const nativeParserLimit = createConcurrencyLimiter(NATIVE_PARSER_CONCURRENCY, {
  maxQueued: NATIVE_PARSER_MAX_QUEUED,
  label: 'document parsing',
});

interface NativeParserResponse<T> {
  ok: boolean;
  result?: T;
  message?: string;
}

interface NativeParserChildOptions {
  childSource: string;
  parserName: string;
  request: Record<string, unknown>;
  timeoutMs: number;
}

/**
 * Run one synchronous native parser operation behind a shared child-process cap.
 *
 * The timeout begins only after a concurrency slot is available. This prevents a
 * queued request from consuming most of its execution budget before it is spawned.
 */
export function runNativeParserChild<T>({
  childSource,
  parserName,
  request,
  timeoutMs,
}: NativeParserChildOptions): Promise<T> {
  return nativeParserLimit(
    () =>
      new Promise<T>((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', childSource], {
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        });

        let settled = false;
        const finish = (error: Error | null, value?: T) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (!child.killed) {
            child.kill('SIGKILL');
          }
          if (error) {
            reject(error);
            return;
          }
          resolve(value as T);
        };

        const timer = setTimeout(
          () => finish(new Error(`${parserName} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
        timer.unref?.();

        child.on('message', (message: NativeParserResponse<T>) => {
          if (message.ok) {
            finish(null, message.result);
            return;
          }
          finish(new Error(message.message ?? `${parserName} failed`));
        });
        child.on('error', (error: Error) => finish(error));
        child.on('exit', (code: number | null, signal: NodeJS.Signals | null) =>
          finish(
            new Error(
              signal
                ? `${parserName} child exited from signal ${signal}`
                : `${parserName} child exited with code ${code}`,
            ),
          ),
        );
        try {
          child.send(request, (error) => {
            if (error) {
              finish(error);
            }
          });
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      }),
  );
}
