jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
  hashToken: jest.fn((token) => `hashed-${token}`),
  createMethods: jest.fn(() => ({})),
  DEFAULT_REFRESH_TOKEN_EXPIRY: 1000 * 60 * 60 * 24 * 7, // 7 days in milliseconds
  DEFAULT_SESSION_EXPIRY: 1000 * 60 * 15, // 15 minutes in milliseconds
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  checkEmailConfig: jest.fn(() => false),
  isEmailDomainAllowed: jest.fn(() => true),
  extractSubFromAccessToken: jest.fn((token) => {
    if (!token) {
      return { sub: null, error: 'No access token provided' };
    }
    if (token === 'test-access-token') {
      return { sub: 'openid-provider-sub-67890' };
    }
    if (token === 'token-without-sub') {
      return { sub: null, error: 'No sub claim in access token' };
    }
    if (token === 'invalid-token') {
      return { sub: null, error: 'Failed to decode access token' };
    }
    return { sub: 'openid-provider-sub-67890' };
  }),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn((payload, secret, options) => {
    if (payload.id) {
      return `mocked-jwt-token-${payload.id}`;
    }
    if (payload.sub) {
      return `mocked-jwt-token-${payload.sub}`;
    }
    return 'mocked-jwt-token';
  }),
  verify: jest.fn(),
}));

jest.mock('jsonwebtoken/decode', () =>
  jest.fn((token) => ({
    sub: 'openid-provider-sub-67890',
    email: 'test@example.com',
    name: 'Test User',
  })),
);

