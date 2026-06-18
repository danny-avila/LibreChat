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

describe('admin auth Google refresh route', () => {
  const ORIGINAL_GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const ORIGINAL_GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  const { findUsers, getUserById, generateToken } = require('~/models');
  const { hasCapability } = require('~/server/middleware/roles/capabilities');

  const validIdToken = () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'google-admin-id' })).toString('base64url');
    return `${header}.${payload}.signature`;
  };

  let app;
  let originalFetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    delete process.env.SESSION_EXPIRY;

    app = express();
    app.use(express.json());
    app.use('/api/admin', adminAuthRouter);

    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'google-new-access',
            id_token: validIdToken(),
            expires_in: 3600,
          }),
      }),
    );

    findUsers.mockResolvedValue([
      {
        _id: { toString: () => 'user-id' },
        id: 'user-id',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        googleId: 'google-admin-id',
      },
    ]);
    getUserById.mockResolvedValue(null);
    generateToken.mockResolvedValue('admin-jwt');
    hasCapability.mockResolvedValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    if (ORIGINAL_GOOGLE_CLIENT_ID === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = ORIGINAL_GOOGLE_CLIENT_ID;
    }
    if (ORIGINAL_GOOGLE_CLIENT_SECRET === undefined) {
      delete process.env.GOOGLE_CLIENT_SECRET;
    } else {
      process.env.GOOGLE_CLIENT_SECRET = ORIGINAL_GOOGLE_CLIENT_SECRET;
    }
  });

  it('refreshes a google admin session by calling Google with grant_type=refresh_token', async () => {
    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-google-refresh', provider: 'google' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      token: 'admin-jwt',
      refreshToken: 'incoming-google-refresh',
      user: {
        id: 'user-id',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
      },
      expiresAt: expect.any(Number),
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
    const body = global.fetch.mock.calls[0][1].body.toString();
    expect(body).toContain('client_id=google-client-id');
    expect(body).toContain('client_secret=google-client-secret');
    expect(body).toContain('refresh_token=incoming-google-refresh');
    expect(body).toContain('grant_type=refresh_token');
  });

  it('does not require OPENID_REUSE_TOKENS for the google provider', async () => {
    isEnabled.mockReturnValue(false);

    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-google-refresh', provider: 'google' });

    expect(response.status).toBe(200);
  });

  it('rejects google refresh when GOOGLE_CLIENT_ID/SECRET are not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-google-refresh', provider: 'google' });

    expect(response.status).toBe(503);
    expect(response.body.error_code).toBe('GOOGLE_NOT_CONFIGURED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('maps a 401 from Google to REFRESH_FAILED', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }),
    );

    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-google-refresh', provider: 'google' });

    expect(response.status).toBe(401);
    expect(response.body.error_code).toBe('REFRESH_FAILED');
  });

  it('returns IDP_INCOMPLETE when Google omits access_token or id_token', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'only-access' }),
      }),
    );

    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-google-refresh', provider: 'google' });

    expect(response.status).toBe(502);
    expect(response.body.error_code).toBe('IDP_INCOMPLETE');
  });

  it('returns CLAIMS_INCOMPLETE when Google id_token has no sub', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({})).toString('base64url');
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'google-new-access',
            id_token: `${header}.${payload}.signature`,
          }),
      }),
    );

    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-google-refresh', provider: 'google' });

    expect(response.status).toBe(502);
    expect(response.body.error_code).toBe('CLAIMS_INCOMPLETE');
  });

  it('returns USER_NOT_FOUND when no admin user matches the refreshed googleId', async () => {
    findUsers.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-google-refresh', provider: 'google' });

    expect(response.status).toBe(401);
    expect(response.body.error_code).toBe('USER_NOT_FOUND');
  });

  it('returns USER_ID_MISMATCH when user_id resolves to a user with a different googleId', async () => {
    getUserById.mockResolvedValue({
      _id: { toString: () => 'other-user' },
      googleId: 'different-google-id',
      tenantId: undefined,
    });

    const response = await request(app).post('/api/admin/oauth/refresh').send({
      refresh_token: 'incoming-google-refresh',
      user_id: 'other-user',
      provider: 'google',
    });

    expect(response.status).toBe(401);
    expect(response.body.error_code).toBe('USER_ID_MISMATCH');
  });

  it('returns FORBIDDEN when the resolved user no longer holds ACCESS_ADMIN', async () => {
    hasCapability.mockResolvedValue(false);

    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-google-refresh', provider: 'google' });

    expect(response.status).toBe(403);
    expect(response.body.error_code).toBe('FORBIDDEN');
  });

  it('forwards a rotated refresh_token from Google when present', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'google-new-access',
            id_token: validIdToken(),
            refresh_token: 'rotated-google-refresh',
          }),
      }),
    );

    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-google-refresh', provider: 'google' });

    expect(response.status).toBe(200);
    expect(response.body.refreshToken).toBe('rotated-google-refresh');
  });

  it('rejects unknown provider values with INVALID_PROVIDER', async () => {
    const response = await request(app)
      .post('/api/admin/oauth/refresh')
      .send({ refresh_token: 'incoming-refresh', provider: 'github' });

    expect(response.status).toBe(400);
    expect(response.body.error_code).toBe('INVALID_PROVIDER');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
