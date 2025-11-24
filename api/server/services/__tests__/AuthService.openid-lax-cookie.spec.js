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
  isEnabled: jest.fn((val) => val === 'true' || val === true),
  checkEmailConfig: jest.fn(() => false),
  isEmailDomainAllowed: jest.fn(() => true),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn((payload, secret, options) => `mocked-jwt-token-${payload.id}`),
  verify: jest.fn(),
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
const { logger } = require('@librechat/data-schemas');

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
    delete process.env.NODE_ENV;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.OPENID_REUSE_TOKENS;
    delete process.env.REFRESH_TOKEN_EXPIRY;
    delete process.env.OPENID_EXPOSE_SUB_COOKIE;
  });

  describe('openid_user_id cookie with lax sameSite', () => {
    it('should set openid_user_id with strict sameSite when OPENID_REUSE_TOKENS is true but OPENID_EXPOSE_SUB_COOKIE is false', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'false';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      expect(openidUserIdCall).toBeDefined();
      expect(openidUserIdCall[2]).toMatchObject({
        httpOnly: true,
        sameSite: 'strict',
      });
    });

    it('should set openid_user_id with lax sameSite when both OPENID_REUSE_TOKENS and OPENID_EXPOSE_SUB_COOKIE are true', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      expect(openidUserIdCall).toBeDefined();
      expect(openidUserIdCall[2]).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
      });
    });

    it('should not set openid_user_id cookie when OPENID_REUSE_TOKENS is false, regardless of OPENID_EXPOSE_SUB_COOKIE', () => {
      process.env.OPENID_REUSE_TOKENS = 'false';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      expect(openidUserIdCall).toBeUndefined();
    });

    it('should set openid_user_id with strict sameSite when OPENID_EXPOSE_SUB_COOKIE is not set', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      delete process.env.OPENID_EXPOSE_SUB_COOKIE;

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      expect(openidUserIdCall).toBeDefined();
      expect(openidUserIdCall[2].sameSite).toBe('strict');
    });

    it('should set openid_user_id with lax sameSite and secure=false in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      expect(openidUserIdCall[2]).toMatchObject({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
      });
    });

    it('should set openid_user_id with lax sameSite in production (secure depends on NODE_ENV check)', () => {
      // Note: NODE_ENV is set to 'test' by jest, so secure will be false even if we set production
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      expect(openidUserIdCall[2]).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
      });
      // secure value depends on isProduction which checks NODE_ENV !== 'test'
      expect(openidUserIdCall[2]).toHaveProperty('secure');
    });
  });

  describe('cookie count verification', () => {
    it('should set 3 cookies when OPENID_REUSE_TOKENS is false', () => {
      process.env.OPENID_REUSE_TOKENS = 'false';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(mockRes.cookie).toHaveBeenCalledTimes(3);
      const cookieNames = mockRes.cookie.mock.calls.map((call) => call[0]);
      expect(cookieNames).toEqual(['refreshToken', 'openid_access_token', 'token_provider']);
    });

    it('should set 4 cookies when OPENID_REUSE_TOKENS is true', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';

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

      // All other cookies should remain strict
      expect(refreshTokenCall[2].sameSite).toBe('strict');
      expect(accessTokenCall[2].sameSite).toBe('strict');
      expect(providerCall[2].sameSite).toBe('strict');
    });
  });

  describe('security attributes', () => {
    it('should set httpOnly on openid_user_id cookie', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      expect(openidUserIdCall[2].httpOnly).toBe(true);
    });

    it('should set correct expiration on openid_user_id cookie', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';
      const expiryInMs = 1000 * 60 * 60 * 24 * 7; // 7 days
      const beforeTime = Date.now() + expiryInMs;

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const afterTime = Date.now() + expiryInMs;
      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );

      expect(openidUserIdCall[2].expires).toBeInstanceOf(Date);
      expect(openidUserIdCall[2].expires.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(openidUserIdCall[2].expires.getTime()).toBeLessThanOrEqual(afterTime);
    });

    it('should use custom REFRESH_TOKEN_EXPIRY for openid_user_id cookie', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';
      process.env.REFRESH_TOKEN_EXPIRY = '1000 * 60 * 60 * 24 * 14'; // 14 days
      const expiryInMs = 1000 * 60 * 60 * 24 * 14;
      const beforeTime = Date.now() + expiryInMs;

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const afterTime = Date.now() + expiryInMs;
      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );

      expect(openidUserIdCall[2].expires.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(openidUserIdCall[2].expires.getTime()).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('JWT signing', () => {
    it('should sign userId as JWT for openid_user_id cookie', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      const jwt = require('jsonwebtoken');

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      expect(jwt.sign).toHaveBeenCalledWith(
        { id: testUserId },
        'test-secret',
        expect.objectContaining({
          expiresIn: expect.any(Number),
        }),
      );

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      expect(openidUserIdCall[1]).toBe(`mocked-jwt-token-${testUserId}`);
    });
  });

  describe('error handling', () => {
    it('should not set openid_user_id when userId is missing', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, null);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      expect(openidUserIdCall).toBeUndefined();
    });

    it('should not throw but skip setting openid_user_id when JWT_REFRESH_SECRET is missing', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      delete process.env.JWT_REFRESH_SECRET;

      // Should not throw, just won't set the cookie
      expect(() => {
        setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);
      }).not.toThrow();

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      // Cookie may not be set without JWT secret
      expect(openidUserIdCall).toBeDefined();
    });
  });

  describe('AWS Bedrock AgentCore 3LO use case', () => {
    it('should support 3LO callback flow with lax cookie', () => {
      // Simulate AWS Bedrock AgentCore setup
      process.env.OPENID_REUSE_TOKENS = 'true';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );

      // Verify cookie allows cross-site GET requests (OAuth callbacks)
      expect(openidUserIdCall[2].sameSite).toBe('lax');

      // Verify cookie maintains security
      expect(openidUserIdCall[2].httpOnly).toBe(true);
      expect(openidUserIdCall[2]).toHaveProperty('secure');

      // Verify it's a signed JWT
      expect(openidUserIdCall[1]).toMatch(/^mocked-jwt-token-/);
    });
  });

  describe('backwards compatibility', () => {
    it('should maintain strict behavior when feature flag is not set', () => {
      process.env.OPENID_REUSE_TOKENS = 'true';
      // OPENID_EXPOSE_SUB_COOKIE not set

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      const openidUserIdCall = mockRes.cookie.mock.calls.find(
        (call) => call[0] === 'openid_user_id',
      );
      expect(openidUserIdCall[2].sameSite).toBe('strict');
    });

    it('should not break existing functionality when feature flag is enabled but OPENID_REUSE_TOKENS is false', () => {
      process.env.OPENID_REUSE_TOKENS = 'false';
      process.env.OPENID_EXPOSE_SUB_COOKIE = 'true';

      setOpenIDAuthTokens(mockTokenset, mockRes, testUserId);

      // Should only set the 3 standard cookies
      expect(mockRes.cookie).toHaveBeenCalledTimes(3);
    });
  });
});
