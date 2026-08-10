import { ABORT_MESSAGE } from './protocol';

/**
 * The two rejection types the BAML port permits. Everything else is a failure
 * VALUE — `takeTurn` returns it, `streamTurn` yields it.
 *
 * Both are identified by `name`, never by `instanceof`. The parent facade is
 * bundled into `dist/baml/runtime.mjs` and its CJS consumers into
 * `dist/index.cjs`, so the two graphs hold distinct class objects for the same
 * source and an identity check would silently fail across the boundary.
 */

/** Caller cancellation. `AbortError` is the name the rest of the stack matches on. */
export class BamlAbortError extends Error {
  constructor(message = ABORT_MESSAGE) {
    super(message);
    this.name = 'AbortError';
  }
}

/** A provider, I/O, or deadline failure. The message is always one of the stable constants. */
export class BamlTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BamlTransportError';
  }
}

export const isBamlAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

export const isBamlTransportError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'BamlTransportError';
