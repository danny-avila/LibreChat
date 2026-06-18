jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), debug: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('~/server/services/AuthService', () => ({
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
  setAuthTokens: jest.fn(),
  registerUser: jest.fn(),
}));
jest.mock('~/models', () => ({
  deleteAllUserSessions: jest.fn(),
  getUserById: jest.fn(),
  findSession: jest.fn(),
  updateUser: jest.fn(),
  findUser: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const { refreshController } = require('./AuthController');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getUserById, findSession } = require('~/models');

const ORIGINAL_JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe('refreshController – LibreChat path', () => {
  let req, res;
  const refreshSecret = 'test-refresh-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_REFRESH_SECRET = refreshSecret;
    process.env.NODE_ENV = 'test';
    setAuthTokens.mockResolvedValue('local-app-token');
    findSession.mockResolvedValue({ expiration: new Date(Date.now() + 60_000) });

    const refreshToken = jwt.sign({ id: 'local-user-id' }, refreshSecret, {
      expiresIn: '1h',
    });
    req = {
      headers: { cookie: `refreshToken=${refreshToken}` },
      query: {},
      session: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
    };
  });

  afterAll(() => {
    if (ORIGINAL_JWT_REFRESH_SECRET === undefined) {
      delete process.env.JWT_REFRESH_SECRET;
    } else {
      process.env.JWT_REFRESH_SECRET = ORIGINAL_JWT_REFRESH_SECRET;
    }

    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
  });

  it('returns 200 with token not provided when no refresh token cookie', async () => {
    req.headers.cookie = '';

    await refreshController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('Refresh token not provided');
  });

  it('sanitizes user documents before returning local refresh responses', async () => {
    getUserById.mockResolvedValue({
      toObject: () => ({
        _id: 'local-user-id',
        email: 'local@example.com',
        password: 'hashed-password',
        __v: 1,
        totpSecret: 'totp-secret',
        backupCodes: ['backup-code'],
        federatedTokens: { access_token: 'do-not-return' },
      }),
    });

    await refreshController(req, res);

    const sentPayload = res.send.mock.calls[0][0];
    expect(setAuthTokens).toHaveBeenCalledWith(
      'local-user-id',
      res,
      { expiration: expect.any(Date) },
      req,
    );
    expect(sentPayload).toEqual({
      token: 'local-app-token',
      user: {
        _id: 'local-user-id',
        email: 'local@example.com',
      },
    });
  });

  it('sanitizes user documents before returning CI refresh responses', async () => {
    process.env.NODE_ENV = 'CI';
    getUserById.mockResolvedValue({
      toObject: () => ({
        _id: 'local-user-id',
        email: 'local@example.com',
        password: 'hashed-password',
        __v: 1,
        totpSecret: 'totp-secret',
        backupCodes: ['backup-code'],
        federatedTokens: { access_token: 'do-not-return' },
      }),
    });

    await refreshController(req, res);

    const sentPayload = res.send.mock.calls[0][0];
    expect(findSession).not.toHaveBeenCalled();
    expect(setAuthTokens).toHaveBeenCalledWith('local-user-id', res, null, req);
    expect(sentPayload).toEqual({
      token: 'local-app-token',
      user: {
        _id: 'local-user-id',
        email: 'local@example.com',
      },
    });
  });
});
