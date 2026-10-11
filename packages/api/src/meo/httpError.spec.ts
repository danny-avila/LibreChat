import { MeoHttpError, meoErrorResponse, meoUpstreamError } from './httpError';

describe('Meo HTTP error mapping', () => {
  it('keeps actionable statuses and never leaks upstream data', () => {
    expect(meoErrorResponse(meoUpstreamError(429))).toEqual({
      status: 429,
      message: 'Too many requests. Try again later.',
    });
    expect(meoErrorResponse(meoUpstreamError(503)).status).toBe(503);
    expect(meoErrorResponse(new MeoHttpError(401, 'Sign in again.')).status).toBe(401);
    expect(meoErrorResponse(new Error('private provider secret'))).toEqual({
      status: 502,
      message: 'Meo service is unavailable. Try again later.',
    });
  });
});
