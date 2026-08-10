const mockConfirmTwoFactorSetup = jest.fn();
const mockSetAuthTokens = jest.fn(() => Promise.resolve('auth-token'));
const mockGetUserById = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetTOTPSecret = jest.fn();
const mockVerifyTOTP = jest.fn();

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  confirmTwoFactorSetup: (...args) => mockConfirmTwoFactorSetup(...args),
}));

jest.mock('~/server/services/twoFactorService', () => ({
  getTOTPSecret: (...args) => mockGetTOTPSecret(...args),
  verifyTOTP: (...args) => mockVerifyTOTP(...args),
  verifyBackupCode: jest.fn(),
}));

jest.mock('~/server/services/AuthService', () => ({
  setAuthTokens: (...args) => mockSetAuthTokens(...args),
}));

jest.mock('~/models', () => ({
  getUserById: (...args) => mockGetUserById(...args),
  updateUser: (...args) => mockUpdateUser(...args),
}));

const { confirm2FASetupWithTempToken } = require('./TwoFactorAuthController');

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('confirm2FASetupWithTempToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finishes enrollment and only then issues full auth tokens', async () => {
    const user = {
      _id: 'user-1',
      email: 'user@example.com',
      twoFactorEnabled: false,
      pendingTotpSecret: 'encrypted-secret',
      pendingBackupCodes: [{ codeHash: 'hash', used: false }],
    };
    mockConfirmTwoFactorSetup.mockResolvedValue({ ok: true, user });
    const req = { user: { id: 'user-1' }, body: { token: '123456' } };
    const res = createResponse();

    await confirm2FASetupWithTempToken(req, res);

    expect(mockConfirmTwoFactorSetup).toHaveBeenCalledWith('user-1', '123456', {
      getUserById: expect.any(Function),
      getTOTPSecret: expect.any(Function),
      verifyTOTP: expect.any(Function),
      updateUser: expect.any(Function),
    });
    expect(mockSetAuthTokens).toHaveBeenCalledWith('user-1', res, null, req);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      token: 'auth-token',
      user: {
        _id: 'user-1',
        id: 'user-1',
        email: 'user@example.com',
        twoFactorEnabled: true,
      },
    });
  });

  it('does not issue auth tokens when setup confirmation fails', async () => {
    mockConfirmTwoFactorSetup.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'Invalid token',
    });
    const req = { user: { id: 'user-1' }, body: { token: '000000' } };
    const res = createResponse();

    await confirm2FASetupWithTempToken(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token' });
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('rejects requests without a validated setup user', async () => {
    const req = { body: { token: '123456' } };
    const res = createResponse();

    await confirm2FASetupWithTempToken(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockConfirmTwoFactorSetup).not.toHaveBeenCalled();
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });
});
