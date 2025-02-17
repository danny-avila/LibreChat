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

const crypto = require('crypto');
const twoFactorControllers = require('../../server/controllers/twoFactorController');
const {
  enable2FAController,
  verify2FAController,
  confirm2FAController,
  disable2FAController,
  regenerateBackupCodesController,
} = twoFactorControllers;
const twoFactorService = require('../../server/services/twoFactorService');
const models = require('~/models');
const { logger } = require('../../config');

describe('2FA Controllers', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { id: 'user123', email: 'test@example.com' },
      body: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Prevent actual error logging during tests
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('enable2FAController', () => {
    it('should enable 2FA and return otpauthUrl and backup codes', async () => {
      process.env.APP_TITLE = 'Test App';
      const secret = 'SECRET123';
      const backupCodesData = {
        plainCodes: ['code1', 'code2'],
        codeObjects: [
          { codeHash: 'hash1', used: false },
          { codeHash: 'hash2', used: false },
        ],
      };

      jest.spyOn(twoFactorService, 'generateTOTPSecret').mockReturnValue(secret);
      jest.spyOn(twoFactorService, 'generateBackupCodes').mockResolvedValue(backupCodesData);
      jest.spyOn(models, 'updateUser').mockResolvedValue({
        _id: 'user123',
        email: 'test@example.com',
      });

      await enable2FAController(req, res);

      const safeAppTitle = process.env.APP_TITLE.replace(/\s+/g, '');
      const expectedOtpauthUrl = `otpauth://totp/${safeAppTitle}:test@example.com?secret=${secret}&issuer=${safeAppTitle}`;

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        otpauthUrl: expectedOtpauthUrl,
        backupCodes: backupCodesData.plainCodes,
      });
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Update failed');
      jest.spyOn(twoFactorService, 'generateTOTPSecret').mockReturnValue('SECRET');
      jest.spyOn(twoFactorService, 'generateBackupCodes').mockResolvedValue({
        plainCodes: ['code1'],
        codeObjects: [{ codeHash: 'hash1', used: false }],
      });
      jest.spyOn(models, 'updateUser').mockRejectedValue(error);

      await enable2FAController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });
  });

  describe('verify2FAController', () => {
    it('should return 400 if user not found or totpSecret missing', async () => {
      jest.spyOn(models, 'getUserById').mockResolvedValue(null);
      req.body = { token: '123456' };

      await verify2FAController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: '2FA not initiated' });
    });

    it('should verify valid TOTP token and return 200', async () => {
      const user = { _id: 'user123', totpSecret: 'SECRET', backupCodes: [] };
      jest.spyOn(models, 'getUserById').mockResolvedValue(user);
      jest.spyOn(twoFactorService, 'verifyTOTP').mockResolvedValue(true);

      req.body = { token: 'valid-token' };

      await verify2FAController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });

    it('should verify valid backup code and mark it as used', async () => {
      const backupCode = 'validBackup';
      const hashedCode = crypto.createHash('sha256').update(backupCode).digest('hex');
      const user = {
        _id: 'user123',
        totpSecret: 'SECRET',
        backupCodes: [{ codeHash: hashedCode, used: false }],
      };
      jest.spyOn(models, 'getUserById').mockResolvedValue(user);
      jest.spyOn(twoFactorService, 'verifyTOTP').mockResolvedValue(false);
      const updateUserSpy = jest.spyOn(models, 'updateUser').mockResolvedValue();

      req.body = { backupCode };

      await verify2FAController(req, res);

      expect(updateUserSpy).toHaveBeenCalledTimes(1);
      const updatedBackupCodes = updateUserSpy.mock.calls[0][1].backupCodes;
      expect(updatedBackupCodes[0].used).toBe(true);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });

    it('should return 400 for invalid token or backup code', async () => {
      const user = {
        _id: 'user123',
        totpSecret: 'SECRET',
        backupCodes: [],
      };
      jest.spyOn(models, 'getUserById').mockResolvedValue(user);
      jest.spyOn(twoFactorService, 'verifyTOTP').mockResolvedValue(false);

      req.body = { token: 'invalid', backupCode: 'invalidBackup' };

      await verify2FAController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token.' });
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Unexpected error');
      jest.spyOn(models, 'getUserById').mockRejectedValue(error);
      req.body = { token: 'any' };

      await verify2FAController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });
  });

  describe('confirm2FAController', () => {
    it('should return 400 if user not found or totpSecret missing', async () => {
      jest.spyOn(models, 'getUserById').mockResolvedValue(null);
      req.body = { token: '123456' };

      await confirm2FAController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: '2FA not initiated' });
    });

    it('should confirm valid TOTP token and return 200', async () => {
      const user = { _id: 'user123', totpSecret: 'SECRET' };
      jest.spyOn(models, 'getUserById').mockResolvedValue(user);
      jest.spyOn(twoFactorService, 'verifyTOTP').mockResolvedValue(true);

      req.body = { token: 'valid-token' };

      await confirm2FAController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });

    it('should return 400 for invalid token', async () => {
      const user = { _id: 'user123', totpSecret: 'SECRET' };
      jest.spyOn(models, 'getUserById').mockResolvedValue(user);
      jest.spyOn(twoFactorService, 'verifyTOTP').mockResolvedValue(false);

      req.body = { token: 'invalid-token' };

      await confirm2FAController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token.' });
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Unexpected error');
      jest.spyOn(models, 'getUserById').mockRejectedValue(error);
      req.body = { token: 'any' };

      await confirm2FAController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });
  });

  describe('disable2FAController', () => {
    it('should disable 2FA and return 200', async () => {
      const updateUserSpy = jest.spyOn(models, 'updateUser').mockResolvedValue();

      await disable2FAController(req, res);

      expect(updateUserSpy).toHaveBeenCalledWith('user123', {
        totpSecret: null,
        backupCodes: [],
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Disable error');
      jest.spyOn(models, 'updateUser').mockRejectedValue(error);

      await disable2FAController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });
  });

  describe('regenerateBackupCodesController', () => {
    it('should regenerate backup codes and return them', async () => {
      const backupCodesData = {
        plainCodes: ['newCode1', 'newCode2'],
        codeObjects: [
          { codeHash: 'newHash1', used: false },
          { codeHash: 'newHash2', used: false },
        ],
      };
      jest.spyOn(twoFactorService, 'generateBackupCodes').mockResolvedValue(backupCodesData);
      const updateUserSpy = jest.spyOn(models, 'updateUser').mockResolvedValue();

      await regenerateBackupCodesController(req, res);

      expect(updateUserSpy).toHaveBeenCalledWith('user123', {
        backupCodes: backupCodesData.codeObjects,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        backupCodes: backupCodesData.plainCodes,
        backupCodesHash: backupCodesData.codeObjects,
      });
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Regenerate error');
      jest.spyOn(twoFactorService, 'generateBackupCodes').mockRejectedValue(error);

      await regenerateBackupCodesController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });
  });
});