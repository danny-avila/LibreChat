const express = require('express');
const request = require('supertest');

const mockSetTwoFactorTempUser = jest.fn((req, res, next) => next());
const mockSetTwoFactorAcknowledgementTempUser = jest.fn((req, res, next) => next());
const mockSetTwoFactorFinalizationTempUser = jest.fn((req, res, next) => next());
const mockTwoFactorTempLimiter = jest.fn((req, res, next) => next());
const mockTwoFactorSetupLimiter = jest.fn((req, res, next) => next());
const mockCheckBan = jest.fn((req, res, next) => next());
const mockRequireTwoFactorSetupToken = jest.fn((req, res, next) => next());
const mockBlockRetiredSetupToken = jest.fn((req, res, next) => next());
const mockRequireTwoFactorSetupAcknowledgementToken = jest.fn((req, res, next) => next());
const mockRequireTwoFactorSetupFinalizationToken = jest.fn((req, res, next) => next());
const mockVerify2FAWithTempToken = jest.fn((req, res) => res.status(204).end());
const mockEnable2FA = jest.fn((req, res) => res.status(204).end());
const mockConfirm2FASetupWithTempToken = jest.fn((req, res) => res.status(204).end());
const mockAcknowledge2FASetup = jest.fn((req, res) => res.status(204).end());
const mockFinalize2FASetup = jest.fn((req, res) => res.status(204).end());

jest.mock('@librechat/api', () => ({
  createSetBalanceConfig: jest.fn(() => (req, res, next) => next()),
  requireTwoFactorSetupToken: (...args) => mockRequireTwoFactorSetupToken(...args),
  requireTwoFactorSetupAcknowledgementToken: (...args) =>
    mockRequireTwoFactorSetupAcknowledgementToken(...args),
  requireTwoFactorSetupFinalizationToken: (...args) =>
    mockRequireTwoFactorSetupFinalizationToken(...args),
  forceRefreshCloudFrontAuthCookies: jest.fn(),
  blockTwoFactorDisableWhenRequired: jest.fn((req, res, next) => next()),
}));

jest.mock('~/server/controllers/AuthController', () => ({
  refreshController: jest.fn((req, res) => res.status(204).end()),
  registrationController: jest.fn((req, res) => res.status(204).end()),
  resetPasswordController: jest.fn((req, res) => res.status(204).end()),
  resetPasswordRequestController: jest.fn((req, res) => res.status(204).end()),
  graphTokenController: jest.fn((req, res) => res.status(204).end()),
}));

jest.mock('~/server/controllers/TwoFactorController', () => ({
  enable2FA: (...args) => mockEnable2FA(...args),
  verify2FA: jest.fn((req, res) => res.status(204).end()),
  confirm2FA: jest.fn((req, res) => res.status(204).end()),
  disable2FA: jest.fn((req, res) => res.status(204).end()),
  regenerateBackupCodes: jest.fn((req, res) => res.status(204).end()),
}));

jest.mock('~/server/controllers/auth/TwoFactorAuthController', () => ({
  verify2FAWithTempToken: (...args) => mockVerify2FAWithTempToken(...args),
  confirm2FASetupWithTempToken: (...args) => mockConfirm2FASetupWithTempToken(...args),
  acknowledge2FASetup: (...args) => mockAcknowledge2FASetup(...args),
  finalize2FASetup: (...args) => mockFinalize2FASetup(...args),
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
    loginLimiter: pass,
    setTwoFactorTempUser: (...args) => mockSetTwoFactorTempUser(...args),
    setTwoFactorAcknowledgementTempUser: (...args) =>
      mockSetTwoFactorAcknowledgementTempUser(...args),
    setTwoFactorFinalizationTempUser: (...args) => mockSetTwoFactorFinalizationTempUser(...args),
    twoFactorTempLimiter: (...args) => mockTwoFactorTempLimiter(...args),
    twoFactorSetupLimiter: (...args) => mockTwoFactorSetupLimiter(...args),
    checkBan: (...args) => mockCheckBan(...args),
    blockRetiredSetupToken: (...args) => mockBlockRetiredSetupToken(...args),
    validateEmailLogin: pass,
    requireLocalAuth: pass,
    requireLdapAuth: pass,
    registerLimiter: pass,
    checkInviteUser: pass,
    validateRegistration: pass,
    resetPasswordLimiter: pass,
    resetPasswordSubmissionLimiter: pass,
    validatePasswordReset: pass,
    requireJwtAuth: pass,
  };
});

const authRouter = require('./auth');

