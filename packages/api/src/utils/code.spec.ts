import { AxiosError, AxiosHeaders } from 'axios';
import { getCodeApiRetryAfterMs } from './code';

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
