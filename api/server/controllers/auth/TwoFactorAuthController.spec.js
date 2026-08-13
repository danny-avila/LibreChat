const mockVerifyJwt = jest.fn();
const mockGetTenantId = jest.fn();
const mockVerifyTOTP = jest.fn();
const mockGetTOTPSecret = jest.fn();
const mockVerifyBackupCode = jest.fn();
const mockSetAuthTokens = jest.fn();
const mockGetUserById = jest.fn();

jest.mock('jsonwebtoken', () => ({
  verify: (...args) => mockVerifyJwt(...args),
}));

jest.mock('@librechat/data-schemas', () => ({
  getTenantId: (...args) => mockGetTenantId(...args),
  logger: { error: jest.fn() },
}));

jest.mock('~/server/services/twoFactorService', () => ({
  verifyTOTP: (...args) => mockVerifyTOTP(...args),
  getTOTPSecret: (...args) => mockGetTOTPSecret(...args),
  verifyBackupCode: (...args) => mockVerifyBackupCode(...args),
}));

jest.mock('~/server/services/AuthService', () => ({
  setAuthTokens: (...args) => mockSetAuthTokens(...args),
}));

jest.mock('~/models', () => ({
  getUserById: (...args) => mockGetUserById(...args),
}));

const { createVerify2FAWithTempToken } = require('./TwoFactorAuthController');

function response() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

function user() {
  return {
    _id: { toString: () => 'user-id' },
    email: 'user@example.com',
    password: 'secret',
    totpSecret: 'encrypted-secret',
    backupCodes: ['backup'],
    twoFactorEnabled: true,
    toObject() {
      return { ...this, __v: 0 };
    },
  };
}

describe('createVerify2FAWithTempToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTenantId.mockReturnValue('tenant-a');
    mockGetTOTPSecret.mockResolvedValue('totp-secret');
    mockVerifyTOTP.mockResolvedValue(true);
    mockGetUserById.mockResolvedValue(user());
    mockSetAuthTokens.mockResolvedValue('local-access-token');
  });

  it('delegates a verified Clerk capability to the typed finalizer after TOTP', async () => {
    const capability = {
      userId: 'user-id',
      twoFAPending: true,
      authProvider: 'clerk',
      tenantScope: 'tenant-a',
      exp: 1_786_620_000,
    };
    mockVerifyJwt.mockReturnValue(capability);
    const finalized = {
      token: 'clerk-access-token',
      user: { id: 'user-id', email: 'user@example.com' },
    };
    const finalizeClerkTwoFactorSession = jest.fn().mockResolvedValue(finalized);
    const verify = createVerify2FAWithTempToken({ finalizeClerkTwoFactorSession });
    const req = { body: { tempToken: 'signed-capability', token: '123456' } };
    const res = response();

    await verify(req, res);

    expect(finalizeClerkTwoFactorSession).toHaveBeenCalledWith({
      req,
      res,
      user: expect.objectContaining({ twoFactorEnabled: true }),
      capability,
      tenantId: 'tenant-a',
    });
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(finalized);
  });

  it('returns only the typed stable Clerk error code and status', async () => {
    mockVerifyJwt.mockReturnValue({
      userId: 'user-id',
      twoFAPending: true,
      authProvider: 'clerk',
    });
    const error = Object.assign(new Error('internal replay detail'), {
      status: 409,
      code: 'CLERK_TOKEN_REPLAYED',
    });
    const finalizeClerkTwoFactorSession = jest.fn().mockRejectedValue(error);
    const verify = createVerify2FAWithTempToken({ finalizeClerkTwoFactorSession });
    const res = response();

    await verify({ body: { tempToken: 'signed-capability', token: '123456' } }, res);

    expect(mockSetAuthTokens).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ code: 'CLERK_TOKEN_REPLAYED' });
  });

  it('fails closed when a Clerk capability cannot resolve its tenant-scoped user', async () => {
    mockVerifyJwt.mockReturnValue({
      userId: 'user-id',
      twoFAPending: true,
      authProvider: 'clerk',
      tenantScope: 'tenant-a',
    });
    mockGetUserById.mockResolvedValue(null);
    const finalizeClerkTwoFactorSession = jest.fn();
    const verify = createVerify2FAWithTempToken({ finalizeClerkTwoFactorSession });
    const res = response();

    await verify({ body: { tempToken: 'signed-capability', token: '123456' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ code: 'CLERK_LOGIN_FORBIDDEN' });
    expect(mockGetTOTPSecret).not.toHaveBeenCalled();
    expect(finalizeClerkTwoFactorSession).not.toHaveBeenCalled();
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('preserves the local response when its user cannot be resolved', async () => {
    mockVerifyJwt.mockReturnValue({ userId: 'user-id', twoFAPending: true });
    mockGetUserById.mockResolvedValue(null);
    const verify = createVerify2FAWithTempToken({ finalizeClerkTwoFactorSession: jest.fn() });
    const res = response();

    await verify({ body: { tempToken: 'local-temp-token', token: '123456' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: '2FA is not enabled for this user' });
  });

  it('preserves the local temporary-token issuance path', async () => {
    mockVerifyJwt.mockReturnValue({ userId: 'user-id', twoFAPending: true });
    const finalizeClerkTwoFactorSession = jest.fn();
    const verify = createVerify2FAWithTempToken({ finalizeClerkTwoFactorSession });
    const req = { body: { tempToken: 'local-temp-token', token: '123456' } };
    const res = response();

    await verify(req, res);

    expect(finalizeClerkTwoFactorSession).not.toHaveBeenCalled();
    expect(mockSetAuthTokens).toHaveBeenCalledWith(
      expect.objectContaining({ toString: expect.any(Function) }),
      res,
      null,
      req,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      token: 'local-access-token',
      user: expect.objectContaining({
        id: 'user-id',
        email: 'user@example.com',
      }),
    });
    const responseUser = res.json.mock.calls[0][0].user;
    expect(responseUser).not.toHaveProperty('password');
    expect(responseUser).not.toHaveProperty('totpSecret');
    expect(responseUser).not.toHaveProperty('backupCodes');
    expect(responseUser).not.toHaveProperty('__v');
  });
});
