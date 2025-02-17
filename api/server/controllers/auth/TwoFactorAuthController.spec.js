const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const twoFactorService = require('~/server/services/twoFactorService');
const models = require('~/models');
const authService = require('~/server/services/AuthService');
const { verify2FA } = require('~/server/controllers/auth/TwoFactorAuthController');

// Mock out modules that use the '~' alias
jest.mock('~/server/services/twoFactorService', () => ({
  generateTOTPSecret: jest.fn(),
  generateBackupCodes: jest.fn(),
  verifyTOTP: jest.fn(),
}));

jest.mock('~/models', () => ({
  updateUser: jest.fn(),
  getUserById: jest.fn(),
}));

jest.mock('~/server/services/AuthService', () => ({
  setAuthTokens: jest.fn(),
}));

jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('verify2FA', () => {
  let req, res;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 if tempToken is missing', async () => {
    req.body = { token: '123456' };

    await verify2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Missing temporary token',
    });
  });

  it('should return 401 if tempToken is invalid or expired', async () => {
    req.body = { tempToken: 'invalidToken', token: '123456' };
    jest.spyOn(jwt, 'verify').mockImplementation(() => {
      throw new Error('jwt error');
    });

    await verify2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid or expired temporary token',
    });
  });

  it('should return 400 if user does not have 2FA enabled', async () => {
    const payload = { userId: 'user123' };
    jest.spyOn(jwt, 'verify').mockReturnValue(payload);
    models.getUserById.mockResolvedValue({
      _id: 'user123',
      backupCodes: [],
    });

    req.body = { tempToken: 'validTempToken', token: '123456' };

    await verify2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: '2FA is not enabled for this user',
    });
  });

  it('should verify valid TOTP token and return auth data', async () => {
    const payload = { userId: 'user123' };
    jest.spyOn(jwt, 'verify').mockReturnValue(payload);
    const user = {
      _id: 'user123',
      totpSecret: 'SECRET',
      backupCodes: [{ codeHash: 'hash', used: false }],
      toObject: () => ({
        _id: 'user123',
        email: 'test@example.com',
        totpSecret: 'SECRET',
        __v: 0,
      }),
    };
    models.getUserById.mockResolvedValue(user);
    twoFactorService.verifyTOTP.mockResolvedValue(true);
    authService.setAuthTokens.mockResolvedValue('auth-token');

    req.body = { tempToken: 'validTempToken', token: 'valid-token' };

    await verify2FA(req, res);

    expect(authService.setAuthTokens).toHaveBeenCalledWith('user123', res);
    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData).toHaveProperty('token', 'auth-token');
    expect(responseData).toHaveProperty('user');
    expect(responseData.user).not.toHaveProperty('password');
    expect(responseData.user).not.toHaveProperty('totpSecret');
    expect(responseData.user).not.toHaveProperty('__v');
  });

  it('should verify valid backup code and update it as used', async () => {
    const payload = { userId: 'user123' };
    jest.spyOn(jwt, 'verify').mockReturnValue(payload);
    const backupCode = 'validBackup';
    const hashedCode = crypto.createHash('sha256').update(backupCode).digest('hex');
    const user = {
      _id: 'user123',
      totpSecret: 'SECRET',
      backupCodes: [{ codeHash: hashedCode, used: false }],
      toObject: () => ({
        _id: 'user123',
        email: 'test@example.com',
        totpSecret: 'SECRET',
        __v: 0,
      }),
    };
    models.getUserById.mockResolvedValue(user);
    twoFactorService.verifyTOTP.mockResolvedValue(false);
    models.updateUser.mockResolvedValue();
    authService.setAuthTokens.mockResolvedValue('auth-token');

    req.body = { tempToken: 'validTempToken', backupCode };

    await verify2FA(req, res);

    expect(models.updateUser).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData).toHaveProperty('token', 'auth-token');
    expect(responseData).toHaveProperty('user');
  });

  it('should return 401 for invalid 2FA code or backup code', async () => {
    const payload = { userId: 'user123' };
    jest.spyOn(jwt, 'verify').mockReturnValue(payload);
    const user = {
      _id: 'user123',
      totpSecret: 'SECRET',
      backupCodes: [{ codeHash: 'somehash', used: false }],
      toObject: () => ({
        _id: 'user123',
        email: 'test@example.com',
        totpSecret: 'SECRET',
        __v: 0,
      }),
    };
    models.getUserById.mockResolvedValue(user);
    twoFactorService.verifyTOTP.mockResolvedValue(false);

    req.body = {
      tempToken: 'validTempToken',
      token: 'invalid',
      backupCode: 'invalidBackup',
    };

    await verify2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid 2FA code or backup code',
    });
  });

  it('should handle errors and return 500', async () => {
    // Simulate an error in models.getUserById to trigger the outer catch block
    const payload = { userId: 'user123' };
    jest.spyOn(jwt, 'verify').mockReturnValue(payload);
    models.getUserById.mockRejectedValue(new Error('Unexpected error'));

    req.body = { tempToken: 'validTempToken', token: 'any' };

    await verify2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Something went wrong',
    });
  });
});