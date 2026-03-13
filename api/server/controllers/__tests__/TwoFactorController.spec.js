const mockGetUserById = jest.fn();
const mockUpdateUser = jest.fn();
const mockVerifyTOTP = jest.fn();
const mockVerifyBackupCode = jest.fn();
const mockGetTOTPSecret = jest.fn();
const mockGenerateTOTPSecret = jest.fn();
const mockGenerateBackupCodes = jest.fn();
const mockEncryptV3 = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  encryptV3: (...args) => mockEncryptV3(...args),
  logger: { error: jest.fn() },
}));

jest.mock('~/server/services/twoFactorService', () => ({
  generateBackupCodes: (...args) => mockGenerateBackupCodes(...args),
  generateTOTPSecret: (...args) => mockGenerateTOTPSecret(...args),
  verifyBackupCode: (...args) => mockVerifyBackupCode(...args),
  getTOTPSecret: (...args) => mockGetTOTPSecret(...args),
  verifyTOTP: (...args) => mockVerifyTOTP(...args),
}));

jest.mock('~/models', () => ({
  getUserById: (...args) => mockGetUserById(...args),
  updateUser: (...args) => mockUpdateUser(...args),
}));

const { enable2FA, regenerateBackupCodes } = require('~/server/controllers/TwoFactorController');

function createRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const PLAIN_CODES = ['code1', 'code2', 'code3'];
const CODE_OBJECTS = [{ codeHash: 'h1' }, { codeHash: 'h2' }, { codeHash: 'h3' }];

beforeEach(() => {
  jest.clearAllMocks();
  mockGenerateTOTPSecret.mockReturnValue('NEWSECRET');
  mockGenerateBackupCodes.mockResolvedValue({ plainCodes: PLAIN_CODES, codeObjects: CODE_OBJECTS });
  mockEncryptV3.mockReturnValue('encrypted-secret');
  mockGetTOTPSecret.mockResolvedValue('decrypted-secret');
});

describe('enable2FA', () => {
  it('allows first-time setup without token', async () => {
    const req = { user: { id: 'user1' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false, email: 'a@b.com' });
    mockUpdateUser.mockResolvedValue({ email: 'a@b.com' });

    await enable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ otpauthUrl: expect.any(String), backupCodes: PLAIN_CODES }),
    );
  });

  it('requires valid TOTP when 2FA is already enabled', async () => {
    const req = { user: { id: 'user1' }, body: { token: '123456' } };
    const res = createRes();
    mockGetUserById.mockResolvedValue({
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
      email: 'a@b.com',
    });
    mockVerifyTOTP.mockResolvedValue(true);
    mockUpdateUser.mockResolvedValue({ email: 'a@b.com' });

    await enable2FA(req, res);

    expect(mockVerifyTOTP).toHaveBeenCalledWith('decrypted-secret', '123456');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ otpauthUrl: expect.any(String), backupCodes: PLAIN_CODES }),
    );
  });

  it('allows re-enrollment with valid backup code', async () => {
    const req = { user: { id: 'user1' }, body: { backupCode: 'backup123' } };
    const res = createRes();
    const existingUser = {
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
      email: 'a@b.com',
    };
    mockGetUserById.mockResolvedValue(existingUser);
    mockVerifyBackupCode.mockResolvedValue(true);
    mockUpdateUser.mockResolvedValue({ email: 'a@b.com' });

    await enable2FA(req, res);

    expect(mockVerifyBackupCode).toHaveBeenCalledWith({ user: existingUser, backupCode: 'backup123' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects with 400 when no token provided and 2FA is enabled', async () => {
    const req = { user: { id: 'user1' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
    });

    await enable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'TOTP token or backup code is required to re-enroll 2FA',
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('rejects with 401 when invalid token provided and 2FA is enabled', async () => {
    const req = { user: { id: 'user1' }, body: { token: 'wrong' } };
    const res = createRes();
    mockGetUserById.mockResolvedValue({
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
    });
    mockVerifyTOTP.mockResolvedValue(false);

    await enable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token or backup code' });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe('regenerateBackupCodes', () => {
  it('requires valid TOTP when 2FA is enabled', async () => {
    const req = { user: { id: 'user1' }, body: { token: '123456' } };
    const res = createRes();
    mockGetUserById.mockResolvedValue({
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
    });
    mockVerifyTOTP.mockResolvedValue(true);
    mockUpdateUser.mockResolvedValue({});

    await regenerateBackupCodes(req, res);

    expect(mockVerifyTOTP).toHaveBeenCalledWith('decrypted-secret', '123456');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ backupCodes: PLAIN_CODES });
  });

  it('rejects with 400 when no token provided and 2FA is enabled', async () => {
    const req = { user: { id: 'user1' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
    });

    await regenerateBackupCodes(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'TOTP token or backup code is required to regenerate backup codes',
    });
  });

  it('rejects with 401 when invalid token provided and 2FA is enabled', async () => {
    const req = { user: { id: 'user1' }, body: { token: 'wrong' } };
    const res = createRes();
    mockGetUserById.mockResolvedValue({
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
    });
    mockVerifyTOTP.mockResolvedValue(false);

    await regenerateBackupCodes(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token or backup code' });
  });

  it('does NOT return backupCodesHash in response', async () => {
    const req = { user: { id: 'user1' }, body: { token: '123456' } };
    const res = createRes();
    mockGetUserById.mockResolvedValue({
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
    });
    mockVerifyTOTP.mockResolvedValue(true);
    mockUpdateUser.mockResolvedValue({});

    await regenerateBackupCodes(req, res);

    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody).not.toHaveProperty('backupCodesHash');
    expect(responseBody).toHaveProperty('backupCodes');
  });

  it('allows regeneration without token when 2FA is not enabled', async () => {
    const req = { user: { id: 'user1' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({
      _id: 'user1',
      twoFactorEnabled: false,
    });
    mockUpdateUser.mockResolvedValue({});

    await regenerateBackupCodes(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ backupCodes: PLAIN_CODES });
  });
});
