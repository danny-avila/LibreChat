/**
 * Integration test: verifies that requireJwtAuth chains tenantContextMiddleware
 * after successful passport authentication, so ALS tenant context is set for
 * all downstream middleware and route handlers.
 *
 * requireJwtAuth must chain tenantContextMiddleware after passport populates
 * req.user (not at global app.use() scope where req.user is undefined).
 * If the chaining is removed, these tests fail.
 */

const jwt = require('jsonwebtoken');

// ── Mocks ──────────────────────────────────────────────────────────────

let mockPassportError = null;
let mockRegisteredStrategies = new Set(['jwt']);

jest.mock('passport', () => ({
  _strategy: jest.fn((strategy) => (mockRegisteredStrategies.has(strategy) ? {} : undefined)),
  authenticate: jest.fn((strategy, _options, callback) => {
    return (req, _res, _done) => {
      if (mockPassportError) {
        return callback(mockPassportError);
      }
      const strategyResult = req._mockStrategies?.[strategy];
      if (strategyResult) {
        return callback(
          strategyResult.err ?? null,
          strategyResult.user ?? false,
          strategyResult.info,
          strategyResult.status,
        );
      }
      return callback(null, req._mockUser ?? false, { message: 'Unauthorized' }, 401);
    };
  }),
}));

jest.mock('@librechat/data-schemas', () => {
  const { AsyncLocalStorage } = require('async_hooks');
  const tenantStorage = new AsyncLocalStorage();
  return {
    getTenantId: () => tenantStorage.getStore()?.tenantId,
    getUserId: () => tenantStorage.getStore()?.userId,
    getRequestId: () => tenantStorage.getStore()?.requestId,
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    tenantStorage,
  };
});

