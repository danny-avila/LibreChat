const mockGenerateTwoFactorSetupToken = jest.fn(() => 'setup-token');
const mockGenerate2FATempToken = jest.fn(() => 'challenge-token');
const mockSetAuthTokens = jest.fn(() => Promise.resolve('auth-token'));

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  generateTwoFactorSetupToken: (...args) => mockGenerateTwoFactorSetupToken(...args),
  isEnabled: (value) => typeof value === 'string' && value.trim().toLowerCase() === 'true',
}));

jest.mock('~/server/services/twoFactorService', () => ({
  generate2FATempToken: (...args) => mockGenerate2FATempToken(...args),
}));

jest.mock('~/server/services/AuthService', () => ({
  setAuthTokens: (...args) => mockSetAuthTokens(...args),
}));

const { loginController } = require('./LoginController');

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
}

describe('loginController', () => {
  const originalPolicy = process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION;
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'jwt-secret';
    delete process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION;
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

  it('uses the existing 2FA challenge for enrolled users', async () => {
    const req = { user: { _id: 'user-1', twoFactorEnabled: true } };
    const res = createResponse();

    await loginController(req, res);

    expect(mockGenerate2FATempToken).toHaveBeenCalledWith('user-1');
    expect(res.json).toHaveBeenCalledWith({
      twoFAPending: true,
      tempToken: 'challenge-token',
    });
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('requires purpose-scoped enrollment before issuing auth tokens', async () => {
    process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = 'true';
    const req = { user: { _id: 'user-2', twoFactorEnabled: false } };
    const res = createResponse();

    await loginController(req, res);

    expect(mockGenerateTwoFactorSetupToken).toHaveBeenCalledWith('user-2', 'jwt-secret');
    expect(res.json).toHaveBeenCalledWith({
      twoFAPending: true,
      twoFASetupRequired: true,
      tempToken: 'setup-token',
    });
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('keeps optional 2FA login behavior unchanged when enforcement is disabled', async () => {
    process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = 'false';
    const req = {
      user: {
        _id: 'user-3',
        password: 'secret',
        totpSecret: 'totp',
        email: 'user@example.com',
      },
    };
    const res = createResponse();

    await loginController(req, res);

    expect(mockSetAuthTokens).toHaveBeenCalledWith('user-3', res, null, req);
    expect(res.send).toHaveBeenCalledWith({
      token: 'auth-token',
      user: {
        _id: 'user-3',
        email: 'user@example.com',
        id: 'user-3',
      },
    });
  });
});
