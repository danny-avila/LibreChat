jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
  DEFAULT_SESSION_EXPIRY: 900000,
  DEFAULT_REFRESH_TOKEN_EXPIRY: 604800000,
}));
jest.mock('librechat-data-provider', () => ({
  ErrorTypes: {},
  SystemRoles: { USER: 'USER', ADMIN: 'ADMIN' },
  errorsToString: jest.fn(),
}));
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn((val) => val === 'true' || val === true),
  checkEmailConfig: jest.fn(),
  isEmailDomainAllowed: jest.fn(),
  math: jest.fn((val, fallback) => (val ? Number(val) : fallback)),
  shouldUseSecureCookie: jest.fn(() => false),
  resolveAppConfigForUser: jest.fn(async (_getAppConfig, _user) => ({})),
  setCloudFrontCookies: jest.fn(() => true),
  getCloudFrontConfig: jest.fn(() => ({
    domain: 'https://cdn.example.com',
    imageSigning: 'cookies',
    cookieDomain: '.example.com',
    privateKey: 'test-private-key',
    keyPairId: 'K123ABC',
  })),
  parseCloudFrontCookieScope: jest.fn(() => null),
  CLOUDFRONT_SCOPE_COOKIE: 'LibreChat-CloudFront-Scope',
}));
jest.mock('~/models', () => ({
  findUser: jest.fn(),
  findToken: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  countUsers: jest.fn(),
  getUserById: jest.fn(),
  findSession: jest.fn(),
  createToken: jest.fn(),
  deleteTokens: jest.fn(),
  deleteSession: jest.fn(),
  createSession: jest.fn(),
  generateToken: jest.fn(),
  deleteUserById: jest.fn(),
  generateRefreshToken: jest.fn(),
}));
jest.mock('~/strategies/validators', () => ({ registerSchema: { parse: jest.fn() } }));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));
jest.mock('~/server/utils', () => ({ sendEmail: jest.fn() }));

const {
  shouldUseSecureCookie,
  isEmailDomainAllowed,
  resolveAppConfigForUser,
  setCloudFrontCookies,
  getCloudFrontConfig,
  parseCloudFrontCookieScope,
} = require('@librechat/api');
const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');
const {
  findUser,
  getUserById,
  generateToken,
  generateRefreshToken,
  createSession,
} = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const {
  setOpenIDAuthTokens,
  requestPasswordReset,
  setAuthTokens,
  setCloudFrontAuthCookies,
} = require('./AuthService');

/** Helper to build a mock Express response */
function mockResponse() {
  const cookies = {};
  const res = {
    cookie: jest.fn((name, value, options) => {
      cookies[name] = { value, options };
    }),
    _cookies: cookies,
  };
  return res;
}

/** Helper to build a mock Express request with session */
function mockRequest(sessionData = {}, cookies = {}) {
  return {
    session: { openidTokens: null, ...sessionData },
    cookies,
  };
}

