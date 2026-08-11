import { classNameOf, isAbort, isParseFailure, isTransport, messageOf } from './classify';

/**
 * Pure classification predicates extracted from `worker.mts`'s catch handler.
 *
 * `worker.mts` cannot be imported directly in Jest: it is a `.mts` module Jest's
 * transform does not handle, it requires a live `parentPort`, and it pulls in
 * `@boundaryml/baml-bridge` at module scope. Extracting the classification logic
 * into this native-free sibling is what makes Behavior 4.1's classification
 * precedence and non-throwing guarantees testable at unit speed instead of only
 * inferable by reading source.
 */

const errorWithClassName = (className: string, message = 'boom'): unknown => {
  const error = new Error(message);
  (error as unknown as { className: string }).className = className;
  return error;
};

describe('messageOf', () => {
  it('reads the message off a real Error', () => {
    expect(messageOf(new Error('provider exploded'))).toBe('provider exploded');
  });

  it('reads a string message field off a plain record', () => {
    expect(messageOf({ message: 'plain record failure' })).toBe('plain record failure');
  });

  it('falls back to String() when there is no usable message field', () => {
    expect(messageOf({ code: 42 })).toBe('[object Object]');
    expect(messageOf('raw string thrown')).toBe('raw string thrown');
    expect(messageOf(null)).toBe('null');
    expect(messageOf(undefined)).toBe('undefined');
  });

  it('ignores a non-string message field rather than returning it', () => {
    expect(messageOf({ message: 404 })).toBe('[object Object]');
  });
});

describe('classNameOf', () => {
  it('reads a string className field off a plain record', () => {
    expect(classNameOf(errorWithClassName('baml.errors.LlmClient'))).toBe('baml.errors.LlmClient');
  });

  it('returns empty string when there is no usable className field', () => {
    expect(classNameOf(new Error('no class name'))).toBe('');
    expect(classNameOf({ className: 123 })).toBe('');
    expect(classNameOf('raw string')).toBe('');
    expect(classNameOf(null)).toBe('');
    expect(classNameOf(undefined)).toBe('');
  });
});

describe('isAbort', () => {
  it('is true whenever the call context itself reports aborted, regardless of the error', () => {
    expect(isAbort(new Error('anything'), true)).toBe(true);
    expect(isAbort(undefined, true)).toBe(true);
  });

  it('is true for an Error named AbortError even when the context does not report aborted', () => {
    const error = new Error('cancelled by caller');
    error.name = 'AbortError';
    expect(isAbort(error, false)).toBe(true);
  });

  it('is true when the class name contains Cancelled', () => {
    expect(isAbort(errorWithClassName('baml.errors.Cancelled'), false)).toBe(true);
    expect(isAbort(errorWithClassName('some.wrapper.CancelledError'), false)).toBe(true);
  });

  it('is false for an ordinary error with no abort signal', () => {
    expect(isAbort(new Error('plain failure'), false)).toBe(false);
    expect(isAbort(errorWithClassName('baml.errors.Io'), false)).toBe(false);
  });
});

describe('isParseFailure', () => {
  it('matches the BAML coercion-failure shape', () => {
    expect(isParseFailure(new Error('Expected string, got number'))).toBe(true);
    expect(isParseFailure(new Error('Expected TurnPlan, got null'))).toBe(true);
  });

  it('does not match ordinary failure text', () => {
    expect(isParseFailure(new Error('connection refused'))).toBe(false);
    expect(isParseFailure(new Error('All orchestration steps failed'))).toBe(false);
  });
});

describe('isTransport', () => {
  it('is true for each documented transport class name', () => {
    expect(isTransport(errorWithClassName('baml.errors.Io', 'socket hang up'))).toBe(true);
    expect(isTransport(errorWithClassName('baml.errors.LlmClient', 'connect ECONNREFUSED'))).toBe(
      true,
    );
    expect(isTransport(errorWithClassName('baml.errors.Timeout', 'deadline exceeded'))).toBe(true);
  });

  it('is true for retry exhaustion, matched as a literal substring regardless of class name', () => {
    expect(
      isTransport(errorWithClassName('baml.errors.DevOther', 'All orchestration steps failed')),
    ).toBe(true);
    expect(
      isTransport({ message: 'wrapped: All orchestration steps failed after 5 attempts' }),
    ).toBe(true);
  });

  it('is false for an error with neither a transport class name nor the exhaustion phrase', () => {
    expect(isTransport(errorWithClassName('baml.errors.Validation', 'field is required'))).toBe(
      false,
    );
    expect(isTransport(new Error('unrelated failure'))).toBe(false);
  });

  /**
   * `baml.errors.LlmClient` covers both a transport failure AND a response that
   * failed schema coercion — the class name alone cannot tell them apart. The
   * coercion message shape must win: this is the exact case the production
   * comment in `worker.mts` describes as "straddling the line".
   */
  it('prefers the parse-failure classification over a transport class name when both shapes match', () => {
    const straddling = errorWithClassName('baml.errors.LlmClient', 'Expected string, got number');
    expect(isParseFailure(straddling)).toBe(true);
    expect(isTransport(straddling)).toBe(false);
  });

  describe('non-throwing on adversarial class names and messages', () => {
    const poison = [
      '[',
      '(',
      '((unbalanced',
      '[a-z',
      '*+?',
      '.*',
      '\\',
      '\\d{1,',
      'a'.repeat(50_000),
      '',
    ];

    it.each(poison)('never throws when the class name is %j', (value) => {
      const error = errorWithClassName(value, 'boom');
      expect(() => isTransport(error)).not.toThrow();
      expect(() => isParseFailure(error)).not.toThrow();
      expect(() => isAbort(error, false)).not.toThrow();
      expect(typeof isTransport(error)).toBe('boolean');
    });

    it.each(poison)('never throws when the message is %j', (value) => {
      const error = errorWithClassName('baml.errors.LlmClient', value);
      expect(() => isTransport(error)).not.toThrow();
      expect(() => isParseFailure(error)).not.toThrow();
      expect(typeof isParseFailure(error)).toBe('boolean');
    });

    it('never throws when a client-name-shaped string flows in as the whole error value', () => {
      for (const value of poison) {
        expect(() => isTransport(value)).not.toThrow();
        expect(() => isParseFailure(value)).not.toThrow();
        expect(() => isAbort(value, false)).not.toThrow();
        expect(() => messageOf(value)).not.toThrow();
        expect(() => classNameOf(value)).not.toThrow();
      }
    });
  });
});
