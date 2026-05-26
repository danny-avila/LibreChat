const express = require('express');
const request = require('supertest');

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
  },
  DEFAULT_SESSION_EXPIRY: 60000,
  SystemCapabilities: { ACCESS_ADMIN: 'ACCESS_ADMIN' },
  getTenantId: jest.fn(() => undefined),
}));

jest.mock('@librechat/api', () => {
  class AdminRefreshError extends Error {
    constructor(code, status, message) {
      super(message);
      this.name = 'AdminRefreshError';
      this.code = code;
      this.status = status;
    }
  }

  return {
    isEnabled: jest.fn(),
    getAdminPanelUrl: jest.fn(() => 'http://admin.example.com'),
    exchangeAdminCode: jest.fn(),
    createSetBalanceConfig: jest.fn(() => (req, res, next) => next()),
    storeAndStripChallenge: jest.fn(),
    tenantContextMiddleware: jest.fn((req, res, next) => next()),
    preAuthTenantMiddleware: jest.fn((req, res, next) => next()),
    applyAdminRefresh: jest.fn(),
    AdminRefreshError,
    buildOpenIDRefreshParams: jest.fn(() => {
      const params = {};
      if (process.env.OPENID_SCOPE) {
        params.scope = process.env.OPENID_SCOPE;
      }
      if (process.env.OPENID_REFRESH_AUDIENCE) {
        params.audience = process.env.OPENID_REFRESH_AUDIENCE;
      }
      return params;
    }),
  };
});

jest.mock('~/server/controllers/auth/LoginController', () => ({
  loginController: jest.fn((req, res) => res.status(200).end()),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  hasCapability: jest.fn(() => Promise.resolve(true)),
  requireCapability: jest.fn(() => (req, res, next) => next()),
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
    get: jest.fn(),
    delete: jest.fn(),
  })),
);

jest.mock('~/strategies', () => ({
  getOpenIdConfig: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  logHeaders: jest.fn((req, res, next) => next()),
  loginLimiter: jest.fn((req, res, next) => next()),
  checkBan: jest.fn((req, res, next) => next()),
  requireLocalAuth: jest.fn((req, res, next) => next()),
  requireJwtAuth: jest.fn((req, res, next) => next()),
  checkDomainAllowed: jest.fn((req, res, next) => next()),
}));

const openIdClient = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { isEnabled, applyAdminRefresh, buildOpenIDRefreshParams } = require('@librechat/api');
const { getOpenIdConfig } = require('~/strategies');
const adminAuthRouter = require('./auth');

const ORIGINAL_OPENID_SCOPE = process.env.OPENID_SCOPE;
const ORIGINAL_OPENID_REFRESH_AUDIENCE = process.env.OPENID_REFRESH_AUDIENCE;
const ORIGINAL_SESSION_EXPIRY = process.env.SESSION_EXPIRY;

describe('admin auth OpenID refresh route', () => {
  const openIdConfig = {
    serverMetadata: jest.fn(() => ({ issuer: 'https://issuer.example.com' })),
  };
  const tokenset = {
    access_token: 'new-admin-access',
    id_token: 'new-admin-id',
    refresh_token: 'new-admin-refresh',
    expires_in: 3600,
    claims: jest.fn(() => ({ sub: 'admin-openid-id' })),
  };

  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENID_SCOPE;
    delete process.env.OPENID_REFRESH_AUDIENCE;
    delete process.env.SESSION_EXPIRY;

    app = express();
    app.use(express.json());
    app.use('/api/admin', adminAuthRouter);

    isEnabled.mockReturnValue(true);
    getOpenIdConfig.mockReturnValue(openIdConfig);
    openIdClient.refreshTokenGrant.mockResolvedValue(tokenset);
    applyAdminRefresh.mockResolvedValue({
      token: 'admin-jwt',
      refreshToken: 'new-admin-refresh',
      user: { id: 'user-id', email: 'admin@example.com' },
      expiresAt: 1234567890,
    });
  });

  afterAll(() => {
    if (ORIGINAL_OPENID_SCOPE === undefined) {
      delete process.env.OPENID_SCOPE;
    } else {
      process.env.OPENID_SCOPE = ORIGINAL_OPENID_SCOPE;
    }

    if (ORIGINAL_OPENID_REFRESH_AUDIENCE === undefined) {
      delete process.env.OPENID_REFRESH_AUDIENCE;
    } else {
      process.env.OPENID_REFRESH_AUDIENCE = ORIGINAL_OPENID_REFRESH_AUDIENCE;
    }

    if (ORIGINAL_SESSION_EXPIRY === undefined) {
      delete process.env.SESSION_EXPIRY;
    } else {
      process.env.SESSION_EXPIRY = ORIGINAL_SESSION_EXPIRY;
    }
  });

  it.each([
    ['scope-only', { OPENID_SCOPE: 'openid profile email' }, { scope: 'openid profile email' }],
    [
      'scope and audience',
      {
        OPENID_SCOPE: 'openid profile email',
        OPENID_REFRESH_AUDIENCE: 'https://api.example.com',
      },
      { scope: 'openid profile email', audience: 'https://api.example.com' },
    ],
    [
      'audience-only',
      { OPENID_REFRESH_AUDIENCE: 'https://api.example.com' },
      { audience: 'https://api.example.com' },
    ],
    ['empty audience', { OPENID_REFRESH_AUDIENCE: '' }, {}],
  ])('passes %s params to the OpenID refresh grant', async (_label, env, expectedParams) => {
    Object.assign(process.env, env);

    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-refresh-token' });

    expect(response.status).toBe(200);
    expect(buildOpenIDRefreshParams).toHaveBeenCalledTimes(1);
    expect(openIdClient.refreshTokenGrant).toHaveBeenCalledWith(
      openIdConfig,
      'incoming-refresh-token',
      expectedParams,
    );
    expect(applyAdminRefresh).toHaveBeenCalledWith(
      tokenset,
      expect.any(Object),
      expect.objectContaining({ previousRefreshToken: 'incoming-refresh-token' }),
    );
  });

  it('returns the existing refresh failure response when the IdP rejects the grant', async () => {
    openIdClient.refreshTokenGrant.mockRejectedValue({
      code: 'invalid_grant',
      name: 'OAuthError',
    });

    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-refresh-token' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Refresh failed',
      error_code: 'REFRESH_FAILED',
    });
    expect(applyAdminRefresh).not.toHaveBeenCalled();
  });

  it('keeps admin refresh diagnostics free of token and audience values', async () => {
    process.env.OPENID_SCOPE = 'openid profile email';
    process.env.OPENID_REFRESH_AUDIENCE = 'https://api.example.com';

    await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-refresh-token' });

    expect(logger.debug).toHaveBeenCalledWith('[admin/oauth/refresh] OpenID refresh params', {
      has_scope: true,
      has_refresh_audience: true,
    });
    expect(logger.debug).toHaveBeenCalledWith('[admin/oauth/refresh] OpenID refresh succeeded', {
      has_access_token: true,
      has_id_token: true,
      has_refresh_token: true,
      expires_in: 3600,
    });
    const debugOutput = JSON.stringify(logger.debug.mock.calls);
    expect(debugOutput).not.toContain('incoming-refresh-token');
    expect(debugOutput).not.toContain('new-admin-access');
    expect(debugOutput).not.toContain('new-admin-id');
    expect(debugOutput).not.toContain('new-admin-refresh');
    expect(debugOutput).not.toContain('https://api.example.com');
  });
});
