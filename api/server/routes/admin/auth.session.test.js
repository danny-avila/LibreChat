const express = require('express');
const request = require('supertest');

const mockGenerateAdminExchangeCode = jest.fn(() => Promise.resolve('a'.repeat(64)));

jest.mock('passport', () => ({
  authenticate: jest.fn(() => (req, res, next) => next()),
}));

jest.mock('openid-client', () => ({
  refreshTokenGrant: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  CacheKeys: { ADMIN_OAUTH_EXCHANGE: 'admin-oauth-exchange' },
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
  DEFAULT_SESSION_EXPIRY: 60000,
  SystemCapabilities: { ACCESS_ADMIN: 'ACCESS_ADMIN' },
  getTenantId: jest.fn(() => undefined),
}));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => false),
  getAdminPanelUrl: jest.fn(() => 'http://admin.example.com'),
  exchangeAdminCode: jest.fn(),
  generateAdminExchangeCode: (...args) => mockGenerateAdminExchangeCode(...args),
  createSetBalanceConfig: jest.fn(() => (req, res, next) => next()),
  storeAndStripChallenge: jest.fn(() => Promise.resolve(true)),
  tenantContextMiddleware: jest.fn((req, res, next) => next()),
  preAuthTenantMiddleware: jest.fn((req, res, next) => next()),
  applyAdminRefresh: jest.fn(),
  AdminRefreshError: class AdminRefreshError extends Error {},
  buildOpenIDRefreshParams: jest.fn(() => ({})),
}));

jest.mock('~/server/controllers/auth/LoginController', () => ({
  loginController: jest.fn((req, res) => res.status(200).end()),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  hasCapability: jest.fn(() => Promise.resolve(true)),
  requireCapability: jest.fn(() => (req, res, next) => next()),
  isPlatformAdmin: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('~/server/controllers/auth/oauth', () => ({
  createOAuthHandler: jest.fn(() => (req, res) => res.status(200).end()),
}));

jest.mock('~/models', () => ({
  findBalanceByUser: jest.fn(),
  findUsers: jest.fn(),
  generateToken: jest.fn(() => Promise.resolve('minted-token')),
  getUserById: jest.fn(),
  upsertBalanceFields: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

jest.mock('~/cache/getLogStores', () =>
  jest.fn(() => ({
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  })),
);

jest.mock('~/strategies', () => ({
  getOpenIdConfig: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    req.user = {
      _id: 'user-1',
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'ADMIN',
      tenantId: 'tenant-a',
      provider: 'local',
    };
    next();
  },
  loginLimiter: (req, res, next) => next(),
  logHeaders: (req, res, next) => next(),
  checkBan: (req, res, next) => next(),
  requireLocalAuth: (req, res, next) => next(),
  checkDomainAllowed: (req, res, next) => next(),
}));

const router = require('./auth');

describe('POST /api/admin/session', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/admin', router);
  });

  beforeEach(() => {
    mockGenerateAdminExchangeCode.mockClear();
  });

  it('returns an admin panel callback URL with a one-time exchange code', async () => {
    const res = await request(app).post('/api/admin/session');

    expect(res.status).toBe(200);
    expect(res.body.url).toBe(
      `http://admin.example.com/auth/session/callback?code=${'a'.repeat(64)}`,
    );
    expect(mockGenerateAdminExchangeCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: 'admin@example.com' }),
      'minted-token',
      undefined,
      'http://admin.example.com',
      undefined,
      expect.any(Number),
    );
  });
});
