const cookies = require('cookie');

const mockLogoutUser = jest.fn();
const mockLogger = { warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const mockClearCloudFrontCookies = jest.fn();

jest.mock('cookie');
jest.mock('@librechat/api', () => ({
  clearCloudFrontCookies: (...args) => mockClearCloudFrontCookies(...args),
}));
jest.mock('@librechat/data-schemas', () => ({ logger: mockLogger }));
jest.mock('~/server/services/AuthService', () => ({
  logoutUser: (...args) => mockLogoutUser(...args),
}));

const { logoutController } = require('./LogoutController');

function buildReq(overrides = {}) {
  return {
    user: { _id: 'user1', tenantId: 'tenant1' },
    headers: { cookie: 'refreshToken=rt1' },
    session: { destroy: jest.fn() },
    ...overrides,
  };
}

function buildRes() {
  return {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    clearCookie: jest.fn(),
  };
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  cookies.parse.mockReturnValue({ refreshToken: 'cookie-rt' });
  mockLogoutUser.mockResolvedValue({ status: 200, message: 'Logout successful' });
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('LogoutController', () => {
  describe('successful logout', () => {
    it('calls logoutUser with the refresh token from cookie', async () => {
      const req = buildReq();
      const res = buildRes();

      await logoutController(req, res);

      expect(mockLogoutUser).toHaveBeenCalledWith(req, 'cookie-rt');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({ message: 'Logout successful' });
    });

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

    it('calls clearCloudFrontCookies with user id and tenantId', async () => {
      const req = buildReq({ user: { _id: 'user1', tenantId: 'tenantA' } });
      const res = buildRes();

      await logoutController(req, res);

      expect(mockClearCloudFrontCookies).toHaveBeenCalledWith(res, {
        userId: 'user1',
        tenantId: 'tenantA',
      });
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
});
