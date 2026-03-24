jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('~/server/services/twoFactorService', () => ({
  generate2FATempToken: jest.fn(() => 'temp-token'),
}));

jest.mock('~/server/services/AuthService', () => ({
  setAuthTokens: jest.fn().mockResolvedValue('jwt-token'),
}));

jest.mock('~/server/services/auth/verifyGoogleMobileIdentity', () => jest.fn());
jest.mock('~/server/services/auth/resolveSocialLogin', () => jest.fn());

const { setAuthTokens } = require('~/server/services/AuthService');
const verifyGoogleMobileIdentity = require('~/server/services/auth/verifyGoogleMobileIdentity');
const resolveSocialLogin = require('~/server/services/auth/resolveSocialLogin');
const { googleMobileController } = require('./GoogleMobileController');

describe('googleMobileController', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: { idToken: 'id-token' } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('returns token and user on success', async () => {
    verifyGoogleMobileIdentity.mockResolvedValue({ email: 'chris@noblezilla.com' });
    resolveSocialLogin.mockResolvedValue({
      _id: 'user-1',
      email: 'chris@noblezilla.com',
      provider: 'google',
      toObject: () => ({
        _id: 'user-1',
        email: 'chris@noblezilla.com',
        provider: 'google',
      }),
    });

    await googleMobileController(req, res);

    expect(setAuthTokens).toHaveBeenCalledWith('user-1', res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      token: 'jwt-token',
      user: {
        _id: 'user-1',
        email: 'chris@noblezilla.com',
        provider: 'google',
        id: 'user-1',
      },
    });
  });

  it('returns temp token when 2FA is enabled', async () => {
    verifyGoogleMobileIdentity.mockResolvedValue({ email: 'chris@noblezilla.com' });
    resolveSocialLogin.mockResolvedValue({
      _id: 'user-1',
      twoFactorEnabled: true,
    });

    await googleMobileController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      twoFAPending: true,
      tempToken: 'temp-token',
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });
});
