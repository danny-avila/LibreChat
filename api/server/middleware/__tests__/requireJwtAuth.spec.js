/**
 * Integration test: verifies that requireJwtAuth chains tenantContextMiddleware
 * after successful passport authentication, so ALS tenant context is set for
 * all downstream middleware and route handlers.
 *
 * requireJwtAuth must chain tenantContextMiddleware after passport populates
 * req.user (not at global app.use() scope where req.user is undefined).
 * If the chaining is removed, these tests fail.
 */

const { getTenantId } = require('@librechat/data-schemas');

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

// Mock @librechat/api — the real tenantContextMiddleware is TS and cannot be
// required directly from CJS tests. This thin wrapper mirrors the real logic
// (read req.user.tenantId, call tenantStorage.run) using the same data-schemas
// primitives. The real implementation is covered by packages/api tenant.spec.ts.
jest.mock('@librechat/api', () => {
  const { tenantStorage } = require('@librechat/data-schemas');
  return {
    isEnabled: jest.fn(() => false),
    tenantContextMiddleware: (req, res, next) => {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next();
      }
      return tenantStorage.run({ tenantId }, async () => next());
    },
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────

const requireJwtAuth = require('../requireJwtAuth');
const { isEnabled } = require('@librechat/api');
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
    mockRegisteredStrategies = new Set(['jwt']);
    isEnabled.mockReturnValue(false);
    passport.authenticate.mockClear();
    passport._strategy.mockClear();
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

  it('falls back to OpenID JWT for bearer-only reuse requests', async () => {
    isEnabled.mockReturnValue(true);
    mockRegisteredStrategies.add('openidJwt');
    const req = mockReq(undefined, {
      _mockStrategies: {
        jwt: { user: false, info: { message: 'invalid signature' }, status: 401 },
        openidJwt: { user: { tenantId: 'tenant-openid', role: 'user' } },
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