describe('POST /api/auth/2fa/verify-temp rate limiting', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetTwoFactorTempUser.mockImplementation((req, res, next) => next());
    mockSetTwoFactorAcknowledgementTempUser.mockImplementation((req, res, next) => next());
    mockSetTwoFactorFinalizationTempUser.mockImplementation((req, res, next) => next());
    mockTwoFactorTempLimiter.mockImplementation((req, res, next) => next());
    mockTwoFactorSetupLimiter.mockImplementation((req, res, next) => next());
    mockCheckBan.mockImplementation((req, res, next) => next());
    mockRequireTwoFactorSetupToken.mockImplementation((req, res, next) => next());
    mockBlockRetiredSetupToken.mockImplementation((req, res, next) => next());
    mockRequireTwoFactorSetupAcknowledgementToken.mockImplementation((req, res, next) => next());
    mockRequireTwoFactorSetupFinalizationToken.mockImplementation((req, res, next) => next());
    mockVerify2FAWithTempToken.mockImplementation((req, res) => res.status(204).end());
    mockEnable2FA.mockImplementation((req, res) => res.status(204).end());
    mockConfirm2FASetupWithTempToken.mockImplementation((req, res) => res.status(204).end());
    mockAcknowledge2FASetup.mockImplementation((req, res) => res.status(204).end());
    mockFinalize2FASetup.mockImplementation((req, res) => res.status(204).end());

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
  });

  it('protects finalization with limiting, ban checks, and purpose validation', async () => {
    await request(app)
      .post('/api/auth/2fa/setup/finalize')
      .send({ finalizationToken: 'finalization-token' })
      .expect(204);

    expect(mockSetTwoFactorFinalizationTempUser).toHaveBeenCalledTimes(1);
    expect(mockTwoFactorSetupLimiter).toHaveBeenCalledTimes(1);
    /** Redeeming a nonce checks no guessable code, so it must not draw on the code-attempt quota. */
    expect(mockTwoFactorTempLimiter).not.toHaveBeenCalled();
    expect(mockCheckBan).toHaveBeenCalledTimes(1);
    expect(mockRequireTwoFactorSetupFinalizationToken).toHaveBeenCalledTimes(1);
    expect(mockFinalize2FASetup).toHaveBeenCalledTimes(1);
    expect(mockSetTwoFactorFinalizationTempUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockTwoFactorSetupLimiter.mock.invocationCallOrder[0],
    );
    expect(mockTwoFactorSetupLimiter.mock.invocationCallOrder[0]).toBeLessThan(
      mockCheckBan.mock.invocationCallOrder[0],
    );
    expect(mockCheckBan.mock.invocationCallOrder[0]).toBeLessThan(
      mockRequireTwoFactorSetupFinalizationToken.mock.invocationCallOrder[0],
    );
    expect(mockRequireTwoFactorSetupFinalizationToken.mock.invocationCallOrder[0]).toBeLessThan(
      mockFinalize2FASetup.mock.invocationCallOrder[0],
    );
  });

  it('protects acknowledgement with field-specific identity, limiting, ban checks, and purpose validation', async () => {
    await request(app)
      .post('/api/auth/2fa/setup/acknowledge')
      .send({ acknowledgementToken: 'acknowledgement-token' })
      .expect(204);

    expect(mockSetTwoFactorAcknowledgementTempUser).toHaveBeenCalledTimes(1);
    expect(mockTwoFactorSetupLimiter).toHaveBeenCalledTimes(1);
    expect(mockTwoFactorTempLimiter).not.toHaveBeenCalled();
    expect(mockCheckBan).toHaveBeenCalledTimes(1);
    expect(mockRequireTwoFactorSetupAcknowledgementToken).toHaveBeenCalledTimes(1);
    expect(mockAcknowledge2FASetup).toHaveBeenCalledTimes(1);
    expect(mockSetTwoFactorAcknowledgementTempUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockTwoFactorSetupLimiter.mock.invocationCallOrder[0],
    );
    expect(mockTwoFactorSetupLimiter.mock.invocationCallOrder[0]).toBeLessThan(
      mockCheckBan.mock.invocationCallOrder[0],
    );
    expect(mockCheckBan.mock.invocationCallOrder[0]).toBeLessThan(
      mockRequireTwoFactorSetupAcknowledgementToken.mock.invocationCallOrder[0],
    );
    expect(mockRequireTwoFactorSetupAcknowledgementToken.mock.invocationCallOrder[0]).toBeLessThan(
      mockAcknowledge2FASetup.mock.invocationCallOrder[0],
    );
  });

  it('does not finalize after the limiter or ban check rejects the request', async () => {
    mockCheckBan.mockImplementation((req, res) => res.status(403).json({ message: 'Banned' }));

    await request(app)
      .post('/api/auth/2fa/setup/finalize')
      .send({ finalizationToken: 'finalization-token' })
      .expect(403);

    expect(mockRequireTwoFactorSetupFinalizationToken).not.toHaveBeenCalled();
    expect(mockFinalize2FASetup).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/auth/2fa/setup', mockEnable2FA, mockTwoFactorSetupLimiter],
    ['/api/auth/2fa/setup/confirm', mockConfirm2FASetupWithTempToken, mockTwoFactorTempLimiter],
  ])(
    'protects %s with temp-token limiting and setup validation',
    async (path, controller, limiter) => {
      await request(app).post(path).send({ tempToken: 'temp-token' }).expect(204);

      expect(mockSetTwoFactorTempUser).toHaveBeenCalledTimes(1);
      expect(limiter).toHaveBeenCalledTimes(1);
      expect(mockCheckBan).toHaveBeenCalledTimes(1);
      expect(mockRequireTwoFactorSetupToken).toHaveBeenCalledTimes(1);
      expect(controller).toHaveBeenCalledTimes(1);
      expect(mockSetTwoFactorTempUser.mock.invocationCallOrder[0]).toBeLessThan(
        limiter.mock.invocationCallOrder[0],
      );
      expect(limiter.mock.invocationCallOrder[0]).toBeLessThan(
        mockCheckBan.mock.invocationCallOrder[0],
      );
      expect(mockCheckBan.mock.invocationCallOrder[0]).toBeLessThan(
        mockRequireTwoFactorSetupToken.mock.invocationCallOrder[0],
      );
      expect(mockRequireTwoFactorSetupToken.mock.invocationCallOrder[0]).toBeLessThan(
        controller.mock.invocationCallOrder[0],
      );
    },
  );

  it.each([
    ['/api/auth/2fa/setup', mockEnable2FA],
    ['/api/auth/2fa/setup/confirm', mockConfirm2FASetupWithTempToken],
  ])(
    'dates the setup token on %s once its signature has been verified',
    async (path, controller) => {
      await request(app).post(path).send({ tempToken: 'temp-token' }).expect(204);

      expect(mockBlockRetiredSetupToken).toHaveBeenCalledTimes(1);
      expect(mockRequireTwoFactorSetupToken.mock.invocationCallOrder[0]).toBeLessThan(
        mockBlockRetiredSetupToken.mock.invocationCallOrder[0],
      );
      expect(mockBlockRetiredSetupToken.mock.invocationCallOrder[0]).toBeLessThan(
        controller.mock.invocationCallOrder[0],
      );
    },
  );

  it.each([['/api/auth/2fa/setup'], ['/api/auth/2fa/setup/confirm']])(
    'does not stage enrollment on %s when the setup token has been retired',
    async (path) => {
      mockBlockRetiredSetupToken.mockImplementation((req, res) =>
        res.status(401).json({ message: 'Invalid or expired two-factor setup token' }),
      );

      await request(app).post(path).send({ tempToken: 'temp-token' }).expect(401);

      expect(mockEnable2FA).not.toHaveBeenCalled();
      expect(mockConfirm2FASetupWithTempToken).not.toHaveBeenCalled();
    },
  );

  it('sets the temp user before limiting, checking bans, and verifying temp 2FA tokens', async () => {
    await request(app).post('/api/auth/2fa/verify-temp').send({ token: '123456' }).expect(204);

    expect(mockSetTwoFactorTempUser).toHaveBeenCalledTimes(1);
    expect(mockTwoFactorTempLimiter).toHaveBeenCalledTimes(1);
    expect(mockCheckBan).toHaveBeenCalledTimes(1);
    expect(mockVerify2FAWithTempToken).toHaveBeenCalledTimes(1);
    expect(mockSetTwoFactorTempUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockTwoFactorTempLimiter.mock.invocationCallOrder[0],
    );
    expect(mockTwoFactorTempLimiter.mock.invocationCallOrder[0]).toBeLessThan(
      mockCheckBan.mock.invocationCallOrder[0],
    );
    expect(mockCheckBan.mock.invocationCallOrder[0]).toBeLessThan(
      mockVerify2FAWithTempToken.mock.invocationCallOrder[0],
    );
  });

  it('does not verify the temp 2FA token after the limiter rejects the request', async () => {
    mockTwoFactorTempLimiter.mockImplementation((req, res) =>
      res.status(429).json({ message: 'Too many verification attempts' }),
    );

    const response = await request(app)
      .post('/api/auth/2fa/verify-temp')
      .send({ token: '123456' })
      .expect(429);

    expect(response.body).toEqual({ message: 'Too many verification attempts' });
    expect(mockSetTwoFactorTempUser).toHaveBeenCalledTimes(1);
    expect(mockCheckBan).not.toHaveBeenCalled();
    expect(mockVerify2FAWithTempToken).not.toHaveBeenCalled();
  });
});
