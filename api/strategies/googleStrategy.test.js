let mockSetCredentials;
let mockOAuth2;
let mockCloudidentity;
let mockGroupsLookup;
let mockCheckTransitiveMembership;

jest.mock('@googleapis/cloudidentity', () => {
  mockSetCredentials = jest.fn();
  mockOAuth2 = jest.fn().mockImplementation(() => ({
    setCredentials: mockSetCredentials,
  }));

  mockGroupsLookup = jest.fn();
  mockCheckTransitiveMembership = jest.fn();
  mockCloudidentity = jest.fn().mockImplementation(({ auth }) => ({
    auth,
    groups: {
      lookup: mockGroupsLookup,
      memberships: {
        checkTransitiveMembership: mockCheckTransitiveMembership,
      },
    },
  }));

  return {
    cloudidentity_v1: {
      Cloudidentity: mockCloudidentity,
    },
    auth: {
      OAuth2: mockOAuth2,
    },
  };
});

let mockSocialLogin;
let mockSocialLoginHandler;

jest.mock('./socialLogin', () => {
  mockSocialLoginHandler = jest.fn();
  mockSocialLogin = jest.fn(() => mockSocialLoginHandler);
  return mockSocialLogin;
});

describe('googleStrategy', () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = OLD_ENV;
    jest.clearAllMocks();
  });

  const requireGoogleStrategy = (env = {}) => {
    jest.resetModules();
    process.env = { ...OLD_ENV, ...env };
    if (!Object.prototype.hasOwnProperty.call(env, 'GOOGLE_WORKSPACE_GROUP')) {
      delete process.env.GOOGLE_WORKSPACE_GROUP;
    }
    return require('./googleStrategy');
  };

  describe('getGoogleScopes', () => {
    it('should return base scopes when group restriction is disabled', () => {
      const { getGoogleScopes } = requireGoogleStrategy({ GOOGLE_WORKSPACE_GROUP: '' });

      expect(getGoogleScopes()).toEqual(['openid', 'profile', 'email']);
    });

    it('should include Cloud Identity scope when group restriction is enabled', () => {
      const { getGoogleScopes } = requireGoogleStrategy({
        GOOGLE_WORKSPACE_GROUP: 'group@example.com',
      });

      expect(getGoogleScopes()).toEqual([
        'openid',
        'profile',
        'email',
        'https://www.googleapis.com/auth/cloud-identity.groups.readonly',
      ]);
    });

    it('should return a copy of scopes to prevent mutation', () => {
      const { getGoogleScopes } = requireGoogleStrategy({
        GOOGLE_WORKSPACE_GROUP: 'group@example.com',
      });
      const scopes = getGoogleScopes();

      scopes.push('mutated');

      expect(getGoogleScopes()).not.toContain('mutated');
    });
  });

  describe('checkGroupMembership', () => {
    it('should return true when group restriction is disabled', async () => {
      const { checkGroupMembership } = requireGoogleStrategy({ GOOGLE_WORKSPACE_GROUP: '' });

      await expect(checkGroupMembership('access-token', 'user@example.com')).resolves.toBe(true);
      expect(mockOAuth2).not.toHaveBeenCalled();
      expect(mockCloudidentity).not.toHaveBeenCalled();
    });

    it('should return false when access token is missing', async () => {
      const { checkGroupMembership } = requireGoogleStrategy({
        GOOGLE_WORKSPACE_GROUP: 'group@example.com',
      });
      const { logger } = require('~/config');

      await expect(checkGroupMembership(undefined, 'user@example.com')).resolves.toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        '[checkGroupMembership] Missing or invalid access token for group membership check',
      );
      expect(mockCloudidentity).not.toHaveBeenCalled();
    });

    it('should return false when user email is invalid for query', async () => {
      const { checkGroupMembership } = requireGoogleStrategy({
        GOOGLE_WORKSPACE_GROUP: 'group@example.com',
      });
      const { logger } = require('~/config');

      await expect(checkGroupMembership('access-token', "bad'user@example.com")).resolves.toBe(
        false,
      );
      expect(logger.error).toHaveBeenCalledWith(
        '[checkGroupMembership] Missing or invalid user email for group membership query',
      );
      expect(mockCloudidentity).not.toHaveBeenCalled();
    });

    it('should return false when group resource name is not found', async () => {
      const { checkGroupMembership } = requireGoogleStrategy({
        GOOGLE_WORKSPACE_GROUP: 'group@example.com',
      });
      const { logger } = require('~/config');

      mockGroupsLookup.mockResolvedValue({ data: {} });

      await expect(checkGroupMembership('access-token', 'user@example.com')).resolves.toBe(false);
      expect(mockGroupsLookup).toHaveBeenCalledWith({ 'groupKey.id': 'group@example.com' });
      expect(logger.error).toHaveBeenCalledWith(
        '[checkGroupMembership] Could not find group resource name for configured group',
        { groupEmail: 'group@example.com' },
      );
      expect(mockCheckTransitiveMembership).not.toHaveBeenCalled();
    });

    it('should return false and log when Cloud Identity group lookup fails', async () => {
      const { checkGroupMembership } = requireGoogleStrategy({
        GOOGLE_WORKSPACE_GROUP: 'group@example.com',
      });
      const { logger } = require('~/config');

      const error = new Error('lookup failed');
      mockGroupsLookup.mockRejectedValue(error);

      await expect(checkGroupMembership('access-token', 'user@example.com')).resolves.toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        '[getGroupResourceName] Error looking up group: group@example.com',
        error,
      );
      expect(logger.error).toHaveBeenCalledWith(
        '[checkGroupMembership] Could not find group resource name for configured group',
        { groupEmail: 'group@example.com' },
      );
      expect(mockCheckTransitiveMembership).not.toHaveBeenCalled();
    });

    it('should return true when user is a transitive member of the configured group', async () => {
      const { checkGroupMembership } = requireGoogleStrategy({
        GOOGLE_WORKSPACE_GROUP: 'group@example.com',
      });

      mockGroupsLookup.mockResolvedValue({ data: { name: 'groups/123' } });
      mockCheckTransitiveMembership.mockResolvedValue({ data: { hasMembership: true } });

      await expect(checkGroupMembership('access-token', 'user@example.com')).resolves.toBe(true);
      expect(mockOAuth2).toHaveBeenCalledTimes(1);
      expect(mockSetCredentials).toHaveBeenCalledWith({ access_token: 'access-token' });
      expect(mockCloudidentity).toHaveBeenCalledTimes(1);
      expect(mockGroupsLookup).toHaveBeenCalledWith({ 'groupKey.id': 'group@example.com' });
      expect(mockCheckTransitiveMembership).toHaveBeenCalledWith({
        parent: 'groups/123',
        query: "member_key_id == 'user@example.com'",
      });
    });

    it('should return false when user is not a transitive member of the configured group', async () => {
      const { checkGroupMembership } = requireGoogleStrategy({
        GOOGLE_WORKSPACE_GROUP: 'group@example.com',
      });

      mockGroupsLookup.mockResolvedValue({ data: { name: 'groups/123' } });
      mockCheckTransitiveMembership.mockResolvedValue({ data: { hasMembership: false } });

      await expect(checkGroupMembership('access-token', 'user@example.com')).resolves.toBe(false);
    });

    it('should return false and log when Cloud Identity membership check fails', async () => {
      const { checkGroupMembership } = requireGoogleStrategy({
        GOOGLE_WORKSPACE_GROUP: 'group@example.com',
      });
      const { logger } = require('~/config');

      mockGroupsLookup.mockResolvedValue({ data: { name: 'groups/123' } });
      const error = new Error('api failed');
      mockCheckTransitiveMembership.mockRejectedValue(error);

      await expect(checkGroupMembership('access-token', 'user@example.com')).resolves.toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        '[checkGroupMembership] Error checking group membership:',
        {
          error,
        },
      );
    });
  });

  describe('strategy verify callback', () => {
    it('should pass accessToken to authInfo via done callback', async () => {
      const { strategy } = requireGoogleStrategy({
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_CALLBACK_URL: '/oauth/google/callback',
        DOMAIN_SERVER: 'https://example.com',
      });

      mockSocialLoginHandler.mockImplementation(
        (accessToken, refreshToken, idToken, profile, cb) => {
          cb(null, { id: 'user123' });
        },
      );

      const googleStrategy = strategy();
      const done = jest.fn();
      const profile = {
        emails: [{ value: 'user@example.com', verified: true }],
        photos: [{ value: '' }],
        name: {},
      };

      await googleStrategy._verify(
        'access-token',
        'refresh-token',
        { id_token: 'id-token-123' },
        profile,
        done,
      );

      expect(mockSocialLogin).toHaveBeenCalledWith('google', expect.any(Function));
      expect(mockSocialLoginHandler).toHaveBeenCalledWith(
        'access-token',
        'refresh-token',
        'id-token-123',
        profile,
        expect.any(Function),
      );
      expect(done).toHaveBeenCalledWith(null, { id: 'user123' }, { accessToken: 'access-token' });
    });

    it('should call done with error when social login fails', async () => {
      const { strategy } = requireGoogleStrategy({
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_CALLBACK_URL: '/oauth/google/callback',
        DOMAIN_SERVER: 'https://example.com',
      });

      const error = new Error('social login failed');
      mockSocialLoginHandler.mockImplementation(
        (accessToken, refreshToken, idToken, profile, cb) => {
          cb(error);
        },
      );

      const googleStrategy = strategy();
      const done = jest.fn();

      await googleStrategy._verify('access-token', 'refresh-token', {}, {}, done);

      expect(done).toHaveBeenCalledWith(error);
    });
  });
});
