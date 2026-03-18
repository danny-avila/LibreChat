const cookies = require('cookie');

const mockLogoutUser = jest.fn();
const mockLogger = { warn: jest.fn(), error: jest.fn() };
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
});
