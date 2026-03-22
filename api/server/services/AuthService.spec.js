const MOCKS = {
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
  DEFAULT_SESSION_EXPIRY: 900000,
  DEFAULT_REFRESH_TOKEN_EXPIRY: 604800000,
};

jest.mock('@librechat/data-schemas', () => MOCKS);
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

const { shouldUseSecureCookie } = require('@librechat/api');
const { setOpenIDAuthTokens } = require('./AuthService');

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

function mockRequest(sessionData = {}) {
  return {
    session: { openidTokens: null, ...sessionData },
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
      expect(req.session.openidTokens.refreshToken).toBe('the-refresh-token');
    });
  });

  describe('cookie secure flag', () => {
    it('should set secure: false when shouldUseSecureCookie returns false (default)', () => {
      const tokenset = {
        id_token: 'the-id-token',
        access_token: 'the-access-token',
        refresh_token: 'the-refresh-token',
      };
      const req = mockRequest();
      const res = mockResponse();

      setOpenIDAuthTokens(tokenset, req, res, 'user-123');

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

  describe('no-session fallback', () => {
    it('should not set refreshToken cookie twice when session is null', () => {
      const tokenset = {
        id_token: 'the-id-token',
        access_token: 'the-access-token',
        refresh_token: 'the-refresh-token',
      };
      const req = { session: null };
      const res = mockResponse();

      setOpenIDAuthTokens(tokenset, req, res, 'user-123');

      const refreshTokenCalls = res.cookie.mock.calls.filter(([name]) => name === 'refreshToken');
      expect(refreshTokenCalls).toHaveLength(1);
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

describe('COOKIE_DOMAIN configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv, JWT_REFRESH_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function loadAuthService() {
    return require('./AuthService');
  }

  describe('DOMAIN_REGEX validation', () => {
    it('should accept a standard domain', () => {
      process.env.COOKIE_DOMAIN = 'example.com';
      const { COOKIE_DOMAIN } = loadAuthService();
      expect(COOKIE_DOMAIN).toBe('example.com');
    });

    it('should accept a subdomain', () => {
      process.env.COOKIE_DOMAIN = 'app.example.com';
      const { COOKIE_DOMAIN } = loadAuthService();
      expect(COOKIE_DOMAIN).toBe('app.example.com');
    });

    it('should accept a leading-dot domain', () => {
      process.env.COOKIE_DOMAIN = '.example.com';
      const { COOKIE_DOMAIN } = loadAuthService();
      expect(COOKIE_DOMAIN).toBe('.example.com');
    });

    it('should accept a leading-dot subdomain', () => {
      process.env.COOKIE_DOMAIN = '.app.example.com';
      const { COOKIE_DOMAIN } = loadAuthService();
      expect(COOKIE_DOMAIN).toBe('.app.example.com');
    });

    it('should reject a domain with leading hyphen in label', () => {
      process.env.COOKIE_DOMAIN = '-bad.example.com';
      const { COOKIE_DOMAIN } = loadAuthService();
      expect(COOKIE_DOMAIN).toBe('');
    });

    it('should reject a domain with trailing hyphen in label', () => {
      process.env.COOKIE_DOMAIN = 'bad-.example.com';
      const { COOKIE_DOMAIN } = loadAuthService();
      expect(COOKIE_DOMAIN).toBe('');
    });

    it('should reject whitespace input', () => {
      process.env.COOKIE_DOMAIN = 'not a domain';
      const { COOKIE_DOMAIN } = loadAuthService();
      expect(COOKIE_DOMAIN).toBe('');
    });

    it('should return empty string when COOKIE_DOMAIN is unset', () => {
      delete process.env.COOKIE_DOMAIN;
      const { COOKIE_DOMAIN } = loadAuthService();
      expect(COOKIE_DOMAIN).toBe('');
    });

    it('should return empty string when COOKIE_DOMAIN is empty', () => {
      process.env.COOKIE_DOMAIN = '';
      const { COOKIE_DOMAIN } = loadAuthService();
      expect(COOKIE_DOMAIN).toBe('');
    });
  });

  describe('SAME_SITE_POLICY', () => {
    it('should be "lax" when COOKIE_DOMAIN starts with dot', () => {
      process.env.COOKIE_DOMAIN = '.example.com';
      const { SAME_SITE_POLICY } = loadAuthService();
      expect(SAME_SITE_POLICY).toBe('lax');
    });

    it('should be "strict" when COOKIE_DOMAIN does not start with dot', () => {
      process.env.COOKIE_DOMAIN = 'example.com';
      const { SAME_SITE_POLICY } = loadAuthService();
      expect(SAME_SITE_POLICY).toBe('strict');
    });

    it('should be "strict" when COOKIE_DOMAIN is empty', () => {
      delete process.env.COOKIE_DOMAIN;
      const { SAME_SITE_POLICY } = loadAuthService();
      expect(SAME_SITE_POLICY).toBe('strict');
    });
  });

  describe('buildCookieOptions', () => {
    it('should include domain when COOKIE_DOMAIN is set', () => {
      process.env.COOKIE_DOMAIN = 'example.com';
      const { buildCookieOptions } = loadAuthService();
      const opts = buildCookieOptions(Date.now() + 60000);
      expect(opts.domain).toBe('example.com');
      expect(opts.sameSite).toBe('strict');
      expect(opts.httpOnly).toBe(true);
      expect(opts.secure).toBe(false);
    });

    it('should omit domain when COOKIE_DOMAIN is unset', () => {
      delete process.env.COOKIE_DOMAIN;
      const { buildCookieOptions } = loadAuthService();
      const opts = buildCookieOptions(Date.now() + 60000);
      expect(opts).not.toHaveProperty('domain');
      expect(opts.sameSite).toBe('strict');
      expect(opts.secure).toBe(false);
    });

    it('should use sameSite lax for leading-dot domain', () => {
      process.env.COOKIE_DOMAIN = '.example.com';
      const { buildCookieOptions } = loadAuthService();
      const opts = buildCookieOptions(Date.now() + 60000);
      expect(opts.domain).toBe('.example.com');
      expect(opts.sameSite).toBe('lax');
      expect(opts.secure).toBe(false);
    });

    it('should set expires as a Date object', () => {
      delete process.env.COOKIE_DOMAIN;
      const { buildCookieOptions } = loadAuthService();
      const ts = Date.now() + 60000;
      const opts = buildCookieOptions(ts);
      expect(opts.expires).toBeInstanceOf(Date);
      expect(opts.expires.getTime()).toBe(ts);
    });
  });

  describe('setAuthTokens with COOKIE_DOMAIN', () => {
    it('should set cookies with domain when COOKIE_DOMAIN is configured', async () => {
      process.env.COOKIE_DOMAIN = 'example.com';
      process.env.OPENID_REUSE_TOKENS = 'false';
      const { createSession, getUserById, generateToken } = require('~/models');
      createSession.mockResolvedValue({
        session: { _id: 'sess-1', expiration: new Date(Date.now() + 604800000) },
        refreshToken: 'rt-123',
      });
      getUserById.mockResolvedValue({ _id: 'user-1', name: 'Test' });
      generateToken.mockResolvedValue('jwt-token');

      const { setAuthTokens } = loadAuthService();
      const res = mockResponse();
      await setAuthTokens('user-1', res);

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'rt-123',
        expect.objectContaining({ domain: 'example.com', sameSite: 'strict' }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'token_provider',
        'librechat',
        expect.objectContaining({ domain: 'example.com', sameSite: 'strict' }),
      );
    });

    it('should set cookies without domain when COOKIE_DOMAIN is unset', async () => {
      delete process.env.COOKIE_DOMAIN;
      const { createSession, getUserById, generateToken } = require('~/models');
      createSession.mockResolvedValue({
        session: { _id: 'sess-1', expiration: new Date(Date.now() + 604800000) },
        refreshToken: 'rt-123',
      });
      getUserById.mockResolvedValue({ _id: 'user-1', name: 'Test' });
      generateToken.mockResolvedValue('jwt-token');

      const { setAuthTokens } = loadAuthService();
      const res = mockResponse();
      await setAuthTokens('user-1', res);

      const refreshCookieCall = res.cookie.mock.calls.find(([name]) => name === 'refreshToken');
      expect(refreshCookieCall[2]).not.toHaveProperty('domain');
    });
  });
});
