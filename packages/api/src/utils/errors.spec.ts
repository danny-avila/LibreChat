import { getSafeErrorMetadata, isAbortError } from './errors';

describe('getSafeErrorMetadata', () => {
  it('keeps bounded diagnostic fields without serializing raw provider data', () => {
    const rawValue = 'PRIVATE-SUBMITTED-CONTENT';
    const error = Object.assign(new Error(`Provider echoed ${rawValue}`), {
      code: 'ERR_REMOTE',
      response: {
        status: 422,
        headers: { authorization: rawValue },
        data: { prompt: rawValue },
      },
    });

    const metadata = getSafeErrorMetadata(error);

    expect(metadata).toEqual({
      type: 'Error',
      status: 422,
    });
    expect(JSON.stringify(metadata)).not.toContain(rawValue);
  });

  it('drops attacker-controlled names and codes', () => {
    const rawValue = 'private value with spaces';
    const error = {
      name: rawValue,
      code: rawValue,
      status: '400',
      message: rawValue,
    };

    expect(getSafeErrorMetadata(error)).toEqual({ type: 'UnknownError' });
  });

  it('does not trust syntactically valid error identifiers or numeric codes', () => {
    const rawValue = 'Account123456789';

    expect(
      getSafeErrorMetadata({
        name: rawValue,
        code: rawValue,
        message: rawValue,
      }),
    ).toEqual({ type: 'UnknownError' });
    expect(
      getSafeErrorMetadata({
        code: 123456789,
        message: rawValue,
      }),
    ).toEqual({ type: 'UnknownError' });
  });
});

describe('isAbortError', () => {
  it('recognizes the DOMException a bare abort() produces', () => {
    const controller = new AbortController();
    controller.abort();
    expect(isAbortError(controller.signal.reason)).toBe(true);
  });

  it('recognizes an abort rewrapped by an intermediate layer', () => {
    const controller = new AbortController();
    controller.abort();
    const wrapped = new Error('[MCP][server][tool] tool call failed', {
      cause: controller.signal.reason,
    });
    expect(isAbortError(wrapped)).toBe(true);
  });

  it('recognizes the SDK message shape that only stringifies the reason', () => {
    expect(
      isAbortError(new Error('MCP error -32001: AbortError: This operation was aborted')),
    ).toBe(true);
  });

  it('does not treat an unrelated failure as a cancellation', () => {
    expect(isAbortError(new Error('upstream 503 from the tool backend'))).toBe(false);
    expect(isAbortError(Object.assign(new Error('forbidden'), { code: 'EPERM' }))).toBe(false);
  });

  it('terminates on a cyclic cause chain', () => {
    const first = new Error('first') as Error & { cause?: unknown };
    const second = new Error('second') as Error & { cause?: unknown };
    first.cause = second;
    second.cause = first;
    expect(isAbortError(first)).toBe(false);
  });

  it('tolerates non-error values', () => {
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError('aborted')).toBe(false);
  });
});
