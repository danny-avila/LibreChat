import { AxiosError, AxiosHeaders } from 'axios';
import { getCodeApiRetryAfterMs, withCodeApiRateLimit, createCodeApiRateLimitBudget } from './code';

/** Builds the error axios raises for a Code API rate-limit response. */
function rateLimited({
  status = 429,
  headers = {},
  data = {},
}: {
  status?: number;
  headers?: Record<string, string>;
  data?: unknown;
} = {}): AxiosError {
  const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
  error.response = {
    status,
    statusText: '',
    headers: new AxiosHeaders(headers),
    config: { headers: new AxiosHeaders() },
    data,
  };
  return error;
}

describe('getCodeApiRetryAfterMs', () => {
  it('reads the standard Retry-After header', () => {
    expect(getCodeApiRetryAfterMs(rateLimited({ headers: { 'retry-after': '17' } }))).toBe(17_000);
  });

  it('falls back to the response body when a proxy dropped the header', () => {
    expect(getCodeApiRetryAfterMs(rateLimited({ data: { retry_after_seconds: 4 } }))).toBe(4_000);
  });

  it('prefers the header over the body', () => {
    const error = rateLimited({
      headers: { 'retry-after': '2' },
      data: { retry_after_seconds: 30 },
    });
    expect(getCodeApiRetryAfterMs(error)).toBe(2_000);
  });

  it('returns null for a non-429 response', () => {
    expect(getCodeApiRetryAfterMs(rateLimited({ status: 503 }))).toBeNull();
  });

  it('returns null when neither channel carries a usable delay', () => {
    expect(getCodeApiRetryAfterMs(rateLimited({ headers: { 'retry-after': 'soon' } }))).toBeNull();
    expect(getCodeApiRetryAfterMs(rateLimited({ data: 'rate_limited' }))).toBeNull();
  });

  it('treats a blank header as absent rather than "retry immediately"', () => {
    /* `Number('')` is 0, which would both skip the body fallback and read
     * as a zero-second wait. */
    const error = rateLimited({ headers: { 'retry-after': '' }, data: { retry_after_seconds: 9 } });
    expect(getCodeApiRetryAfterMs(error)).toBe(9_000);
  });

  it('returns null for anything that is not an axios error', () => {
    expect(getCodeApiRetryAfterMs(new Error('boom'))).toBeNull();
    expect(getCodeApiRetryAfterMs(undefined)).toBeNull();
  });
});

describe('withCodeApiRateLimit', () => {
  it('passes a successful attempt straight through', async () => {
    const attempt = jest.fn(async () => 'ok');
    await expect(withCodeApiRateLimit({ attempt, label: 'reading' })).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('waits out a rate limit the budget can absorb, then finishes', async () => {
    /* A multi-request operation would otherwise abandon the work already
     * done the moment a limiter window closes mid-flight. */
    const budget = createCodeApiRateLimitBudget(5_000);
    const waits: number[] = [];
    let attempts = 0;
    const attempt = jest.fn(async () => {
      attempts++;
      if (attempts === 1) {
        throw rateLimited({ headers: { 'retry-after': '1' } });
      }
      return 'ok';
    });

    await expect(
      withCodeApiRateLimit({ attempt, label: 'reading', budget, onWait: (ms) => waits.push(ms) }),
    ).resolves.toBe('ok');

    expect(attempts).toBe(2);
    expect(waits).toEqual([1_000]);
    expect(budget.remainingMs).toBe(4_000);
  });

  it('names the limit when the wait exceeds the remaining budget', async () => {
    const budget = createCodeApiRateLimitBudget(5_000);
    const attempt = jest.fn(async () => {
      throw rateLimited({ headers: { 'retry-after': '300' } });
    });

    await expect(
      withCodeApiRateLimit({ attempt, label: 'reading "x.png"', budget }),
    ).rejects.toThrow(/rate limit reached while reading "x\.png" \(retry in 300s\)/);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(budget.remainingMs).toBe(5_000);
  });

  it('names the limit even when the response carries no usable delay', async () => {
    /* Otherwise a bare "Request failed with status code 429" surfaces as an
     * unspecified failure instead of one that clears on its own. */
    const attempt = jest.fn(async () => {
      throw rateLimited();
    });

    await expect(
      withCodeApiRateLimit({
        attempt,
        label: 'reading',
        budget: createCodeApiRateLimitBudget(60_000),
      }),
    ).rejects.toThrow(/rate limit reached while reading\./);
  });

  it('charges at least a second so a zero delay cannot spin', async () => {
    const budget = createCodeApiRateLimitBudget(2_500);
    const waits: number[] = [];
    let attempts = 0;
    const attempt = jest.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw rateLimited({ headers: { 'retry-after': '0' } });
      }
      return 'ok';
    });

    await expect(
      withCodeApiRateLimit({ attempt, label: 'reading', budget, onWait: (ms) => waits.push(ms) }),
    ).resolves.toBe('ok');
    expect(waits).toEqual([1_000, 1_000]);
    expect(budget.remainingMs).toBe(500);
  });

  it('rethrows anything that is not a rate limit', async () => {
    const attempt = jest.fn(async () => {
      throw rateLimited({ status: 500 });
    });
    await expect(withCodeApiRateLimit({ attempt, label: 'reading' })).rejects.toThrow(
      'Request failed',
    );
  });
});
