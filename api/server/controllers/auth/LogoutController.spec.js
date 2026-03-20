const cookies = require('cookie');

const mockLogoutUser = jest.fn();
const mockLogger = { warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const mockIsEnabled = jest.fn();
const mockGetOpenIdConfig = jest.fn();

jest.mock('cookie');
jest.mock('@librechat/api', () => ({ isEnabled: (...args) => mockIsEnabled(...args) }));
jest.mock('@librechat/data-schemas', () => ({ logger: mockLogger }));
jest.mock('~/server/services/AuthService', () => ({
  logoutUser: (...args) => mockLogoutUser(...args),
}));
jest.mock('~/strategies', () => ({ getOpenIdConfig: () => mockGetOpenIdConfig() }));

const { logoutController } = require('./LogoutController');

function buildReq(overrides = {}) {
  return {
    user: { _id: 'user1', openidId: 'oid1', provider: 'openid' },
    headers: { cookie: 'refreshToken=rt1' },
    session: {
      openidTokens: { refreshToken: 'srt', idToken: 'small-id-token' },
      destroy: jest.fn(),
    },
    ...overrides,
  };
}

function buildRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    clearCookie: jest.fn(),
  };
  return res;
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    OPENID_USE_END_SESSION_ENDPOINT: 'true',
    OPENID_ISSUER: 'https://idp.example.com',
    OPENID_CLIENT_ID: 'my-client-id',
    DOMAIN_CLIENT: 'https://app.example.com',
  };
  cookies.parse.mockReturnValue({ refreshToken: 'cookie-rt' });
  mockLogoutUser.mockResolvedValue({ status: 200, message: 'Logout successful' });
  mockIsEnabled.mockReturnValue(true);
  mockGetOpenIdConfig.mockReturnValue({
    serverMetadata: () => ({
      end_session_endpoint: 'https://idp.example.com/logout',
    }),
  });
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('LogoutController', () => {
  describe('id_token_hint from session', () => {
    it('sets id_token_hint when session has idToken', async () => {
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('id_token_hint=small-id-token');
      expect(body.redirect).not.toContain('client_id=');
    });
  });

  describe('id_token_hint from cookie fallback', () => {
    it('uses cookie id_token when session has no tokens', async () => {
      cookies.parse.mockReturnValue({
        refreshToken: 'cookie-rt',
        openid_id_token: 'cookie-id-token',
      });
      const req = buildReq({ session: { destroy: jest.fn() } });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('id_token_hint=cookie-id-token');
    });
  });

  describe('client_id fallback', () => {
    it('falls back to client_id when no idToken is available', async () => {
      cookies.parse.mockReturnValue({ refreshToken: 'cookie-rt' });
      const req = buildReq({ session: { destroy: jest.fn() } });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('client_id=my-client-id');
      expect(body.redirect).not.toContain('id_token_hint=');
    });

    it('does not produce client_id=undefined when OPENID_CLIENT_ID is unset', async () => {
      delete process.env.OPENID_CLIENT_ID;
      cookies.parse.mockReturnValue({ refreshToken: 'cookie-rt' });
      const req = buildReq({ session: { destroy: jest.fn() } });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).not.toContain('client_id=');
      expect(body.redirect).not.toContain('undefined');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Neither id_token_hint nor OPENID_CLIENT_ID'),
      );
    });
  });

  describe('OPENID_USE_END_SESSION_ENDPOINT disabled', () => {
    it('does not include redirect when disabled', async () => {
      mockIsEnabled.mockReturnValue(false);
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toBeUndefined();
    });
  });

  describe('OPENID_ISSUER unset', () => {
    it('does not include redirect when OPENID_ISSUER is missing', async () => {
      delete process.env.OPENID_ISSUER;
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toBeUndefined();
    });
  });

  describe('non-OpenID user', () => {
    it('does not include redirect for non-OpenID users', async () => {
      const req = buildReq({
        user: { _id: 'user1', provider: 'local' },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toBeUndefined();
    });
  });

  describe('post_logout_redirect_uri', () => {
    it('uses OPENID_POST_LOGOUT_REDIRECT_URI when set', async () => {
      process.env.OPENID_POST_LOGOUT_REDIRECT_URI = 'https://custom.example.com/logged-out';
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      const url = new URL(body.redirect);
      expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
        'https://custom.example.com/logged-out',
      );
    });

    it('defaults to DOMAIN_CLIENT/login when OPENID_POST_LOGOUT_REDIRECT_URI is unset', async () => {
      delete process.env.OPENID_POST_LOGOUT_REDIRECT_URI;
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      const url = new URL(body.redirect);
      expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
        'https://app.example.com/login',
      );
    });
  });

  describe('OpenID config not available', () => {
    it('warns and returns no redirect when getOpenIdConfig throws', async () => {
      mockGetOpenIdConfig.mockImplementation(() => {
        throw new Error('OpenID configuration has not been initialized');
      });
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('OpenID config not available'),
        'OpenID configuration has not been initialized',
      );
    });
  });

  describe('end_session_endpoint not in metadata', () => {
    it('warns and returns no redirect when end_session_endpoint is missing', async () => {
      mockGetOpenIdConfig.mockReturnValue({
        serverMetadata: () => ({}),
      });
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('end_session_endpoint not found'),
      );
    });
  });

  describe('error handling', () => {
    it('returns 500 on logoutUser error', async () => {
      mockLogoutUser.mockRejectedValue(new Error('session error'));
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'session error' });
    });
  });

  describe('cookie clearing', () => {
    it('clears all auth cookies on successful logout', async () => {
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.clearCookie).toHaveBeenCalledWith('openid_access_token');
      expect(res.clearCookie).toHaveBeenCalledWith('openid_id_token');
      expect(res.clearCookie).toHaveBeenCalledWith('openid_user_id');
      expect(res.clearCookie).toHaveBeenCalledWith('token_provider');
    });
  });

  describe('URL length limit and logout_hint fallback', () => {
    it('uses logout_hint when id_token makes URL exceed default limit (2000 chars)', async () => {
      const longIdToken = 'a'.repeat(3000);
      const req = buildReq({
        user: { _id: 'user1', openidId: 'oid1', provider: 'openid', email: 'user@example.com' },
        session: {
          openidTokens: { refreshToken: 'srt', idToken: longIdToken },
          destroy: jest.fn(),
        },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).not.toContain('id_token_hint=');
      expect(body.redirect).toContain('logout_hint=user%40example.com');
      expect(body.redirect).toContain('client_id=my-client-id');
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Logout URL too long'));
    });

    it('uses id_token_hint when URL is within default limit', async () => {
      const shortIdToken = 'short-token';
      const req = buildReq({
        session: {
          openidTokens: { refreshToken: 'srt', idToken: shortIdToken },
          destroy: jest.fn(),
        },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('id_token_hint=short-token');
      expect(body.redirect).not.toContain('logout_hint=');
      expect(body.redirect).not.toContain('client_id=');
    });

    it('respects custom OPENID_MAX_LOGOUT_URL_LENGTH', async () => {
      process.env.OPENID_MAX_LOGOUT_URL_LENGTH = '500';
      const mediumIdToken = 'a'.repeat(600);
      const req = buildReq({
        user: { _id: 'user1', openidId: 'oid1', provider: 'openid', email: 'user@example.com' },
        session: {
          openidTokens: { refreshToken: 'srt', idToken: mediumIdToken },
          destroy: jest.fn(),
        },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).not.toContain('id_token_hint=');
      expect(body.redirect).toContain('logout_hint=user%40example.com');
    });

    it('uses username as logout_hint when email is not available', async () => {
      const longIdToken = 'a'.repeat(3000);
      const req = buildReq({
        user: {
          _id: 'user1',
          openidId: 'oid1',
          provider: 'openid',
          username: 'testuser',
        },
        session: {
          openidTokens: { refreshToken: 'srt', idToken: longIdToken },
          destroy: jest.fn(),
        },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('logout_hint=testuser');
    });

    it('uses openidId as logout_hint when email and username are not available', async () => {
      const longIdToken = 'a'.repeat(3000);
      const req = buildReq({
        user: { _id: 'user1', openidId: 'unique-oid-123', provider: 'openid' },
        session: {
          openidTokens: { refreshToken: 'srt', idToken: longIdToken },
          destroy: jest.fn(),
        },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('logout_hint=unique-oid-123');
    });

    it('uses openidId as logout_hint when email and username are explicitly null', async () => {
      const longIdToken = 'a'.repeat(3000);
      const req = buildReq({
        user: {
          _id: 'user1',
          openidId: 'oid-without-email',
          provider: 'openid',
          email: null,
          username: null,
        },
        session: {
          openidTokens: { refreshToken: 'srt', idToken: longIdToken },
          destroy: jest.fn(),
        },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).not.toContain('id_token_hint=');
      expect(body.redirect).toContain('logout_hint=oid-without-email');
      expect(body.redirect).toContain('client_id=my-client-id');
    });

    it('uses only client_id when absolutely no hint is available', async () => {
      const longIdToken = 'a'.repeat(3000);
      const req = buildReq({
        user: {
          _id: 'user1',
          openidId: '',
          provider: 'openid',
          email: '',
          username: '',
        },
        session: {
          openidTokens: { refreshToken: 'srt', idToken: longIdToken },
          destroy: jest.fn(),
        },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).not.toContain('id_token_hint=');
      expect(body.redirect).not.toContain('logout_hint=');
      expect(body.redirect).toContain('client_id=my-client-id');
    });

    it('warns about missing OPENID_CLIENT_ID when URL is too long', async () => {
      delete process.env.OPENID_CLIENT_ID;
      const longIdToken = 'a'.repeat(3000);
      const req = buildReq({
        user: { _id: 'user1', openidId: 'oid1', provider: 'openid', email: 'user@example.com' },
        session: {
          openidTokens: { refreshToken: 'srt', idToken: longIdToken },
          destroy: jest.fn(),
        },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).not.toContain('id_token_hint=');
      expect(body.redirect).toContain('logout_hint=');
      expect(body.redirect).not.toContain('client_id=');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('OPENID_CLIENT_ID is not set'),
      );
    });

    it('falls back to logout_hint for cookie-sourced long token', async () => {
      const longCookieToken = 'a'.repeat(3000);
      cookies.parse.mockReturnValue({
        refreshToken: 'cookie-rt',
        openid_id_token: longCookieToken,
      });
      const req = buildReq({
        user: { _id: 'user1', openidId: 'oid1', provider: 'openid', email: 'user@example.com' },
        session: { destroy: jest.fn() },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).not.toContain('id_token_hint=');
      expect(body.redirect).toContain('logout_hint=user%40example.com');
      expect(body.redirect).toContain('client_id=my-client-id');
    });

    it('keeps id_token_hint when projected URL length equals the max', async () => {
      const baseUrl = new URL('https://idp.example.com/logout');
      baseUrl.searchParams.set('post_logout_redirect_uri', 'https://app.example.com/login');
      const baseLength = baseUrl.toString().length;
      const tokenLength = 2000 - baseLength - '&id_token_hint='.length;
      const exactToken = 'a'.repeat(tokenLength);

      const req = buildReq({
        session: {
          openidTokens: { refreshToken: 'srt', idToken: exactToken },
          destroy: jest.fn(),
        },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('id_token_hint=');
      expect(body.redirect).not.toContain('logout_hint=');
    });

    it('falls back to logout_hint when projected URL is one char over the max', async () => {
      const baseUrl = new URL('https://idp.example.com/logout');
      baseUrl.searchParams.set('post_logout_redirect_uri', 'https://app.example.com/login');
      const baseLength = baseUrl.toString().length;
      const tokenLength = 2000 - baseLength - '&id_token_hint='.length + 1;
      const overToken = 'a'.repeat(tokenLength);

      const req = buildReq({
        user: { _id: 'user1', openidId: 'oid1', provider: 'openid', email: 'user@example.com' },
        session: {
          openidTokens: { refreshToken: 'srt', idToken: overToken },
          destroy: jest.fn(),
        },
      });
      const res = buildRes();

      await logoutController(req, res);

      const body = res.send.mock.calls[0][0];
      expect(body.redirect).not.toContain('id_token_hint=');
      expect(body.redirect).toContain('logout_hint=');
    });
  });

  describe('invalid OPENID_MAX_LOGOUT_URL_LENGTH values', () => {
    it('silently uses default when value is empty', async () => {
      process.env.OPENID_MAX_LOGOUT_URL_LENGTH = '';
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid OPENID_MAX_LOGOUT_URL_LENGTH'),
      );
      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('id_token_hint=small-id-token');
    });

    it('warns and uses default for partial numeric string', async () => {
      process.env.OPENID_MAX_LOGOUT_URL_LENGTH = '500abc';
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid OPENID_MAX_LOGOUT_URL_LENGTH'),
      );
      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('id_token_hint=small-id-token');
    });

    it('warns and uses default for zero value', async () => {
      process.env.OPENID_MAX_LOGOUT_URL_LENGTH = '0';
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid OPENID_MAX_LOGOUT_URL_LENGTH'),
      );
      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('id_token_hint=small-id-token');
    });

    it('warns and uses default for negative value', async () => {
      process.env.OPENID_MAX_LOGOUT_URL_LENGTH = '-1';
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid OPENID_MAX_LOGOUT_URL_LENGTH'),
      );
      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('id_token_hint=small-id-token');
    });

    it('warns and uses default for non-numeric string', async () => {
      process.env.OPENID_MAX_LOGOUT_URL_LENGTH = 'abc';
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid OPENID_MAX_LOGOUT_URL_LENGTH'),
      );
      const body = res.send.mock.calls[0][0];
      expect(body.redirect).toContain('id_token_hint=small-id-token');
    });
  });
});