describe('setOpenIDAuthTokens', () => {
  const env = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...env,
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      OPENID_REUSE_TOKENS: 'true',
    };
  });

  afterAll(() => {
    process.env = env;
  });

  describe('token selection (id_token vs access_token)', () => {
    it('should return id_token when both id_token and access_token are present', () => {
      const tokenset = {
        id_token: 'the-id-token',
        access_token: 'the-access-token',
        refresh_token: 'the-refresh-token',
      };
      const req = mockRequest();
      const res = mockResponse();

      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123');
      expect(result).toBe('the-id-token');
    });

    it('should return access_token when id_token is not available', () => {
      const tokenset = {
        access_token: 'the-access-token',
        refresh_token: 'the-refresh-token',
      };
      const req = mockRequest();
      const res = mockResponse();

      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123');
      expect(result).toBe('the-access-token');
    });

    it('should return access_token when id_token is undefined', () => {
      const tokenset = {
        id_token: undefined,
        access_token: 'the-access-token',
        refresh_token: 'the-refresh-token',
      };
      const req = mockRequest();
      const res = mockResponse();

      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123');
      expect(result).toBe('the-access-token');
    });

    it('should return access_token when id_token is null', () => {
      const tokenset = {
        id_token: null,
        access_token: 'the-access-token',
        refresh_token: 'the-refresh-token',
      };
      const req = mockRequest();
      const res = mockResponse();

      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123');
      expect(result).toBe('the-access-token');
    });

    it('should return id_token even when id_token and access_token differ', () => {
      const tokenset = {
        id_token: 'id-token-jwt-signed-by-idp',
        access_token: 'opaque-graph-api-token',
        refresh_token: 'refresh-token',
      };
      const req = mockRequest();
      const res = mockResponse();

      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123');
      expect(result).toBe('id-token-jwt-signed-by-idp');
      expect(result).not.toBe('opaque-graph-api-token');
    });
  });

  describe('session token storage', () => {
    it('should store the original access_token in session (not id_token)', () => {
      const tokenset = {
        id_token: 'the-id-token',
        access_token: 'the-access-token',
        refresh_token: 'the-refresh-token',
      };
      const req = mockRequest();
      const res = mockResponse();

      setOpenIDAuthTokens(tokenset, req, res, 'user-123');

      expect(req.session.openidTokens.accessToken).toBe('the-access-token');
      expect(req.session.openidTokens.idToken).toBe('the-id-token');
      expect(req.session.openidTokens.refreshToken).toBe('the-refresh-token');
      expect(req.session.openidTokens.lastRefreshedAt).toEqual(expect.any(Number));
    });

    it('should return the existing unexpired session id_token when refresh omits one', () => {
      const existingIdToken = jwt.sign(
        { sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 },
        'idp-signing-secret',
      );
      const tokenset = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      };
      const req = mockRequest({
        openidTokens: {
          accessToken: 'old-access-token',
          idToken: existingIdToken,
          refreshToken: 'old-refresh-token',
        },
      });
      const res = mockResponse();

      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123');

      expect(result).toBe(existingIdToken);
      expect(req.session.openidTokens.accessToken).toBe('new-access-token');
      expect(req.session.openidTokens.idToken).toBe(existingIdToken);
      expect(req.session.openidTokens.refreshToken).toBe('new-refresh-token');
      expect(req.session.openidTokens.lastRefreshedAt).toEqual(expect.any(Number));
    });

    it('should fall back to access_token when the existing session id_token is expired', () => {
      const expiredIdToken = jwt.sign(
        { sub: 'user-123', exp: Math.floor(Date.now() / 1000) - 60 },
        'idp-signing-secret',
      );
      const tokenset = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      };
      const req = mockRequest({
        openidTokens: {
          accessToken: 'old-access-token',
          idToken: expiredIdToken,
          refreshToken: 'old-refresh-token',
        },
      });
      const res = mockResponse();

      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123');

      expect(result).toBe('new-access-token');
      expect(req.session.openidTokens.idToken).toBe(expiredIdToken);
      expect(req.session.openidTokens.accessToken).toBe('new-access-token');
    });

    it('should fall back to access_token when the existing session id_token is near expiry', () => {
      const nearExpiryIdToken = jwt.sign(
        { sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 10 },
        'idp-signing-secret',
      );
      const tokenset = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      };
      const req = mockRequest({
        openidTokens: {
          accessToken: 'old-access-token',
          idToken: nearExpiryIdToken,
          refreshToken: 'old-refresh-token',
        },
      });
      const res = mockResponse();

      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123');

      expect(result).toBe('new-access-token');
      expect(req.session.openidTokens.idToken).toBe(nearExpiryIdToken);
      expect(req.session.openidTokens.accessToken).toBe('new-access-token');
    });
  });

  describe('cookie secure flag', () => {
    it('should call shouldUseSecureCookie for every cookie set', () => {
      const tokenset = {
        id_token: 'the-id-token',
        access_token: 'the-access-token',
        refresh_token: 'the-refresh-token',
      };
      const req = mockRequest();
      const res = mockResponse();

      setOpenIDAuthTokens(tokenset, req, res, 'user-123');

      // token_provider + openid_user_id (session path, so no refreshToken/openid_access_token cookies)
      const secureCalls = shouldUseSecureCookie.mock.calls.length;
      expect(secureCalls).toBeGreaterThanOrEqual(2);

      // Verify all cookies use the result of shouldUseSecureCookie
      for (const [, cookie] of Object.entries(res._cookies)) {
        expect(cookie.options.secure).toBe(false);
      }
    });

    it('should set secure: true when shouldUseSecureCookie returns true', () => {
      shouldUseSecureCookie.mockReturnValue(true);

      const tokenset = {
        id_token: 'the-id-token',
        access_token: 'the-access-token',
        refresh_token: 'the-refresh-token',
      };
      const req = mockRequest();
      const res = mockResponse();

      setOpenIDAuthTokens(tokenset, req, res, 'user-123');

      for (const [, cookie] of Object.entries(res._cookies)) {
        expect(cookie.options.secure).toBe(true);
      }
    });

    it('should use shouldUseSecureCookie for cookie fallback path (no session)', () => {
      shouldUseSecureCookie.mockReturnValue(false);

      const tokenset = {
        id_token: 'the-id-token',
        access_token: 'the-access-token',
        refresh_token: 'the-refresh-token',
      };
      const req = { session: null };
      const res = mockResponse();

      setOpenIDAuthTokens(tokenset, req, res, 'user-123');

      // In the cookie fallback path, we get: refreshToken, openid_access_token, token_provider, openid_user_id
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(String),
        expect.objectContaining({ secure: false }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'openid_access_token',
        expect.any(String),
        expect.objectContaining({ secure: false }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'token_provider',
        'openid',
        expect.objectContaining({ secure: false }),
      );
    });
  });

  describe('edge cases', () => {
    it('should return undefined when tokenset is null', () => {
      const req = mockRequest();
      const res = mockResponse();
      const result = setOpenIDAuthTokens(null, req, res, 'user-123');
      expect(result).toBeUndefined();
    });

    it('should return undefined when access_token is missing', () => {
      const tokenset = { refresh_token: 'refresh' };
      const req = mockRequest();
      const res = mockResponse();
      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123');
      expect(result).toBeUndefined();
    });

    it('should return undefined when no refresh token is available', () => {
      const tokenset = { access_token: 'access', id_token: 'id' };
      const req = mockRequest();
      const res = mockResponse();
      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123');
      expect(result).toBeUndefined();
    });

    it('should use existingRefreshToken when tokenset has no refresh_token', () => {
      const tokenset = {
        id_token: 'the-id-token',
        access_token: 'the-access-token',
      };
      const req = mockRequest();
      const res = mockResponse();

      const result = setOpenIDAuthTokens(tokenset, req, res, 'user-123', 'existing-refresh');
      expect(result).toBe('the-id-token');
      expect(req.session.openidTokens.refreshToken).toBe('existing-refresh');
    });
  });
});

