const express = require('express');
const request = require('supertest');

const mockLoginLimiter = jest.fn((req, res, next) => next());
const mockCheckBan = jest.fn((req, res, next) => next());
const mockVerify2FAWithTempToken = jest.fn((req, res) => res.status(204).end());

jest.mock(
  '@librechat/api',
  () => ({
    createSetBalanceConfig: jest.fn(() => (req, res, next) => next()),
    forceRefreshCloudFrontAuthCookies: jest.fn(),
  }),
  { virtual: true },
);

jest.mock('~/server/controllers/AuthController', () => ({
  refreshController: jest.fn((req, res) => res.status(204).end()),
  registrationController: jest.fn((req, res) => res.status(204).end()),
  resetPasswordController: jest.fn((req, res) => res.status(204).end()),
  resetPasswordRequestController: jest.fn((req, res) => res.status(204).end()),
  graphTokenController: jest.fn((req, res) => res.status(204).end()),
}));

jest.mock('~/server/controllers/TwoFactorController', () => ({
  enable2FA: jest.fn((req, res) => res.status(204).end()),
  verify2FA: jest.fn((req, res) => res.status(204).end()),
  confirm2FA: jest.fn((req, res) => res.status(204).end()),
  disable2FA: jest.fn((req, res) => res.status(204).end()),
  regenerateBackupCodes: jest.fn((req, res) => res.status(204).end()),
}));

jest.mock('~/server/controllers/auth/TwoFactorAuthController', () => ({
  verify2FAWithTempToken: (...args) => mockVerify2FAWithTempToken(...args),
}));

jest.mock('~/server/controllers/auth/LogoutController', () => ({
  logoutController: jest.fn((req, res) => res.status(204).end()),
}));

jest.mock('~/server/controllers/auth/LoginController', () => ({
  loginController: jest.fn((req, res) => res.status(204).end()),
}));

jest.mock('~/models', () => ({
  findBalanceByUser: jest.fn(),
  upsertBalanceFields: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

jest.mock('~/server/middleware', () => {
  const pass = (req, res, next) => next();
  return {
    logHeaders: pass,
    loginLimiter: (...args) => mockLoginLimiter(...args),
    checkBan: (...args) => mockCheckBan(...args),
    requireLocalAuth: pass,
    requireLdapAuth: pass,
    registerLimiter: pass,
    checkInviteUser: pass,
    validateRegistration: pass,
    resetPasswordLimiter: pass,
    validatePasswordReset: pass,
    requireJwtAuth: pass,
  };
});

const authRouter = require('./auth');

describe('POST /api/auth/2fa/verify-temp rate limiting', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoginLimiter.mockImplementation((req, res, next) => next());
    mockCheckBan.mockImplementation((req, res, next) => next());
    mockVerify2FAWithTempToken.mockImplementation((req, res) => res.status(204).end());

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
  });

  it('runs the login limiter before checking bans and verifying temp 2FA tokens', async () => {
    await request(app).post('/api/auth/2fa/verify-temp').send({ token: '123456' }).expect(204);

    expect(mockLoginLimiter).toHaveBeenCalledTimes(1);
    expect(mockCheckBan).toHaveBeenCalledTimes(1);
    expect(mockVerify2FAWithTempToken).toHaveBeenCalledTimes(1);
    expect(mockLoginLimiter.mock.invocationCallOrder[0]).toBeLessThan(
      mockCheckBan.mock.invocationCallOrder[0],
    );
    expect(mockCheckBan.mock.invocationCallOrder[0]).toBeLessThan(
      mockVerify2FAWithTempToken.mock.invocationCallOrder[0],
    );
  });

  it('does not verify the temp 2FA token after the limiter rejects the request', async () => {
    mockLoginLimiter.mockImplementation((req, res) =>
      res.status(429).json({ message: 'Too many login attempts' }),
    );

    const response = await request(app)
      .post('/api/auth/2fa/verify-temp')
      .send({ token: '123456' })
      .expect(429);

    expect(response.body).toEqual({ message: 'Too many login attempts' });
    expect(mockCheckBan).not.toHaveBeenCalled();
    expect(mockVerify2FAWithTempToken).not.toHaveBeenCalled();
  });
});
