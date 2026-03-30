const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const { createSocialUser, handleExistingUser } = require('./process');
const socialLogin = require('./socialLogin');
const { findUser } = require('~/models');
const { resolveAppConfigForUser } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');

jest.mock('@librechat/data-schemas', () => {
  const actualModule = jest.requireActual('@librechat/data-schemas');
  return {
    ...actualModule,
    logger: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  };
});

jest.mock('./process', () => ({
  createSocialUser: jest.fn(),
  handleExistingUser: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isEnabled: jest.fn().mockReturnValue(true),
  isEmailDomainAllowed: jest.fn().mockReturnValue(true),
  resolveAppConfigForUser: jest.fn().mockResolvedValue({
    fileStrategy: 'local',
    balance: { enabled: false },
  }),
}));

jest.mock('~/models', () => ({
  findUser: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({
    fileStrategy: 'local',
    balance: { enabled: false },
  }),
}));

describe('socialLogin', () => {
  const mockGetProfileDetails = ({ profile }) => ({
    email: profile.emails[0].value,
    id: profile.id,
    avatarUrl: profile.photos?.[0]?.value || null,
    username: profile.name?.givenName || 'user',
    name: `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim(),
    emailVerified: profile.emails[0].verified || false,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Finding users by provider ID', () => {
    it('should find user by provider ID (googleId) when email has changed', async () => {
      const provider = 'google';
      const googleId = 'google-user-123';
      const oldEmail = 'old@example.com';
      const newEmail = 'new@example.com';

      const existingUser = {
        _id: 'user123',
        email: oldEmail,
        provider: 'google',
        googleId: googleId,
      };

      findUser.mockResolvedValueOnce(existingUser).mockResolvedValueOnce(null);

      const mockProfile = {
        id: googleId,
        emails: [{ value: newEmail, verified: true }],
        photos: [{ value: 'https://example.com/avatar.png' }],
        name: { givenName: 'John', familyName: 'Doe' },
      };

      const loginFn = socialLogin(provider, mockGetProfileDetails);
      const callback = jest.fn();

      await loginFn(null, null, null, mockProfile, callback);

      expect(findUser).toHaveBeenNthCalledWith(1, { googleId: googleId });
      expect(findUser).toHaveBeenCalledTimes(1);

      expect(handleExistingUser).toHaveBeenCalledWith(
        existingUser,
        'https://example.com/avatar.png',
        expect.any(Object),
        newEmail,
      );

      expect(callback).toHaveBeenCalledWith(null, existingUser);
    });

    it('should find user by provider ID (facebookId) when using Facebook', async () => {
      const provider = 'facebook';
      const facebookId = 'fb-user-456';
      const email = 'user@example.com';

      const existingUser = {
        _id: 'user456',
        email: email,
        provider: 'facebook',
        facebookId: facebookId,
      };

      findUser.mockResolvedValue(existingUser);

      const mockProfile = {
        id: facebookId,
        emails: [{ value: email, verified: true }],
        photos: [{ value: 'https://example.com/fb-avatar.png' }],
        name: { givenName: 'Jane', familyName: 'Smith' },
      };

      const loginFn = socialLogin(provider, mockGetProfileDetails);
      const callback = jest.fn();

      await loginFn(null, null, null, mockProfile, callback);

      expect(findUser).toHaveBeenCalledWith({ facebookId: facebookId });
      expect(findUser.mock.calls[0]).toEqual([{ facebookId: facebookId }]);

      expect(handleExistingUser).toHaveBeenCalledWith(
        existingUser,
        'https://example.com/fb-avatar.png',
        expect.any(Object),
        email,
      );

      expect(callback).toHaveBeenCalledWith(null, existingUser);
    });

    it('should fallback to finding user by email if not found by provider ID', async () => {
      const provider = 'google';
      const googleId = 'google-user-789';
      const email = 'user@example.com';

      const existingUser = {
        _id: 'user789',
        email: email,
        provider: 'google',
        googleId: 'old-google-id',
      };

      findUser.mockResolvedValueOnce(null).mockResolvedValueOnce(existingUser);

      const mockProfile = {
        id: googleId,
        emails: [{ value: email, verified: true }],
        photos: [{ value: 'https://example.com/avatar.png' }],
        name: { givenName: 'Bob', familyName: 'Johnson' },
      };

      const loginFn = socialLogin(provider, mockGetProfileDetails);
      const callback = jest.fn();

      await loginFn(null, null, null, mockProfile, callback);

      expect(findUser).toHaveBeenNthCalledWith(1, { googleId: googleId });
      expect(findUser).toHaveBeenNthCalledWith(2, { email: email });
      expect(findUser).toHaveBeenCalledTimes(2);

      expect(logger.warn).toHaveBeenCalledWith(
        `[${provider}Login] User found by email: ${email} but not by ${provider}Id`,
      );

      expect(handleExistingUser).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(null, existingUser);
    });

    it('should create new user if not found by provider ID or email', async () => {
      const provider = 'google';
      const googleId = 'google-new-user';
      const email = 'newuser@example.com';

      const newUser = {
        _id: 'newuser123',
        email: email,
        provider: 'google',
        googleId: googleId,
      };

      findUser.mockResolvedValue(null);
      createSocialUser.mockResolvedValue(newUser);

      const mockProfile = {
        id: googleId,
        emails: [{ value: email, verified: true }],
        photos: [{ value: 'https://example.com/avatar.png' }],
        name: { givenName: 'New', familyName: 'User' },
      };

      const loginFn = socialLogin(provider, mockGetProfileDetails);
      const callback = jest.fn();

      await loginFn(null, null, null, mockProfile, callback);

      expect(findUser).toHaveBeenCalledTimes(2);

      expect(createSocialUser).toHaveBeenCalledWith({
        email: email,
        avatarUrl: 'https://example.com/avatar.png',
        provider: provider,
        providerKey: 'googleId',
        providerId: googleId,
        username: 'New',
        name: 'New User',
        emailVerified: true,
        appConfig: expect.any(Object),
      });

      expect(callback).toHaveBeenCalledWith(null, newUser);
    });
  });

  describe('Error handling', () => {
    it('should return error if user exists with different provider', async () => {
      const provider = 'google';
      const googleId = 'google-user-123';
      const email = 'user@example.com';

      const existingUser = {
        _id: 'user123',
        email: email,
        provider: 'local',
      };

      findUser.mockResolvedValueOnce(null).mockResolvedValueOnce(existingUser);

      const mockProfile = {
        id: googleId,
        emails: [{ value: email, verified: true }],
        photos: [{ value: 'https://example.com/avatar.png' }],
        name: { givenName: 'John', familyName: 'Doe' },
      };

      const loginFn = socialLogin(provider, mockGetProfileDetails);
      const callback = jest.fn();

      await loginFn(null, null, null, mockProfile, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ErrorTypes.AUTH_FAILED,
          provider: 'local',
        }),
      );

      expect(logger.info).toHaveBeenCalledWith(
        `[${provider}Login] User ${email} already exists with provider local`,
      );
    });
  });

  describe('Tenant-scoped config', () => {
    it('should call resolveAppConfigForUser for tenant user', async () => {
      const provider = 'google';
      const googleId = 'google-tenant-user';
      const email = 'tenant@example.com';

      const existingUser = {
        _id: 'userTenant',
        email,
        provider: 'google',
        googleId,
        tenantId: 'tenant-b',
        role: 'USER',
      };

      findUser.mockResolvedValue(existingUser);

      const mockProfile = {
        id: googleId,
        emails: [{ value: email, verified: true }],
        photos: [{ value: 'https://example.com/avatar.png' }],
        name: { givenName: 'Tenant', familyName: 'User' },
      };

      const loginFn = socialLogin(provider, mockGetProfileDetails);
      const callback = jest.fn();

      await loginFn(null, null, null, mockProfile, callback);

      expect(resolveAppConfigForUser).toHaveBeenCalledWith(getAppConfig, existingUser);
    });

    it('should use baseConfig for non-tenant user without calling resolveAppConfigForUser', async () => {
      const provider = 'google';
      const googleId = 'google-new-tenant';
      const email = 'new@example.com';

      findUser.mockResolvedValue(null);
      createSocialUser.mockResolvedValue({
        _id: 'newUser',
        email,
        provider: 'google',
        googleId,
      });

      const mockProfile = {
        id: googleId,
        emails: [{ value: email, verified: true }],
        photos: [{ value: 'https://example.com/avatar.png' }],
        name: { givenName: 'New', familyName: 'User' },
      };

      const loginFn = socialLogin(provider, mockGetProfileDetails);
      const callback = jest.fn();

      await loginFn(null, null, null, mockProfile, callback);

      expect(resolveAppConfigForUser).not.toHaveBeenCalled();
      expect(getAppConfig).toHaveBeenCalledWith({ baseOnly: true });
    });

    it('should block login when tenant config restricts the domain', async () => {
      const { isEmailDomainAllowed } = require('@librechat/api');
      const provider = 'google';
      const googleId = 'google-tenant-blocked';
      const email = 'blocked@example.com';

      const existingUser = {
        _id: 'userBlocked',
        email,
        provider: 'google',
        googleId,
        tenantId: 'tenant-restrict',
        role: 'USER',
      };

      findUser.mockResolvedValue(existingUser);
      resolveAppConfigForUser.mockResolvedValue({
        registration: { allowedDomains: ['other.com'] },
      });
      isEmailDomainAllowed.mockReturnValueOnce(true).mockReturnValueOnce(false);

      const mockProfile = {
        id: googleId,
        emails: [{ value: email, verified: true }],
        photos: [{ value: 'https://example.com/avatar.png' }],
        name: { givenName: 'Blocked', familyName: 'User' },
      };

      const loginFn = socialLogin(provider, mockGetProfileDetails);
      const callback = jest.fn();

      await loginFn(null, null, null, mockProfile, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Email domain not allowed' }),
      );
    });
  });
});