describe('requestPasswordReset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isEmailDomainAllowed.mockReturnValue(true);
    getAppConfig.mockResolvedValue({
      registration: { allowedDomains: ['example.com'] },
    });
    resolveAppConfigForUser.mockResolvedValue({
      registration: { allowedDomains: ['example.com'] },
    });
  });

  it('should fast-fail with base config before DB lookup for blocked domains', async () => {
    isEmailDomainAllowed.mockReturnValue(false);

    const req = { body: { email: 'blocked@evil.com' }, ip: '127.0.0.1' };
    const result = await requestPasswordReset(req);

    expect(getAppConfig).toHaveBeenCalledWith({ baseOnly: true });
    expect(findUser).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(Error);
  });

  it('should call resolveAppConfigForUser for tenant user', async () => {
    const user = {
      _id: 'user-tenant',
      email: 'user@example.com',
      tenantId: 'tenant-x',
      role: 'USER',
    };
    findUser.mockResolvedValue(user);

    const req = { body: { email: 'user@example.com' }, ip: '127.0.0.1' };
    await requestPasswordReset(req);

    expect(resolveAppConfigForUser).toHaveBeenCalledWith(getAppConfig, user);
  });

  it('should reuse baseConfig for non-tenant user without calling resolveAppConfigForUser', async () => {
    findUser.mockResolvedValue({ _id: 'user-no-tenant', email: 'user@example.com' });

    const req = { body: { email: 'user@example.com' }, ip: '127.0.0.1' };
    await requestPasswordReset(req);

    expect(resolveAppConfigForUser).not.toHaveBeenCalled();
  });

  it('should return generic response when tenant config blocks the domain (non-enumerable)', async () => {
    const user = {
      _id: 'user-tenant',
      email: 'user@example.com',
      tenantId: 'tenant-x',
      role: 'USER',
    };
    findUser.mockResolvedValue(user);
    isEmailDomainAllowed.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const req = { body: { email: 'user@example.com' }, ip: '127.0.0.1' };
    const result = await requestPasswordReset(req);

    expect(result).not.toBeInstanceOf(Error);
    expect(result.message).toContain('If an account with that email exists');
  });
});