// Mock @librechat/api — the real tenantContextMiddleware is TS and cannot be
// required directly from CJS tests. This thin wrapper mirrors the real logic
// (read request context, call tenantStorage.run) using the same data-schemas
// primitives. The real implementation is covered by packages/api tenant.spec.ts.
jest.mock('@librechat/api', () => {
  const { tenantStorage } = require('@librechat/data-schemas');
  const normalizeAuthLogValue = (value) => {
    if (value == null) {
      return undefined;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const normalized = normalizeAuthLogValue(entry);
        if (normalized) {
          return normalized;
        }
      }
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || undefined;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return undefined;
  };
  const normalizeAuthLogContextValue = (value) => {
    if (value == null) {
      return undefined;
    }
    if (Array.isArray(value)) {
      const values = value
        .map((entry) => normalizeAuthLogValue(entry))
        .filter((entry) => entry !== undefined);
      return values.length > 0 ? values : undefined;
    }
    if (typeof value === 'string') {
      return normalizeAuthLogValue(value);
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    return undefined;
  };
  const getAuthFailureField = (source, field) => {
    if (!source) {
      return undefined;
    }
    if (typeof source === 'string') {
      return field === 'message' ? source : undefined;
    }
    if (typeof source === 'object') {
      try {
        return source[field];
      } catch {
        return undefined;
      }
    }
    return undefined;
  };
  const getAuthFailureReason = (err, info, fallback = 'Unauthorized') =>
    normalizeAuthLogValue(getAuthFailureField(info, 'message')) ??
    normalizeAuthLogValue(getAuthFailureField(err, 'message')) ??
    fallback;
  const getAuthFailureErrorName = (err, info) =>
    normalizeAuthLogValue(getAuthFailureField(info, 'name')) ??
    normalizeAuthLogValue(getAuthFailureField(err, 'name'));
  const getSafeTokenProvider = (tokenProvider) => {
    const normalized = normalizeAuthLogValue(tokenProvider);
    if (!normalized) {
      return undefined;
    }
    return normalized === 'openid' || normalized === 'librechat' ? normalized : 'other';
  };
  const normalizeRoutePath = (path) => {
    if (typeof path === 'string') {
      return normalizeAuthLogValue(path);
    }
    if (Array.isArray(path)) {
      for (const entry of path) {
        const normalized = normalizeRoutePath(entry);
        if (normalized) {
          return normalized;
        }
      }
    }
    return undefined;
  };
  const joinRoutePath = (baseUrl, routePath) => {
    const normalizedRoute = routePath === '/' ? '' : routePath;
    if (!baseUrl) {
      return normalizedRoute || '/';
    }
    if (!normalizedRoute) {
      return baseUrl;
    }
    return `${baseUrl.replace(/\/$/, '')}/${normalizedRoute.replace(/^\//, '')}`;
  };
  const bucketConcretePath = (path) => {
    const queryless = path?.split('?')[0];
    if (!queryless) {
      return undefined;
    }
    const segments = queryless.split('/').filter(Boolean);
    if (segments.length === 0) {
      return '/';
    }
    if (segments[0] === 'api' && segments[1]) {
      return `/${segments.slice(0, 2).join('/')}`;
    }
    return `/${segments[0]}`;
  };
  const getRequestPath = (req) => {
    const baseUrl = normalizeAuthLogValue(req.baseUrl);
    const routePath = normalizeRoutePath(req.route?.path);
    if (routePath) {
      return joinRoutePath(baseUrl, routePath);
    }
    if (baseUrl) {
      return baseUrl;
    }
    const path =
      normalizeAuthLogValue(req.path) ?? normalizeAuthLogValue(req.originalUrl ?? req.url);
    return bucketConcretePath(path);
  };
  const compactAuthLogContext = (log) =>
    Object.fromEntries(
      Object.entries(log)
        .map(([key, value]) => [key, normalizeAuthLogContextValue(value)])
        .filter(([, value]) => value !== undefined),
    );
  const buildSafeAuthLogContext = (req, authState, extra = {}) =>
    compactAuthLogContext({
      ...extra,
      request_id:
        normalizeAuthLogValue(req.requestId) ??
        normalizeAuthLogValue(req.id) ??
        normalizeAuthLogValue(req.headers?.['x-request-id']) ??
        normalizeAuthLogValue(req.headers?.['x-correlation-id']),
      method: normalizeAuthLogValue(req.method),
      path: getRequestPath(req),
      token_provider: getSafeTokenProvider(authState.tokenProvider),
      openid_reuse_enabled: authState.openidReuseEnabled,
      openid_jwt_available: authState.openidJwtAvailable,
      has_openid_reuse_user_id: authState.hasOpenIdReuseUserId,
    });
  const formatAuthLogMessage = (message, context) => `${message} ${JSON.stringify(context)}`;
  const normalizeContextValue = (value) => {
    const trimmed = value?.trim?.();
    return trimmed || undefined;
  };
  const getUserId = (user) =>
    normalizeContextValue(user?.id?.toString?.()) ?? normalizeContextValue(user?._id?.toString?.());
  const getRequestId = (req) =>
    normalizeContextValue(req.requestId) ??
    normalizeContextValue(req.id) ??
    normalizeContextValue(req.headers?.['x-request-id']) ??
    normalizeContextValue(req.headers?.['x-correlation-id']);
  return {
    isEnabled: jest.fn(() => false),
    recordRumProxyRequest: jest.fn(),
    getAuthFailureReason,
    getAuthFailureErrorName,
    buildSafeAuthLogContext,
    formatAuthLogMessage,
    maybeRefreshCloudFrontAuthCookiesMiddleware: jest.fn((req, res, next) => next()),
    tenantContextMiddleware: (req, res, next) => {
      const context = {
        tenantId: normalizeContextValue(req.user?.tenantId),
        userId: getUserId(req.user),
        requestId: getRequestId(req),
      };
      if (!context.tenantId && !context.userId && !context.requestId) {
        return next();
      }
      return tenantStorage.run(context, async () => next());
    },
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────

const requireJwtAuth = require('../requireJwtAuth');
const { requireRumProxyAuth } = requireJwtAuth;
const { getTenantId, getUserId, logger } = require('@librechat/data-schemas');
const {
  isEnabled,
  maybeRefreshCloudFrontAuthCookiesMiddleware,
  recordRumProxyRequest,
} = require('@librechat/api');
const passport = require('passport');

const jwtSecret = 'test-refresh-secret';

function mockReq(user, extra = {}) {
  return { headers: {}, _mockUser: user, ...extra };
}

function signedOpenIdUserCookie(userId = 'user-openid') {
  return jwt.sign({ id: userId }, jwtSecret);
}

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
}

/** Runs requireJwtAuth and returns the tenantId observed inside next(). */
function runAuth(user) {
  return new Promise((resolve) => {
    const req = mockReq(user);
    const res = mockRes();
    requireJwtAuth(req, res, () => {
      resolve(getTenantId());
    });
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('requireJwtAuth tenant context chaining', () => {
  const originalJwtSecret = process.env.JWT_REFRESH_SECRET;

  beforeEach(() => {
    process.env.JWT_REFRESH_SECRET = jwtSecret;
  });

  afterEach(() => {
    mockPassportError = null;
    mockRegisteredStrategies = new Set(['jwt']);
    isEnabled.mockReturnValue(false);
    maybeRefreshCloudFrontAuthCookiesMiddleware.mockClear();
    logger.debug.mockClear();
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    recordRumProxyRequest.mockClear();
    passport.authenticate.mockClear();
    passport._strategy.mockClear();
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_REFRESH_SECRET;
    } else {
      process.env.JWT_REFRESH_SECRET = originalJwtSecret;
    }
  });

  it('forwards passport errors to next() without entering tenant middleware', async () => {
    mockPassportError = new Error('JWT signature invalid');
    const req = mockReq(undefined);
    const res = mockRes();
    const err = await new Promise((resolve) => {
      requireJwtAuth(req, res, (e) => resolve(e));
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('JWT signature invalid');
    expect(getTenantId()).toBeUndefined();
  });

  it('sets ALS tenant context after passport auth succeeds', async () => {
    const tenantId = await runAuth({ tenantId: 'tenant-abc', role: 'user' });
    expect(tenantId).toBe('tenant-abc');
  });

  it('refreshes CloudFront auth cookies after passport auth succeeds', () => {
    const req = mockReq({ tenantId: 'tenant-abc', role: 'user' });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(maybeRefreshCloudFrontAuthCookiesMiddleware).toHaveBeenCalledWith(
      req,
      res,
      expect.any(Function),
    );
    expect(next).toHaveBeenCalled();
  });

  it('refreshes CloudFront auth cookies inside the request context', () => {
    let observedContext;
    maybeRefreshCloudFrontAuthCookiesMiddleware.mockImplementationOnce(
      (_req, _res, middlewareNext) => {
        observedContext = {
          tenantId: getTenantId(),
          userId: getUserId(),
        };
        middlewareNext();
      },
    );
    const req = mockReq({ id: 'user-123', tenantId: 'tenant-abc', role: 'user' });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(observedContext).toEqual({ tenantId: 'tenant-abc', userId: 'user-123' });
    expect(next).toHaveBeenCalled();
  });

  it('ALS tenant context is NOT set when user has no tenantId', async () => {
    const tenantId = await runAuth({ role: 'user' });
    expect(tenantId).toBeUndefined();
  });

  it('returns 401 when no strategy authenticates a user', async () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(getTenantId()).toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] Authentication failed after all strategies'),
      expect.objectContaining({
        primary_strategy: 'jwt',
        fallback_attempted: false,
        fallback_succeeded: false,
        attempted_strategies: ['jwt'],
        final_strategy: 'jwt',
        reason: 'Unauthorized',
        status: 401,
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs OpenID JWT expiry when JWT fallback succeeds', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      requestId: 'req-expired-success',
      method: 'GET',
      path: '/api/messages',
      headers: {
        cookie: `token_provider=openid; openid_user_id=${signedOpenIdUserCookie('user-jwt')}`,
      },
      _mockStrategies: {
        openidJwt: {
          user: false,
          info: { message: 'jwt expired', name: 'TokenExpiredError' },
          status: 401,
        },
        jwt: { user: { id: 'user-jwt', tenantId: 'tenant-jwt', role: 'user' } },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authStrategy).toBe('jwt');
    expect(res.status).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] OpenID JWT auth failed; trying fallback'),
      expect.objectContaining({
        request_id: 'req-expired-success',
        method: 'GET',
        path: '/api/messages',
        token_provider: 'openid',
        openid_reuse_enabled: true,
        openid_jwt_available: true,
        has_openid_reuse_user_id: true,
        primary_strategy: 'openidJwt',
        fallback_strategy: 'jwt',
        fallback_attempted: true,
        reason: 'jwt expired',
        error_name: 'TokenExpiredError',
        status: 401,
      }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] JWT fallback succeeded after OpenID JWT failure'),
      expect.objectContaining({
        request_id: 'req-expired-success',
        auth_strategy: 'jwt',
        primary_strategy: 'openidJwt',
        fallback_strategy: 'jwt',
        fallback_attempted: true,
        fallback_succeeded: true,
        primary_failure_reason: 'jwt expired',
        reason: 'jwt expired',
        error_name: 'TokenExpiredError',
      }),
    );
    expect(logger.debug.mock.calls[0][0]).toContain('"reason":"jwt expired"');
    expect(logger.debug.mock.calls[0][0]).toContain('"fallback_attempted":true');
    expect(logger.debug.mock.calls[1][0]).toContain('"fallback_succeeded":true');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not let malformed Passport info break JWT fallback logging', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const info = {};
    Object.defineProperties(info, {
      message: {
        get() {
          throw new TypeError('message getter failed');
        },
      },
      name: {
        get() {
          throw new TypeError('name getter failed');
        },
      },
    });
    const req = mockReq(undefined, {
      requestId: 'req-malformed-info',
      method: 'GET',
      path: '/api/messages',
      headers: {
        cookie: `token_provider=openid; openid_user_id=${signedOpenIdUserCookie('user-jwt')}`,
      },
      _mockStrategies: {
        openidJwt: {
          user: false,
          info,
          status: 401,
        },
        jwt: { user: { id: 'user-jwt', tenantId: 'tenant-jwt', role: 'user' } },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    expect(() => requireJwtAuth(req, res, next)).not.toThrow();

    expect(next).toHaveBeenCalled();
    expect(req.authStrategy).toBe('jwt');
    expect(res.status).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] OpenID JWT auth failed; trying fallback'),
      expect.objectContaining({
        request_id: 'req-malformed-info',
        fallback_attempted: true,
        reason: 'Unauthorized',
        status: 401,
      }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] JWT fallback succeeded after OpenID JWT failure'),
      expect.objectContaining({
        request_id: 'req-malformed-info',
        fallback_succeeded: true,
        primary_failure_reason: 'Unauthorized',
      }),
    );
  });

  it('logs OpenID JWT expiry when JWT fallback fails', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      id: 'req-expired-fail',
      method: 'POST',
      originalUrl: '/api/ask?access_token=hidden',
      headers: {
        cookie: `token_provider=openid; openid_user_id=${signedOpenIdUserCookie('user-jwt')}`,
      },
      _mockStrategies: {
        openidJwt: {
          user: false,
          info: { message: 'jwt expired', name: 'TokenExpiredError' },
          status: 401,
        },
        jwt: {
          user: false,
          info: { message: 'invalid signature', name: 'JsonWebTokenError' },
          status: 401,
        },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] OpenID JWT auth failed; trying fallback'),
      expect.objectContaining({
        request_id: 'req-expired-fail',
        method: 'POST',
        path: '/api/ask',
        fallback_attempted: true,
        reason: 'jwt expired',
        error_name: 'TokenExpiredError',
        status: 401,
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] Authentication failed after all strategies'),
      expect.objectContaining({
        request_id: 'req-expired-fail',
        method: 'POST',
        path: '/api/ask',
        token_provider: 'openid',
        attempted_strategies: ['openidJwt', 'jwt'],
        final_strategy: 'jwt',
        primary_strategy: 'openidJwt',
        fallback_strategy: 'jwt',
        fallback_attempted: true,
        fallback_succeeded: false,
        // The real openidJwt failure is surfaced alongside the fallback's reason so a
        // reused-token failure is not misattributed to the `jwt` fallback's error (#14311).
        primary_failure_reason: 'jwt expired',
        primary_failure_error_name: 'TokenExpiredError',
        reason: 'invalid signature',
        error_name: 'JsonWebTokenError',
        status: 401,
      }),
    );
    expect(logger.warn.mock.calls[0][0]).toContain('"reason":"invalid signature"');
    expect(logger.warn.mock.calls[0][0]).toContain('"primary_failure_reason":"jwt expired"');
    expect(logger.warn.mock.calls[0][0]).toContain('"path":"/api/ask"');
  });

  it('does not fall back to OpenID JWT for bearer-only reuse requests', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      _mockStrategies: {
        jwt: { user: false, info: { message: 'invalid signature' }, status: 401 },
        openidJwt: { user: { tenantId: 'tenant-openid', role: 'user' } },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(req.authStrategy).toBeUndefined();
    expect(passport.authenticate).toHaveBeenCalledTimes(1);
    expect(passport.authenticate).toHaveBeenCalledWith(
      'jwt',
      { session: false },
      expect.any(Function),
    );
  });

  it('uses OpenID JWT before LibreChat JWT when the OpenID cookie is present', async () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      headers: { cookie: `token_provider=openid; openid_user_id=${signedOpenIdUserCookie()}` },
      _mockStrategies: {
        openidJwt: { user: { id: 'user-openid', tenantId: 'tenant-openid', role: 'user' } },
        jwt: { user: false, info: { message: 'invalid signature' }, status: 401 },
      },
    });
    const res = mockRes();
    const tenantId = await new Promise((resolve) => {
      requireJwtAuth(req, res, () => {
        resolve(getTenantId());
      });
    });

    expect(tenantId).toBe('tenant-openid');
    expect(req.authStrategy).toBe('openidJwt');
    expect(res.status).not.toHaveBeenCalled();
    expect(passport.authenticate).toHaveBeenCalledWith(
      'openidJwt',
      { session: false },
      expect.any(Function),
    );
    expect(maybeRefreshCloudFrontAuthCookiesMiddleware).toHaveBeenCalledWith(
      req,
      res,
      expect.any(Function),
    );
  });

  it('logs OpenID user-id mismatch when JWT fallback succeeds', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      requestId: 'req-mismatch-success',
      method: 'GET',
      path: '/api/auth/me',
      headers: {
        cookie: `token_provider=openid; openid_user_id=${signedOpenIdUserCookie('user-a')}`,
      },
      _mockStrategies: {
        openidJwt: { user: { id: 'user-b', tenantId: 'tenant-openid', role: 'user' } },
        jwt: { user: { id: 'user-a', tenantId: 'tenant-jwt', role: 'user' } },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authStrategy).toBe('jwt');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] OpenID JWT auth failed; trying fallback'),
      expect.objectContaining({
        request_id: 'req-mismatch-success',
        primary_strategy: 'openidJwt',
        fallback_strategy: 'jwt',
        fallback_attempted: true,
        reason: 'openid user-id mismatch',
        status: 401,
      }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] JWT fallback succeeded after OpenID JWT failure'),
      expect.objectContaining({
        request_id: 'req-mismatch-success',
        auth_strategy: 'jwt',
        fallback_attempted: true,
        fallback_succeeded: true,
        primary_failure_reason: 'openid user-id mismatch',
        reason: 'openid user-id mismatch',
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs OpenID user-id mismatch when JWT fallback fails', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      requestId: 'req-mismatch-fail',
      method: 'GET',
      path: '/api/auth/me',
      headers: {
        cookie: `token_provider=openid; openid_user_id=${signedOpenIdUserCookie('user-a')}`,
      },
      _mockStrategies: {
        openidJwt: { user: { id: 'user-b', tenantId: 'tenant-openid', role: 'user' } },
        jwt: { user: false, info: { message: 'Unauthorized' }, status: 401 },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] OpenID JWT auth failed; trying fallback'),
      expect.objectContaining({
        request_id: 'req-mismatch-fail',
        fallback_attempted: true,
        reason: 'openid user-id mismatch',
        status: 401,
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('[requireJwtAuth] Authentication failed after all strategies'),
      expect.objectContaining({
        request_id: 'req-mismatch-fail',
        attempted_strategies: ['openidJwt', 'jwt'],
        final_strategy: 'jwt',
        fallback_attempted: true,
        fallback_succeeded: false,
        reason: 'Unauthorized',
        status: 401,
      }),
    );
  });

  it('does not authenticate OpenID JWT when the reuse cookie belongs to another user', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      headers: {
        cookie: `token_provider=openid; openid_user_id=${signedOpenIdUserCookie('user-a')}`,
      },
      _mockStrategies: {
        openidJwt: { user: { id: 'user-b', tenantId: 'tenant-openid', role: 'user' } },
        jwt: { user: false, info: { message: 'invalid signature' }, status: 401 },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(req.authStrategy).toBeUndefined();
    expect(passport.authenticate).toHaveBeenCalledTimes(2);
    expect(passport.authenticate).toHaveBeenNthCalledWith(
      1,
      'openidJwt',
      { session: false },
      expect.any(Function),
    );
    expect(passport.authenticate).toHaveBeenNthCalledWith(
      2,
      'jwt',
      { session: false },
      expect.any(Function),
    );
    expect(maybeRefreshCloudFrontAuthCookiesMiddleware).not.toHaveBeenCalled();
  });

  it('does not use OpenID JWT when the signed OpenID reuse cookie is missing', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      headers: { cookie: 'token_provider=openid' },
      _mockStrategies: {
        jwt: { user: false, info: { message: 'invalid signature' }, status: 401 },
        openidJwt: { user: { tenantId: 'tenant-openid', role: 'user' } },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(req.authStrategy).toBeUndefined();
    expect(passport.authenticate).toHaveBeenCalledTimes(1);
    expect(passport.authenticate).toHaveBeenCalledWith(
      'jwt',
      { session: false },
      expect.any(Function),
    );
    expect(maybeRefreshCloudFrontAuthCookiesMiddleware).not.toHaveBeenCalled();
  });

  it('does not use OpenID JWT when the OpenID reuse cookie is invalid', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      headers: { cookie: 'token_provider=openid; openid_user_id=invalid-jwt' },
      _mockStrategies: {
        jwt: { user: false, info: { message: 'invalid signature' }, status: 401 },
        openidJwt: { user: { tenantId: 'tenant-openid', role: 'user' } },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(req.authStrategy).toBeUndefined();
    expect(passport.authenticate).toHaveBeenCalledTimes(1);
    expect(passport.authenticate).toHaveBeenCalledWith(
      'jwt',
      { session: false },
      expect.any(Function),
    );
    expect(maybeRefreshCloudFrontAuthCookiesMiddleware).not.toHaveBeenCalled();
  });

  it('skips OpenID JWT fallback when the strategy was not registered', async () => {
    isEnabled.mockReturnValue(true);
    const req = mockReq(undefined, {
      _mockStrategies: {
        jwt: { user: false, info: { message: 'invalid signature' }, status: 401 },
        openidJwt: { user: { tenantId: 'tenant-openid', role: 'user' } },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(req.authStrategy).toBeUndefined();
    expect(passport.authenticate).toHaveBeenCalledTimes(1);
    expect(passport.authenticate).toHaveBeenCalledWith(
      'jwt',
      { session: false },
      expect.any(Function),
    );
  });

  it('concurrent requests get isolated tenant contexts', async () => {
    const results = await Promise.all(
      ['tenant-1', 'tenant-2', 'tenant-3'].map((tid) => runAuth({ tenantId: tid, role: 'user' })),
    );
    expect(results).toEqual(['tenant-1', 'tenant-2', 'tenant-3']);
  });

  it('ALS context is not set at top-level scope (outside any request)', () => {
    expect(getTenantId()).toBeUndefined();
  });
});

describe('requireRumProxyAuth', () => {
  const originalJwtSecret = process.env.JWT_REFRESH_SECRET;

  beforeEach(() => {
    process.env.JWT_REFRESH_SECRET = jwtSecret;
  });

  afterEach(() => {
    mockPassportError = null;
    mockRegisteredStrategies = new Set(['jwt']);
    isEnabled.mockReturnValue(false);
    maybeRefreshCloudFrontAuthCookiesMiddleware.mockClear();
    logger.debug.mockClear();
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    recordRumProxyRequest.mockClear();
    passport.authenticate.mockClear();
    passport._strategy.mockClear();
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_REFRESH_SECRET;
    } else {
      process.env.JWT_REFRESH_SECRET = originalJwtSecret;
    }
  });

  it('authenticates telemetry with the LibreChat JWT strategy without tenant or cookie refresh middleware', () => {
    const req = mockReq({ id: 'user-jwt', tenantId: 'tenant-jwt', role: 'user' });
    const res = mockRes();
    const next = jest.fn();

    requireRumProxyAuth(req, res, next);

    expect(passport.authenticate).toHaveBeenCalledWith(
      'jwt',
      { session: false },
      expect.any(Function),
    );
    expect(req.authStrategy).toBe('jwt');
    expect(maybeRefreshCloudFrontAuthCookiesMiddleware).not.toHaveBeenCalled();
    // Success is recorded by the proxy.
    expect(recordRumProxyRequest).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('authenticates telemetry with OpenID JWT reuse when the reuse cookie is present', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      headers: { cookie: `token_provider=openid; openid_user_id=${signedOpenIdUserCookie()}` },
      _mockStrategies: {
        openidJwt: { user: { id: 'user-openid', tenantId: 'tenant-openid', role: 'user' } },
        jwt: { user: false, info: { message: 'invalid signature' }, status: 401 },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireRumProxyAuth(req, res, next);

    expect(passport.authenticate).toHaveBeenCalledWith(
      'openidJwt',
      { session: false },
      expect.any(Function),
    );
    expect(req.authStrategy).toBe('openidJwt');
    expect(maybeRefreshCloudFrontAuthCookiesMiddleware).not.toHaveBeenCalled();
    expect(recordRumProxyRequest).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('falls back to LibreChat JWT when OpenID JWT telemetry auth fails', () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      headers: { cookie: `token_provider=openid; openid_user_id=${signedOpenIdUserCookie()}` },
      _mockStrategies: {
        openidJwt: {
          user: false,
          info: { message: 'jwt expired', name: 'TokenExpiredError' },
          status: 401,
        },
        jwt: { user: { id: 'user-openid', tenantId: 'tenant-jwt', role: 'user' } },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireRumProxyAuth(req, res, next);

    expect(passport.authenticate).toHaveBeenCalledTimes(2);
    expect(req.authStrategy).toBe('jwt');
    expect(recordRumProxyRequest).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('drops invalid telemetry auth with 204 instead of returning an app auth error', () => {
    const req = mockReq(undefined, {
      path: '/v1/traces',
      _mockStrategies: {
        jwt: {
          user: false,
          info: { message: 'invalid signature', name: 'JsonWebTokenError' },
          status: 401,
        },
      },
    });
    const res = mockRes();
    const next = jest.fn();

    requireRumProxyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(maybeRefreshCloudFrontAuthCookiesMiddleware).not.toHaveBeenCalled();
    expect(recordRumProxyRequest).toHaveBeenCalledWith('traces', 'auth_drop');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('records passport errors separately from ordinary telemetry auth drops', () => {
    mockPassportError = new Error('passport unavailable');
    const req = mockReq(undefined, { path: '/v1/logs' });
    const res = mockRes();
    const next = jest.fn();

    requireRumProxyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(recordRumProxyRequest).toHaveBeenCalledWith('logs', 'auth_error');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });
});