jest.mock('bcryptjs', () => ({
  genSaltSync: jest.fn(() => 'mock-salt'),
  hashSync: jest.fn((password) => `hashed-${password}`),
  compareSync: jest.fn(() => true),
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

jest.mock('~/strategies/validators', () => ({
  registerSchema: {
    safeParse: jest.fn(() => ({ error: null })),
  },
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(() => Promise.resolve({})),
}));

jest.mock('~/server/utils', () => ({
  sendEmail: jest.fn(() => Promise.resolve()),
}));

const { setOpenIDAuthTokens } = require('../AuthService');
const { logger } = require('@librechat/data-schemas');

describe('setOpenIDAuthTokens - openid_sub cookie functionality', () => {
  let mockRes;
  let mockTokenset;
  const testUserId = 'test-user-id-12345';
  const testOpenIdSub = 'openid-provider-sub-67890';

  beforeEach(() => {
    mockRes = {
      cookie: jest.fn(),
    };

    // Mock jwt.decode to return decoded token with sub claim
    const jwtDecode = require('jsonwebtoken/decode');
    jwtDecode.mockReturnValue({
      sub: testOpenIdSub,
      email: 'test@example.com',
      name: 'Test User',
    });

    mockTokenset = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      id_token: 'test-id-token',
    };

    // Reset NODE_ENV to production for secure cookies
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    // Store original value to restore later
    process.env._ORIGINAL_NODE_ENV = originalEnv;
    process.env.JWT_REFRESH_SECRET = 'test-secret';
    // Enable feature flag by default
    process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.OPENID_REUSE_TOKENS;
    delete process.env.REFRESH_TOKEN_EXPIRY;
    delete process.env.OPENID_EXPOSE_SUB_COOKIE;
  });

  describe('openid_sub cookie setting', () => {
    it('should set openid_sub cookie with lax sameSite when access token contains sub', () => {
      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeDefined();
      expect(openidSubCookieCall[1]).toBe(`mocked-jwt-token-${testOpenIdSub}`);
      expect(openidSubCookieCall[2]).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
      });
      // Verify secure flag exists (value depends on NODE_ENV)
      expect(openidSubCookieCall[2]).toHaveProperty('secure');
      expect(typeof openidSubCookieCall[2].secure).toBe('boolean');
    });

    it('should not set openid_sub cookie when access token has no sub claim', () => {
      const { extractSubFromAccessToken } = require('@librechat/api');
      extractSubFromAccessToken.mockReturnValueOnce({ sub: null, error: 'No sub claim' });

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeUndefined();
    });

    it('should not set openid_sub cookie when jwt decode returns null', () => {
      const { extractSubFromAccessToken } = require('@librechat/api');
      extractSubFromAccessToken.mockReturnValueOnce({ sub: null, error: 'Decode error' });

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeUndefined();
    });

    it('should set openid_sub cookie with secure=false in non-production environment', () => {
      process.env.NODE_ENV = 'development';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeDefined();
      expect(openidSubCookieCall[2]).toMatchObject({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
      });
    });

    it('should set openid_sub cookie with correct expiration date', () => {
      const expiryInMs = 1000 * 60 * 60 * 24 * 7; // 7 days
      const beforeTime = Date.now() + expiryInMs;

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const afterTime = Date.now() + expiryInMs;
      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );

      expect(openidSubCookieCall[2].expires).toBeInstanceOf(Date);
      expect(openidSubCookieCall[2].expires.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(openidSubCookieCall[2].expires.getTime()).toBeLessThanOrEqual(afterTime);
    });

    it('should use custom REFRESH_TOKEN_EXPIRY for openid_sub cookie expiration', () => {
      process.env.REFRESH_TOKEN_EXPIRY = '1000 * 60 * 60 * 24 * 14'; // 14 days
      const expiryInMs = 1000 * 60 * 60 * 24 * 14;
      const beforeTime = Date.now() + expiryInMs;

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const afterTime = Date.now() + expiryInMs;
      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );

      expect(openidSubCookieCall[2].expires.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(openidSubCookieCall[2].expires.getTime()).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('openid_sub cookie with other cookies', () => {
    it('should set all cookies including openid_sub', () => {
      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(mockRes.cookie).toHaveBeenCalledTimes(4);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(String),
        expect.any(Object),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'openid_access_token',
        expect.any(String),
        expect.any(Object),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('token_provider', 'openid', expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'openid_sub',
        `mocked-jwt-token-${testOpenIdSub}`,
        expect.any(Object),
      );
    });

    it('should set openid_user_id and openid_sub when OPENID_REUSE_TOKENS is enabled', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(mockRes.cookie).toHaveBeenCalledTimes(5);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'openid_user_id',
        expect.any(String),
        expect.any(Object),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'openid_sub',
        `mocked-jwt-token-${testOpenIdSub}`,
        expect.any(Object),
      );

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');

      // openid_user_id uses strict sameSite
      expect(openidUserIdCall[2].sameSite).toBe('strict');
      // openid_sub uses lax sameSite
      expect(openidSubCall[2].sameSite).toBe('lax');
    });

    it('should set 3 cookies when access token has no sub claim', () => {
      const { extractSubFromAccessToken } = require('@librechat/api');
      extractSubFromAccessToken.mockReturnValueOnce({ sub: null, error: 'No sub claim' });

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(mockRes.cookie).toHaveBeenCalledTimes(3);
      const cookieNames = mockRes.cookie.mock.calls.map((call) => call[0]);
      expect(cookieNames).toEqual(['refreshToken', 'openid_access_token', 'token_provider']);
    });
  });

  describe('openid_sub cookie security', () => {
    it('should set httpOnly flag on openid_sub cookie', () => {
      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall[2].httpOnly).toBe(true);
    });

    it('should set sameSite to lax (not strict) on openid_sub cookie', () => {
      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall[2].sameSite).toBe('lax');
      expect(openidSubCookieCall[2].sameSite).not.toBe('strict');
    });

    it('should verify other cookies still use strict sameSite', () => {
      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const refreshTokenCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'refreshToken');
      const accessTokenCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_access_token',
      );
      const providerCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'token_provider');

      expect(refreshTokenCall[2].sameSite).toBe('strict');
      expect(accessTokenCall[2].sameSite).toBe('strict');
      expect(providerCall[2].sameSite).toBe('strict');
    });
  });

  describe('error handling', () => {
    it('should not throw error when userId is provided but tokenset is invalid', () => {
      expect(() => {
        setOpenIDAuthTokens(null, mockRes, testUserId);
      }).not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        '[setOpenIDAuthTokens] No tokenset found in request',
      );
    });

    it('should not set openid_sub cookie when tokenset is missing access_token', () => {
      const invalidTokenset = {
        refresh_token: 'test-refresh-token',
      };

      setOpenIDAuthTokens(invalidTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeUndefined();
    });

    it('should not set openid_sub cookie when refresh_token is missing', () => {
      const invalidTokenset = {
        access_token: 'test-access-token',
      };

      setOpenIDAuthTokens(invalidTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeUndefined();
    });

    it('should handle error during cookie setting gracefully', () => {
      mockRes.cookie = jest.fn(() => {
        throw new Error('Cookie setting failed');
      });

      expect(() => {
        setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);
      }).toThrow('Cookie setting failed');

      expect(logger.error).toHaveBeenCalledWith(
        '[setOpenIDAuthTokens] Error in setting authentication tokens:',
        expect.any(Error),
      );
    });

    it('should handle jwt decode throwing an error', () => {
      const { extractSubFromAccessToken } = require('@librechat/api');
      extractSubFromAccessToken.mockReturnValueOnce({ sub: null, error: 'Invalid JWT' });

      // Should not throw, just skip setting openid_sub cookie
      expect(() => {
        setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);
      }).not.toThrow();

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeUndefined();
    });
  });

  describe('integration with existing refresh token', () => {
    it('should set openid_sub cookie when using existingRefreshToken', () => {
      const tokensetWithoutRefresh = {
        access_token: 'test-access-token',
      };
      const existingRefreshToken = 'existing-refresh-token';

      setOpenIDAuthTokens(tokensetWithoutRefresh, mockRes, testUserId, existingRefreshToken);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeDefined();
      expect(openidSubCookieCall[1]).toBe(`mocked-jwt-token-${testOpenIdSub}`);
    });

    it('should prefer tokenset refresh_token over existingRefreshToken', () => {
      const existingRefreshToken = 'existing-refresh-token';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId, existingRefreshToken);

      const refreshTokenCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'refreshToken');
      expect(refreshTokenCall[1]).toBe(mockTokenset.refresh_token);
      expect(refreshTokenCall[1]).not.toBe(existingRefreshToken);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeDefined();
    });
  });

  describe('feature flag behavior', () => {
    it('should not set openid_sub cookie when OPENID_EXPOSE_SUB_COOKIE is false', () => {
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'false';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeUndefined();

      // Other cookies should still be set
      expect(mockRes.cookie).toHaveBeenCalledTimes(3);
      const cookieNames = mockRes.cookie.mock.calls.map((call) => call[0]);
      expect(cookieNames).toEqual(['refreshToken', 'openid_access_token', 'token_provider']);
    });

    it('should not set openid_sub cookie when OPENID_EXPOSE_SUB_COOKIE is not set', () => {
      delete process.env.OPENID_EXPOSE_SUB_COOKIE;

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeUndefined();

      // Other cookies should still be set
      expect(mockRes.cookie).toHaveBeenCalledTimes(3);
    });

    it('should set openid_sub cookie when OPENID_EXPOSE_SUB_COOKIE is true', () => {
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCookieCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_sub',
      );
      expect(openidSubCookieCall).toBeDefined();
      expect(openidSubCookieCall[1]).toBe(`mocked-jwt-token-${testOpenIdSub}`);
    });

    it('should set openid_sub cookie with OPENID_REUSE_TOKENS and OPENID_EXPOSE_SUB_COOKIE both enabled', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(mockRes.cookie).toHaveBeenCalledTimes(5);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');

      expect(openidUserIdCall).toBeDefined();
      expect(openidSubCall).toBeDefined();

      // openid_user_id uses strict sameSite
      expect(openidUserIdCall[2].sameSite).toBe('strict');
      // openid_sub uses lax sameSite
      expect(openidSubCall[2].sameSite).toBe('lax');
    });
  });
});
