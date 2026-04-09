jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => false),
  isEmailDomainAllowed: jest.fn(() => true),
}));

jest.mock('~/strategies/process', () => ({
  createSocialUser: jest.fn(),
  handleExistingUser: jest.fn(),
  migrateLocalUserToSocial: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('~/models', () => ({
  findUser: jest.fn(),
}));

const { ErrorTypes } = require('librechat-data-provider');
const { isEnabled, isEmailDomainAllowed } = require('@librechat/api');
const {
  createSocialUser,
  handleExistingUser,
  migrateLocalUserToSocial,
} = require('~/strategies/process');
const { findUser } = require('~/models');
const resolveSocialLogin = require('./resolveSocialLogin');

describe('resolveSocialLogin', () => {
  const identity = {
    email: 'chris@noblezilla.com',
    id: 'google-123',
    avatarUrl: 'https://example.com/avatar.png',
    username: 'chris',
    name: 'Chris Noble',
    emailVerified: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    isEmailDomainAllowed.mockReturnValue(true);
    isEnabled.mockReturnValue(false);
    findUser.mockResolvedValue(null);
  });

  it('migrates a verified local account to google', async () => {
    findUser.mockResolvedValue({
      _id: 'user-1',
      email: identity.email,
      provider: 'local',
    });
    migrateLocalUserToSocial.mockResolvedValue({ _id: 'user-1', provider: 'google' });

    const user = await resolveSocialLogin('google', identity);

    expect(migrateLocalUserToSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        existingUser: expect.objectContaining({ provider: 'local' }),
        provider: 'google',
        providerKey: 'googleId',
        providerId: 'google-123',
      }),
    );
    expect(user.provider).toBe('google');
    expect(createSocialUser).not.toHaveBeenCalled();
    expect(handleExistingUser).not.toHaveBeenCalled();
  });

  it('rejects an existing account with a conflicting provider', async () => {
    findUser.mockResolvedValue({
      _id: 'user-1',
      email: identity.email,
      provider: 'github',
    });

    await expect(resolveSocialLogin('google', identity)).rejects.toMatchObject({
      code: ErrorTypes.AUTH_FAILED,
      provider: 'github',
    });
  });
});
