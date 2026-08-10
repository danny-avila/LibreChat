import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import {
  confirmTwoFactorSetup,
  generateTwoFactorSetupToken,
  requireTwoFactorSetupToken,
  verifyTwoFactorSetupToken,
  blockTwoFactorDisableWhenRequired,
} from './twoFactor';

const jwtSecret = 'two-factor-setup-test-secret';

function createResponse(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as Partial<Response> as Response;
}

describe('two-factor setup tokens', () => {
  it('round-trips a purpose-scoped setup token', () => {
    const token = generateTwoFactorSetupToken('user-1', jwtSecret);

    expect(verifyTwoFactorSetupToken(token, jwtSecret)).toBe('user-1');
  });

  it('rejects a normal 2FA challenge token for setup', () => {
    const token = jwt.sign({ userId: 'user-1', twoFAPending: true }, jwtSecret, {
      expiresIn: '5m',
    });

    expect(verifyTwoFactorSetupToken(token, jwtSecret)).toBeUndefined();
  });

  it('rejects expired setup tokens', () => {
    const token = jwt.sign({ userId: 'user-1', twoFASetupRequired: true }, jwtSecret, {
      expiresIn: -1,
    });

    expect(verifyTwoFactorSetupToken(token, jwtSecret)).toBeUndefined();
  });
});

describe('requireTwoFactorSetupToken', () => {
  const originalPolicy = process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION;
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = 'true';
    process.env.JWT_SECRET = jwtSecret;
  });

  afterAll(() => {
    if (originalPolicy === undefined) {
      delete process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION;
    } else {
      process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = originalPolicy;
    }
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('attaches the setup user and continues for a valid token', () => {
    const req = {
      body: { tempToken: generateTwoFactorSetupToken('user-2', jwtSecret) },
    } as Request;
    const res = createResponse();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    requireTwoFactorSetupToken(req, res, next);

    expect(req.user).toEqual({ id: 'user-2' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects setup when the deployment policy is disabled', () => {
    process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = 'false';
    const req = {
      body: { tempToken: generateTwoFactorSetupToken('user-2', jwtSecret) },
    } as Request;
    const res = createResponse();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    requireTwoFactorSetupToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects missing or invalid setup tokens', () => {
    const req = { body: { tempToken: 'invalid' } } as Request;
    const res = createResponse();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    requireTwoFactorSetupToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('confirmTwoFactorSetup', () => {
  const user = {
    _id: 'user-3',
    twoFactorEnabled: false,
    pendingTotpSecret: 'encrypted-secret',
    pendingBackupCodes: [{ codeHash: 'hash', used: false }],
  };

  function createDependencies(overrides = {}) {
    return {
      getUserById: jest.fn().mockResolvedValue(user),
      getTOTPSecret: jest.fn().mockResolvedValue('plain-secret'),
      verifyTOTP: jest.fn().mockResolvedValue(true),
      updateUser: jest.fn().mockResolvedValue({ ...user, twoFactorEnabled: true }),
      ...overrides,
    };
  }

  it('promotes pending credentials only after a valid TOTP', async () => {
    const deps = createDependencies();
    const updatedUser = { ...user, twoFactorEnabled: true };

    const result = await confirmTwoFactorSetup('user-3', '123456', deps);

    expect(result).toEqual({ ok: true, user: updatedUser });
    expect(deps.updateUser).toHaveBeenCalledWith('user-3', {
      totpSecret: 'encrypted-secret',
      backupCodes: [{ codeHash: 'hash', used: false }],
      twoFactorEnabled: true,
      pendingTotpSecret: null,
      pendingBackupCodes: [],
    });
  });

  it('rejects users who already have 2FA enabled', async () => {
    const deps = createDependencies({
      getUserById: jest.fn().mockResolvedValue({ ...user, twoFactorEnabled: true }),
    });

    const result = await confirmTwoFactorSetup('user-3', '123456', deps);

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: '2FA setup is not available for this user',
    });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid TOTP without mutating the user', async () => {
    const deps = createDependencies({ verifyTOTP: jest.fn().mockResolvedValue(false) });

    const result = await confirmTwoFactorSetup('user-3', '000000', deps);

    expect(result).toEqual({ ok: false, status: 400, message: 'Invalid token' });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });
});

describe('blockTwoFactorDisableWhenRequired', () => {
  const originalPolicy = process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION;

  afterAll(() => {
    if (originalPolicy === undefined) {
      delete process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION;
    } else {
      process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = originalPolicy;
    }
  });

  it('blocks disabling 2FA when it is required', () => {
    process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = 'true';
    const req = {} as Request;
    const res = createResponse();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    blockTwoFactorDisableWhenRequired(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows disabling 2FA when it is optional', () => {
    process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = 'false';
    const req = {} as Request;
    const res = createResponse();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    blockTwoFactorDisableWhenRequired(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