describe('CloudFront cookie integration', () => {
  const cloudFrontCookieConfig = {
    domain: 'https://cdn.example.com',
    imageSigning: 'cookies',
    cookieDomain: '.example.com',
    privateKey: 'test-private-key',
    keyPairId: 'K123ABC',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getCloudFrontConfig.mockReturnValue(cloudFrontCookieConfig);
    setCloudFrontCookies.mockReturnValue(true);
    parseCloudFrontCookieScope.mockReturnValue(null);
  });

  describe('setCloudFrontAuthCookies', () => {
    it('passes user id and tenant scope from the user', () => {
      const req = mockRequest();
      const res = mockResponse();
      const user = {
        _id: { toString: () => 'user-123' },
        tenantId: { toString: () => 'tenantA' },
      };

      const result = setCloudFrontAuthCookies(req, res, user);

      expect(result).toBe(true);
      expect(setCloudFrontCookies).toHaveBeenCalledWith(
        res,
        {
          userId: 'user-123',
          tenantId: 'tenantA',
        },
        null,
      );
      expect(logger.debug).toHaveBeenCalledWith(
        '[setCloudFrontAuthCookies] CloudFront auth cookies refreshed',
        expect.objectContaining({
          attempted: true,
          set: true,
          has_user_id: true,
          has_tenant_scope: true,
        }),
      );
    });

    it('lets explicit scope options override user and request scope', () => {
      const req = mockRequest();
      req.user = { _id: 'request-user', tenantId: 'request-tenant' };
      const res = mockResponse();
      const user = { _id: 'user-123', tenantId: 'tenantA' };

      setCloudFrontAuthCookies(req, res, user, {
        userId: 'option-user',
        tenantId: 'option-tenant',
        storageRegion: 'us-east-2',
      });

      expect(setCloudFrontCookies).toHaveBeenCalledWith(
        res,
        {
          userId: 'option-user',
          tenantId: 'option-tenant',
          storageRegion: 'us-east-2',
        },
        null,
      );
    });

    it('falls back to request tenant scope when the user has none', () => {
      const req = mockRequest();
      req.user = { tenantId: 'request-tenant' };
      const res = mockResponse();

      setCloudFrontAuthCookies(req, res, { _id: 'user-123' });

      expect(setCloudFrontCookies).toHaveBeenCalledWith(
        res,
        {
          userId: 'user-123',
          tenantId: 'request-tenant',
        },
        null,
      );
    });

    it('uses org scope as tenant scope when tenantId is unavailable', () => {
      const req = mockRequest();
      const res = mockResponse();

      setCloudFrontAuthCookies(req, res, { _id: 'user-123', orgId: 'orgA' });

      expect(setCloudFrontCookies).toHaveBeenCalledWith(
        res,
        {
          userId: 'user-123',
          tenantId: 'orgA',
        },
        null,
      );
    });

    it('uses previous CloudFront scope for stale cookie cleanup', () => {
      parseCloudFrontCookieScope.mockReturnValue({ userId: 'old-user', tenantId: 'old-tenant' });
      const req = mockRequest({}, { 'LibreChat-CloudFront-Scope': 'encoded-scope' });
      const res = mockResponse();

      setCloudFrontAuthCookies(req, res, { _id: 'user-123', tenantId: 'tenantA' });

      expect(parseCloudFrontCookieScope).toHaveBeenCalledWith('encoded-scope');
      expect(setCloudFrontCookies).toHaveBeenCalledWith(
        res,
        {
          userId: 'user-123',
          tenantId: 'tenantA',
        },
        { userId: 'old-user', tenantId: 'old-tenant' },
      );
    });

    it('no-ops when CloudFront cookie signing is disabled', () => {
      getCloudFrontConfig.mockReturnValue({ ...cloudFrontCookieConfig, imageSigning: 'none' });
      const req = mockRequest();
      const res = mockResponse();

      const result = setCloudFrontAuthCookies(req, res, { _id: 'user-123' });

      expect(result).toBe(false);
      expect(setCloudFrontCookies).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        '[setCloudFrontAuthCookies] CloudFront auth cookies skipped',
        expect.objectContaining({
          attempted: false,
          set: false,
          reason: 'cloudfront_disabled',
        }),
      );
    });

    it('fails closed when user id is missing', () => {
      const req = mockRequest();
      const res = mockResponse();

      const result = setCloudFrontAuthCookies(req, res, { tenantId: 'tenantA' });

      expect(result).toBe(false);
      expect(setCloudFrontCookies).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        '[setCloudFrontAuthCookies] CloudFront auth cookies skipped',
        expect.objectContaining({
          attempted: false,
          set: false,
          reason: 'missing_user_id',
        }),
      );
    });

    it('skips when CloudFront cookie domain is missing', () => {
      getCloudFrontConfig.mockReturnValue({ ...cloudFrontCookieConfig, cookieDomain: null });
      const req = mockRequest();
      const res = mockResponse();

      const result = setCloudFrontAuthCookies(req, res, { _id: 'user-123' });

      expect(result).toBe(false);
      expect(setCloudFrontCookies).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        '[setCloudFrontAuthCookies] CloudFront auth cookies skipped',
        expect.objectContaining({
          attempted: false,
          set: false,
          reason: 'missing_cookie_domain',
        }),
      );
    });

    it('does not log cookie secrets or signed-cookie values', () => {
      const req = mockRequest();
      const res = mockResponse();

      setCloudFrontAuthCookies(req, res, { _id: 'user-123' });

      const debugOutput = JSON.stringify(logger.debug.mock.calls);
      expect(debugOutput).not.toContain('test-private-key');
      expect(debugOutput).not.toContain('K123ABC');
      expect(debugOutput).not.toContain('CloudFront-Policy');
      expect(debugOutput).not.toContain('CloudFront-Signature');
      expect(debugOutput).not.toContain('CloudFront-Key-Pair-Id');
    });
  });

  describe('setOpenIDAuthTokens', () => {
    const validTokenset = {
      id_token: 'the-id-token',
      access_token: 'the-access-token',
      refresh_token: 'the-refresh-token',
    };

    it('calls setCloudFrontCookies with response object and user scope from options', () => {
      const req = mockRequest();
      const res = mockResponse();

      setOpenIDAuthTokens(validTokenset, req, res, {
        userId: 'user-123',
        tenantId: 'tenantA',
      });

      expect(setCloudFrontCookies).toHaveBeenCalledWith(
        res,
        {
          userId: 'user-123',
          tenantId: 'tenantA',
        },
        null,
      );
    });

    it('keeps backward compatibility with positional user and tenant params', () => {
      const req = mockRequest();
      const res = mockResponse();

      setOpenIDAuthTokens(validTokenset, req, res, 'user-123', undefined, 'tenantA');

      expect(setCloudFrontCookies).toHaveBeenCalledWith(
        res,
        {
          userId: 'user-123',
          tenantId: 'tenantA',
        },
        null,
      );
    });

    it('treats a null options argument as an empty legacy user id', () => {
      const req = mockRequest();
      const res = mockResponse();

      const result = setOpenIDAuthTokens(validTokenset, req, res, null);

      expect(result).toBe('the-id-token');
      expect(setCloudFrontCookies).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        '[setCloudFrontAuthCookies] CloudFront auth cookies skipped',
        expect.objectContaining({
          attempted: false,
          set: false,
          reason: 'missing_user_id',
        }),
      );
    });

    it('treats omitted options as an empty legacy user id', () => {
      const req = mockRequest();
      const res = mockResponse();

      const result = setOpenIDAuthTokens(validTokenset, req, res);

      expect(result).toBe('the-id-token');
      expect(setCloudFrontCookies).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        '[setCloudFrontAuthCookies] CloudFront auth cookies skipped',
        expect.objectContaining({
          attempted: false,
          set: false,
          reason: 'missing_user_id',
        }),
      );
    });

    it('treats an object without token option keys as empty options', () => {
      const req = mockRequest();
      const res = mockResponse();

      const result = setOpenIDAuthTokens(validTokenset, req, res, {});

      expect(result).toBe('the-id-token');
      expect(setCloudFrontCookies).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        '[setCloudFrontAuthCookies] CloudFront auth cookies skipped',
        expect.objectContaining({
          attempted: false,
          set: false,
          reason: 'missing_user_id',
        }),
      );
    });

    it('succeeds even when setCloudFrontCookies returns false', () => {
      setCloudFrontCookies.mockReturnValue(false);

      const req = mockRequest();
      const res = mockResponse();

      const result = setOpenIDAuthTokens(validTokenset, req, res, 'user-123');

      expect(result).toBe('the-id-token');
    });
  });

  describe('setAuthTokens', () => {
    beforeEach(() => {
      getUserById.mockResolvedValue({ _id: 'user-123', tenantId: 'tenantA' });
      generateToken.mockResolvedValue('mock-access-token');
      generateRefreshToken.mockReturnValue('mock-refresh-token');
      createSession.mockResolvedValue({
        session: { expiration: new Date(Date.now() + 604800000) },
        refreshToken: 'mock-refresh-token',
      });
    });

    it('calls setCloudFrontCookies with response object and user scope', async () => {
      const res = mockResponse();

      await setAuthTokens('user-123', res);

      expect(setCloudFrontCookies).toHaveBeenCalledWith(
        res,
        {
          userId: 'user-123',
          tenantId: 'tenantA',
        },
        null,
      );
    });

    it('uses the fetched user id as the canonical CloudFront user scope', async () => {
      getUserById.mockResolvedValueOnce({
        _id: { toString: () => 'canonical-user' },
        tenantId: 'tenantA',
      });
      const res = mockResponse();

      await setAuthTokens('input-user-id', res);

      expect(setCloudFrontCookies).toHaveBeenCalledWith(
        res,
        {
          userId: 'canonical-user',
          tenantId: 'tenantA',
        },
        null,
      );
    });

    it('passes the previous CloudFront cookie scope when present', async () => {
      parseCloudFrontCookieScope.mockReturnValue({ userId: 'old-user', tenantId: 'old-tenant' });
      const res = mockResponse();
      const req = mockRequest({}, { 'LibreChat-CloudFront-Scope': 'encoded-scope' });

      await setAuthTokens('user-123', res, null, req);

      expect(parseCloudFrontCookieScope).toHaveBeenCalledWith('encoded-scope');
      expect(setCloudFrontCookies).toHaveBeenCalledWith(
        res,
        {
          userId: 'user-123',
          tenantId: 'tenantA',
        },
        { userId: 'old-user', tenantId: 'old-tenant' },
      );
    });

    it('succeeds even when setCloudFrontCookies returns false', async () => {
      setCloudFrontCookies.mockReturnValue(false);

      const res = mockResponse();

      const result = await setAuthTokens('user-123', res);

      expect(result).toBe('mock-access-token');
    });
  });
});
