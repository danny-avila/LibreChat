import {
  BamlAbortError,
  BamlTransportError,
  isBamlAbortError,
  isBamlTransportError,
} from './errors';
import { ABORT_MESSAGE } from './protocol';

/**
 * The two rejection types the BAML port permits. `isBamlAbortError` and
 * `isBamlTransportError` identify by `.name`, not `instanceof`, because the
 * parent facade (`dist/baml/runtime.mjs`) and its CJS consumers (`dist/index.cjs`)
 * are bundled into two separate module graphs for the same source — an
 * `instanceof` check would silently fail across that boundary. This suite proves
 * the name-based identification actually survives what `instanceof` cannot.
 */

describe('BamlAbortError', () => {
  it('defaults to the stable ABORT_MESSAGE and the AbortError name', () => {
    const error = new BamlAbortError();
    expect(error.name).toBe('AbortError');
    expect(error.message).toBe(ABORT_MESSAGE);
    expect(error).toBeInstanceOf(Error);
  });

  it('accepts an explicit message while keeping the AbortError name', () => {
    const error = new BamlAbortError('custom abort text');
    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('custom abort text');
  });
});

describe('BamlTransportError', () => {
  it('carries the given message under the BamlTransportError name', () => {
    const error = new BamlTransportError('BAML provider request failed.');
    expect(error.name).toBe('BamlTransportError');
    expect(error.message).toBe('BAML provider request failed.');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('isBamlAbortError / isBamlTransportError', () => {
  it('accept the matching class and reject the other', () => {
    expect(isBamlAbortError(new BamlAbortError())).toBe(true);
    expect(isBamlTransportError(new BamlAbortError())).toBe(false);

    expect(isBamlTransportError(new BamlTransportError('x'))).toBe(true);
    expect(isBamlAbortError(new BamlTransportError('x'))).toBe(false);
  });

  it('reject ordinary errors, non-errors, and near-miss shapes', () => {
    expect(isBamlAbortError(new Error('plain'))).toBe(false);
    expect(isBamlTransportError(new Error('plain'))).toBe(false);
    expect(isBamlAbortError('AbortError')).toBe(false);
    expect(isBamlAbortError({ name: 'AbortError' })).toBe(false);
    expect(isBamlAbortError(null)).toBe(false);
    expect(isBamlAbortError(undefined)).toBe(false);
  });

  /**
   * The whole reason these predicates key off `.name` instead of `instanceof`:
   * an Error carrying the right name but constructed by a DIFFERENT class in a
   * different module graph (exactly what happens across the CJS/ESM bundle
   * boundary) must still be recognized. A same-shaped-but-foreign class proves
   * `instanceof` would have failed here while the real predicate succeeds.
   */
  it('recognizes a same-named error from a foreign class, the exact cross-bundle case this design exists for', () => {
    class ForeignAbortError extends Error {
      constructor(message = 'foreign graph abort') {
        super(message);
        this.name = 'AbortError';
      }
    }
    class ForeignTransportError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'BamlTransportError';
      }
    }

    const foreignAbort = new ForeignAbortError();
    const foreignTransport = new ForeignTransportError('foreign transport failure');

    expect(foreignAbort).not.toBeInstanceOf(BamlAbortError);
    expect(isBamlAbortError(foreignAbort)).toBe(true);

    expect(foreignTransport).not.toBeInstanceOf(BamlTransportError);
    expect(isBamlTransportError(foreignTransport)).toBe(true);
  });

  it('does not cross-recognize an AbortError-named error as a transport error or vice versa', () => {
    const namedAbort = new Error('x');
    namedAbort.name = 'AbortError';
    expect(isBamlTransportError(namedAbort)).toBe(false);

    const namedTransport = new Error('x');
    namedTransport.name = 'BamlTransportError';
    expect(isBamlAbortError(namedTransport)).toBe(false);
  });
});
