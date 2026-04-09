jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('~/server/services/auth/resolveSocialLogin', () => jest.fn());

const resolveSocialLogin = require('~/server/services/auth/resolveSocialLogin');
const socialLogin = require('./socialLogin');

describe('socialLogin', () => {
  const getProfileDetails = jest.fn();
  const verify = socialLogin('google', getProfileDetails);

  const callVerify = () =>
    new Promise((resolve, reject) => {
      verify('access', 'refresh', 'idtoken', { raw: true }, (err, user) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(user);
      });
    });

  beforeEach(() => {
    jest.clearAllMocks();
    getProfileDetails.mockReturnValue({
      email: 'chris@noblezilla.com',
      id: 'google-123',
      avatarUrl: 'https://example.com/avatar.png',
      username: 'chris',
      name: 'Chris Noble',
      emailVerified: true,
    });
    resolveSocialLogin.mockResolvedValue({
      _id: 'user-1',
      email: 'chris@noblezilla.com',
      provider: 'google',
      googleId: 'google-123',
    });
  });

  it('delegates account resolution to the shared resolver', async () => {
    const user = await callVerify();

    expect(resolveSocialLogin).toHaveBeenCalledWith(
      'google',
      expect.objectContaining({
        email: 'chris@noblezilla.com',
        id: 'google-123',
        emailVerified: true,
      }),
    );
    expect(user.provider).toBe('google');
  });

  it('returns shared resolver errors through the callback', async () => {
    const error = new Error('Social registration is disabled');
    error.code = 'auth_failed';
    resolveSocialLogin.mockRejectedValue(error);

    await expect(callVerify()).rejects.toMatchObject({
      message: 'Social registration is disabled',
    });
  });
});
