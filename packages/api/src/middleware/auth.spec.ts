import { buildSafeAuthLogContext, getAuthFailureErrorName, getAuthFailureReason } from './auth';
import type { AuthLogRequest, AuthLogState } from './auth';

function createRequest(overrides: Partial<AuthLogRequest> = {}): AuthLogRequest {
  return {
    headers: {},
    method: 'GET',
    path: '/api/messages',
    originalUrl: '/api/messages',
    ...overrides,
  };
}

function createAuthState(overrides: Partial<AuthLogState> = {}): AuthLogState {
  return {
    tokenProvider: 'openid',
    openidReuseEnabled: true,
    openidJwtAvailable: true,
    hasOpenIdReuseUserId: true,
    ...overrides,
  };
}

describe('auth middleware logging helpers', () => {
  it('builds safe auth log context without raw query strings or user identifiers', () => {
    const log = buildSafeAuthLogContext(
      createRequest({
        id: 'request-id',
        path: undefined,
        originalUrl: '/api/ask?access_token=secret-token',
      }),
      createAuthState(),
      {
        attempted_strategies: ['openidJwt', 'jwt'],
        fallback_attempted: true,
        fallback_succeeded: false,
        reason: 'jwt expired',
        error_name: 'TokenExpiredError',
        status: 401,
      },
    );

    expect(log).toEqual({
      request_id: 'request-id',
      method: 'GET',
      path: '/api/ask',
      token_provider: 'openid',
      openid_reuse_enabled: true,
      openid_jwt_available: true,
      has_openid_reuse_user_id: true,
      attempted_strategies: ['openidJwt', 'jwt'],
      fallback_attempted: true,
      fallback_succeeded: false,
      reason: 'jwt expired',
      error_name: 'TokenExpiredError',
      status: 401,
    });
    expect(JSON.stringify(log)).not.toContain('secret-token');
  });

  it('uses request headers when request ids are not directly set', () => {
    const log = buildSafeAuthLogContext(
      createRequest({
        headers: {
          'x-request-id': ['header-request-id'],
        },
      }),
      createAuthState({
        tokenProvider: null,
        openidReuseEnabled: false,
        openidJwtAvailable: false,
        hasOpenIdReuseUserId: false,
      }),
    );

    expect(log).toEqual({
      request_id: 'header-request-id',
      method: 'GET',
      path: '/api/messages',
      openid_reuse_enabled: false,
      openid_jwt_available: false,
      has_openid_reuse_user_id: false,
    });
  });

  it('prefers Passport info fields for auth failure reason and error name', () => {
    const err = Object.assign(new Error('outer failure'), { name: 'OuterError' });
    const info = { message: 'jwt expired', name: 'TokenExpiredError' };

    expect(getAuthFailureReason(err, info)).toBe('jwt expired');
    expect(getAuthFailureErrorName(err, info)).toBe('TokenExpiredError');
  });

  it('falls back to Error fields when Passport info is absent', () => {
    const err = Object.assign(new Error('invalid signature'), { name: 'JsonWebTokenError' });

    expect(getAuthFailureReason(err, undefined)).toBe('invalid signature');
    expect(getAuthFailureErrorName(err, undefined)).toBe('JsonWebTokenError');
  });
});
