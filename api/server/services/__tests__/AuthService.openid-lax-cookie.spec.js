// Mock dependencies before requiring AuthService
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
  hashToken: jest.fn((token) => `hashed-${token}`),
  createMethods: jest.fn(() => ({})),
}));

jest.mock('librechat-data-provider', () => ({
  ErrorTypes: {
    AUTH_FAILED: 'AUTH_FAILED',
  },
  SystemRoles: {
    ADMIN: 'ADMIN',
    USER: 'USER',
  },
  EModelEndpoint: {
    azureOpenAI: 'azureOpenAI',
    openAI: 'openAI',
    agents: 'agents',
    custom: 'custom',
  },
  errorsToString: jest.fn(),
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
      return { sub: 'cognito-sub-12345' };
    }
    if (token === 'token-without-sub') {
      return { sub: null, error: 'No sub claim in access token' };
    }
    if (token === 'invalid-token') {
      return { sub: null, error: 'Failed to decode access token' };
    }
    return { sub: 'default-sub-claim' };
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
  decode: jest.fn((token) => {
    if (token === 'test-access-token') {
      return { sub: 'cognito-sub-12345', aud: 'test-client-id' };
    }
    return null;
  }),
}));

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

describe('setOpenIDAuthTokens - OPENID_EXPOSE_SUB_COOKIE feature', () => {
  let mockRes;
  let mockTokenset;
  const testUserId = 'test-user-id-12345';

  beforeEach(() => {
    mockRes = {
      cookie: jest.fn(),
    };

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
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original NODE_ENV value
    if (process.env._ORIGINAL_NODE_ENV) {
      process.env.NODE_ENV = process.env._ORIGINAL_NODE_ENV;
      delete process.env._ORIGINAL_NODE_ENV;
    } else {
      delete process.env.NODE_ENV;
    }
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.OPENID_REUSE_TOKENS;
    delete process.env.REFRESH_TOKEN_EXPIRY;
    delete process.env.OPENID_EXPOSE_SUB_COOKIE;
  });

  describe('cookie count verification', () => {
    it('should set 3 cookies when OPENID_REUSE_TOKENS is false and OPENID_EXPOSE_SUB_COOKIE is false', () => {
      process.env.OPENID_REUSE_TOKENS = 'false';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'false';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(mockRes.cookie).toHaveBeenCalledTimes(3);
      const cookieNames = mockRes.cookie.mock.calls.map((call) => call[0]);
      expect(cookieNames).toEqual(['refreshToken', 'openid_access_token', 'token_provider']);
    });

    it('should set 4 cookies when OPENID_REUSE_TOKENS is true and OPENID_EXPOSE_SUB_COOKIE is false', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'false';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(mockRes.cookie).toHaveBeenCalledTimes(4);
      const cookieNames = mockRes.cookie.mock.calls.map((call) => call[0]);
      expect(cookieNames).toEqual([
        'refreshToken',
        'openid_access_token',
        'token_provider',
        'openid_user_id',
      ]);
    });

    it('should set 5 cookies when both OPENID_REUSE_TOKENS and OPENID_EXPOSE_SUB_COOKIE are true', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(mockRes.cookie).toHaveBeenCalledTimes(5);
      const cookieNames = mockRes.cookie.mock.calls.map((call) => call[0]);
      expect(cookieNames).toEqual([
        'refreshToken',
        'openid_access_token',
        'token_provider',
        'openid_user_id',
        'openid_sub',
      ]);
    });

    it('should set 4 cookies when OPENID_EXPOSE_SUB_COOKIE is true but OPENID_REUSE_TOKENS is false', () => {
      process.env.OPENID_REUSE_TOKENS = 'false';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(mockRes.cookie).toHaveBeenCalledTimes(4);
      const cookieNames = mockRes.cookie.mock.calls.map((call) => call[0]);
      expect(cookieNames).toEqual([
        'refreshToken',
        'openid_access_token',
        'token_provider',
        'openid_sub',
      ]);
    });
  });

  describe('other cookies remain strict', () => {
    it('should keep all other cookies with strict sameSite when OPENID_EXPOSE_SUB_COOKIE is true', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const refreshTokenCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'refreshToken');
      const accessTokenCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_access_token',
      );
      const providerCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'token_provider');
      const userIdCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_user_id');

      // All other cookies should remain strict
      expect(refreshTokenCall[2].sameSite).toBe('strict');
      expect(accessTokenCall[2].sameSite).toBe('strict');
      expect(providerCall[2].sameSite).toBe('strict');
      expect(userIdCall[2].sameSite).toBe('strict');
    });
  });

  describe('openid_sub cookie for Cognito sub claim', () => {
    it('should create JWT-signed openid_sub cookie when OPENID_EXPOSE_SUB_COOKIE is true', () => {
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');
      expect(openidSubCall).toBeDefined();
      expect(openidSubCall[1]).toBe('mocked-jwt-token-cognito-sub-12345'); // JWT-signed
      expect(openidSubCall[2]).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
      });
    });

    it('should not create openid_sub cookie when OPENID_EXPOSE_SUB_COOKIE is false', () => {
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'false';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');
      expect(openidSubCall).toBeUndefined();
    });

    it('should sign the Cognito sub claim with JWT_REFRESH_SECRET', () => {
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';
      const jwt = require('jsonwebtoken');

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(jwt.sign).toHaveBeenCalledWith(
        { sub: 'cognito-sub-12345' },
        'test-secret',
        expect.objectContaining({
          expiresIn: expect.any(Number),
        }),
      );
    });

    it('should set correct expiration on openid_sub cookie', () => {
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';
      const expiryInMs = 1000 * 60 * 60 * 24 * 7; // 7 days
      const beforeTime = Date.now() + expiryInMs;

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const afterTime = Date.now() + expiryInMs;
      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');

      expect(openidSubCall[2].expires).toBeInstanceOf(Date);
      expect(openidSubCall[2].expires.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(openidSubCall[2].expires.getTime()).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('AWS Bedrock AgentCore 3LO use case', () => {
    it('should support 3LO callback flow with JWT-signed lax openid_sub cookie', () => {
      // Simulate AWS Bedrock AgentCore setup
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');

      // Verify cookie allows cross-site GET requests (OAuth callbacks)
      expect(openidSubCall[2].sameSite).toBe('lax');

      // Verify cookie maintains security
      expect(openidSubCall[2].httpOnly).toBe(true);
      expect(openidSubCall[2]).toHaveProperty('secure');

      // Verify it's JWT-signed for verification in callback service
      expect(openidSubCall[1]).toMatch(/^mocked-jwt-token-/);
    });
  });

  describe('backwards compatibility', () => {
    it('should not create openid_sub cookie when feature flag is not set', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      // OPENID_EXPOSE_SUB_COOKIE not set

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');
      expect(openidSubCall).toBeUndefined();
    });

    it('should not break existing functionality when feature flag is enabled but OPENID_REUSE_TOKENS is false', () => {
      process.env.OPENID_REUSE_TOKENS = 'false';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      // Should set 4 cookies: 3 standard + openid_sub
      expect(mockRes.cookie).toHaveBeenCalledTimes(4);
      const cookieNames = mockRes.cookie.mock.calls.map((call) => call[0]);
      expect(cookieNames).toEqual([
        'refreshToken',
        'openid_access_token',
        'token_provider',
        'openid_sub',
      ]);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle missing JWT_REFRESH_SECRET gracefully', () => {
      const { logger } = require('@librechat/data-schemas');
      delete process.env.JWT_REFRESH_SECRET;
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');
      expect(openidSubCall).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('JWT_REFRESH_SECRET not configured'),
      );
    });

    it('should not create openid_sub cookie when access token has no sub claim', () => {
      const { extractSubFromAccessToken } = require('@librechat/api');
      extractSubFromAccessToken.mockReturnValueOnce({
        sub: null,
        error: 'No sub claim in access token',
      });

      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';
      mockTokenset.access_token = 'token-without-sub';
      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');
      expect(openidSubCall).toBeUndefined();
    });

    it('should not create openid_sub cookie when extractSubFromAccessToken returns null', () => {
      const { extractSubFromAccessToken } = require('@librechat/api');
      extractSubFromAccessToken.mockReturnValueOnce({
        sub: null,
        error: 'Invalid JWT format',
      });

      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';
      mockTokenset.access_token = 'invalid-token';
      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');
      expect(openidSubCall).toBeUndefined();
    });

    it('should handle decode errors gracefully', () => {
      const { extractSubFromAccessToken } = require('@librechat/api');
      extractSubFromAccessToken.mockReturnValueOnce({
        sub: null,
        error: 'Failed to decode access token',
      });

      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';
      mockTokenset.access_token = 'invalid-token';
      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidSubCall = mockRes.cookie.mock.calls.find((call) => call[0] === 'openid_sub');
      expect(openidSubCall).toBeUndefined();
    });
  });
});
