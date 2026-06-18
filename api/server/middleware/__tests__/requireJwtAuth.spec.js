/**
 * Integration test: verifies that requireJwtAuth chains tenantContextMiddleware
 * after successful passport authentication, so ALS tenant context is set for
 * all downstream middleware and route handlers.
 *
 * requireJwtAuth must chain tenantContextMiddleware after passport populates
 * req.user (not at global app.use() scope where req.user is undefined).
 * If the chaining is removed, these tests fail.
 */

// ── Mocks ──────────────────────────────────────────────────────────────

let mockPassportError = null;

jest.mock('passport', () => ({
  _strategy: jest.fn(),
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
    tenantStorage,
  };
});

// Mock @librechat/api — the real tenantContextMiddleware is TS and cannot be
// required directly from CJS tests. This thin wrapper mirrors the real logic
// (read request context, call tenantStorage.run) using the same data-schemas
// primitives. The real implementation is covered by packages/api tenant.spec.ts.
jest.mock('@librechat/api', () => {
  const { tenantStorage } = require('@librechat/data-schemas');
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
const { getTenantId, getUserId } = require('@librechat/data-schemas');
const { maybeRefreshCloudFrontAuthCookiesMiddleware } = require('@librechat/api');
const passport = require('passport');

function mockReq(user, extra = {}) {
  return { headers: {}, _mockUser: user, ...extra };
}

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
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
  afterEach(() => {
    mockPassportError = null;
    maybeRefreshCloudFrontAuthCookiesMiddleware.mockClear();
    passport.authenticate.mockClear();
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
  });

  it('uses only the jwt strategy', () => {
    const req = mockReq({ tenantId: 'tenant-abc', role: 'user' });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(passport.authenticate).toHaveBeenCalledTimes(1);
    expect(passport.authenticate).toHaveBeenCalledWith(
      'jwt',
      { session: false },
      expect.any(Function),
    );
  });

  it('sets authStrategy to jwt on successful authentication', () => {
    const req = mockReq({ tenantId: 'tenant-abc', role: 'user' });
    const res = mockRes();
    const next = jest.fn();

    requireJwtAuth(req, res, next);

    expect(req.authStrategy).toBe('jwt');
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
