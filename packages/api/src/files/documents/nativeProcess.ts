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
 * A parser refused because its own output would not fit, not because the document is
 * unreadable. Tag-distinct so callers do not answer it by handing the same document to
 * another unbounded extractor, which is how a bound enforced in a child process gets
 * spent in the API process instead.
 */
export class ParserOutputLimitError extends Error {
  readonly code = 'PARSER_OUTPUT_LIMIT';
  /** The document itself is the problem, so the caller is told to send a smaller one. */
  readonly userErrorStatusCode = 413;
  constructor(message: string) {
    super(message);
    this.name = 'ParserOutputLimitError';
  }
}

/**
 * Matched on the code rather than the class: it arrives from a child process as a wire
 * field, and the same string is what the upload path reads to decide the response.
 */
export function isParserOutputLimit(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'PARSER_OUTPUT_LIMIT';
}

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

/**
 * Admits one whole document parse, not one child spawn.
 *
 * A PDF parse is a child, then up to 250 pdfjs page reads in this process, then possibly
 * a second child. Holding the slot only for the children would release it while the
 * in-process recovery is still decoding, letting fresh parses start and pile those
 * recoveries up: the expensive half of the pipeline would run unbounded behind a cap
 * that only ever counted the cheap half.
 */
export function withParserAdmission<T>(parse: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  /* The signal goes to the limiter, not just around the task: a caller that gives up
   * while queued has to leave the queue, or it holds a share of the bound against
   * callers who are still waiting. */
  return nativeParserLimit(parse, signal);
}

function abortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  return reason instanceof Error ? reason : new Error('Document parsing was cancelled');
}

interface NativeParserResponse<T> {
  ok: boolean;
  result?: T;
  message?: string;
  /** Set by a child that refused on its own output bounds rather than on the document. */
  code?: string;
}

/**
 * Injected ahead of every child body so both parsers measure the same thing.
 *
 * `process.send` serializes as JSON, and that is what actually crosses the pipe and is
 * rebuilt in the API process. Measuring the raw string instead undercounts it: a newline
 * doubles, a quote or backslash doubles, and any other control character becomes a
 * six-byte escape, so a document sitting just inside the cap can serialize to several
 * times it. Counted in a single pass rather than by stringifying, because building the
 * escaped copy to measure it would allocate the very thing the cap exists to refuse.
 */
const CHILD_PRELUDE = `
function __serializedBytes(text) {
  let bytes = 2;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x22 || code === 0x5c) {
      bytes += 2;
    } else if (code < 0x20) {
      bytes += code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d ? 2 : 6;
    } else if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
`;

interface NativeParserChildOptions {
  childSource: string;
  parserName: string;
  request: Record<string, unknown>;
  timeoutMs: number;
  /** Kills the child when the caller stops waiting, so an abandoned parse frees its slot. */
  signal?: AbortSignal;
}

/**
 * Run one synchronous native parser operation in a child process.
 *
 * Admission is the caller's, via {@link withParserAdmission} around the whole parse, so
 * the timeout here measures only the work it bounds and never a wait for a slot.
 */
export function runNativeParserChild<T>({
  childSource,
  parserName,
  request,
  timeoutMs,
  signal,
}: NativeParserChildOptions): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(abortError(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', CHILD_PRELUDE + childSource], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });

    let settled = false;
    const finish = (error: Error | null, value?: T) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
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
    const onAbort = () => finish(abortError(signal as AbortSignal));
    signal?.addEventListener('abort', onAbort, { once: true });

    child.on('message', (message: NativeParserResponse<T>) => {
      if (message.ok) {
        finish(null, message.result);
        return;
      }
      const failure = message.message ?? `${parserName} failed`;
      finish(
        message.code === 'PARSER_OUTPUT_LIMIT'
          ? new ParserOutputLimitError(`${parserName} ${failure}`)
          : new Error(failure),
      );
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
  });
}
