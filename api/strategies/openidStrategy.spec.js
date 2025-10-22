const fetch = require('node-fetch');
const jwtDecode = require('jsonwebtoken/decode');
const { ErrorTypes } = require('librechat-data-provider');
const { findUser, createUser, updateUser } = require('~/models');
const { setupOpenId } = require('./openidStrategy');

// --- Mocks ---
jest.mock('node-fetch');
jest.mock('jsonwebtoken/decode');
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({
    saveBuffer: jest.fn().mockResolvedValue('/fake/path/to/avatar.png'),
  })),
}));
jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({}),
}));
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isEnabled: jest.fn(() => false),
  getBalanceConfig: jest.fn(() => ({
    enabled: false,
  })),
}));
jest.mock('~/models', () => ({
  findUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
}));
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/api'),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
  hashToken: jest.fn().mockResolvedValue('hashed-token'),
}));
jest.mock('~/cache/getLogStores', () =>
  jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
);

// Mock the openid-client module and all its dependencies
jest.mock('openid-client', () => {
  return {
    discovery: jest.fn().mockResolvedValue({
      clientId: 'fake_client_id',
      clientSecret: 'fake_client_secret',
      issuer: 'https://fake-issuer.com',
      // Add any other properties needed by the implementation
    }),
    fetchUserInfo: jest.fn().mockImplementation(() => {
      // Only return additional properties, but don't override any claims
      return Promise.resolve({});
    }),
    customFetch: Symbol('customFetch'),
  };
});

jest.mock('openid-client/passport', () => {
  let verifyCallback;
  const mockStrategy = jest.fn((options, verify) => {
    verifyCallback = verify;
    return { name: 'openid', options, verify };
  });

  return {
    Strategy: mockStrategy,
    __getVerifyCallback: () => verifyCallback,
  };
});

// Mock passport
jest.mock('passport', () => ({
  use: jest.fn(),
}));

describe('setupOpenId', () => {
  // Store a reference to the verify callback once it's set up
  let verifyCallback;

  // Helper to wrap the verify callback in a promise
  const validate = (tokenset) =>
    new Promise((resolve, reject) => {
      verifyCallback(tokenset, (err, user, details) => {
        if (err) {
          reject(err);
        } else {
          resolve({ user, details });
        }
      });
    });

  const tokenset = {
    id_token: 'fake_id_token',
    access_token: 'fake_access_token',
    claims: () => ({
      sub: '1234',
      email: 'test@example.com',
      email_verified: true,
      given_name: 'First',
      family_name: 'Last',
      name: 'My Full',
      preferred_username: 'testusername',
      username: 'flast',
      picture: 'https://example.com/avatar.png',
    }),
  };

  beforeEach(async () => {
    // Clear previous mock calls and reset implementations
    jest.clearAllMocks();

    // Reset environment variables needed by the strategy
    process.env.OPENID_ISSUER = 'https://fake-issuer.com';
    process.env.OPENID_CLIENT_ID = 'fake_client_id';
    process.env.OPENID_CLIENT_SECRET = 'fake_client_secret';
    process.env.DOMAIN_SERVER = 'https://example.com';
    process.env.OPENID_CALLBACK_URL = '/callback';
    process.env.OPENID_SCOPE = 'openid profile email';
    process.env.OPENID_REQUIRED_ROLE = 'requiredRole';
    process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH = 'roles';
    process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND = 'id';
    process.env.OPENID_ADMIN_ROLE = 'admin';
    process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH = 'permissions';
    process.env.OPENID_ADMIN_ROLE_TOKEN_KIND = 'id';
    delete process.env.OPENID_USERNAME_CLAIM;
    delete process.env.OPENID_NAME_CLAIM;
    delete process.env.PROXY;
    delete process.env.OPENID_USE_PKCE;

    // Default jwtDecode mock returns a token that includes the required role.
    jwtDecode.mockReturnValue({
      roles: ['requiredRole'],
      permissions: ['admin'],
    });

    // By default, assume that no user is found, so createUser will be called
    findUser.mockResolvedValue(null);
    createUser.mockImplementation(async (userData) => {
      // simulate created user with an _id property
      return { _id: 'newUserId', ...userData };
    });
    updateUser.mockImplementation(async (id, userData) => {
      return { _id: id, ...userData };
    });

    // For image download, simulate a successful response
    const fakeBuffer = Buffer.from('fake image');
    const fakeResponse = {
      ok: true,
      buffer: jest.fn().mockResolvedValue(fakeBuffer),
    };
    fetch.mockResolvedValue(fakeResponse);

    // Call the setup function and capture the verify callback
    await setupOpenId();
    verifyCallback = require('openid-client/passport').__getVerifyCallback();
  });

  it('should create a new user with correct username when preferred_username claim exists', async () => {
    // Arrange – our userinfo already has preferred_username 'testusername'
    const userinfo = tokenset.claims();

    // Act
    const { user } = await validate(tokenset);

    // Assert
    expect(user.username).toBe(userinfo.preferred_username);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openid',
        openidId: userinfo.sub,
        username: userinfo.preferred_username,
        email: userinfo.email,
        name: `${userinfo.given_name} ${userinfo.family_name}`,
      }),
      { enabled: false },
      true,
      true,
    );
  });

  it('should use username as username when preferred_username claim is missing', async () => {
    // Arrange – remove preferred_username from userinfo
    const userinfo = { ...tokenset.claims() };
    delete userinfo.preferred_username;
    // Expect the username to be the "username"
    const expectUsername = userinfo.username;

    // Act
    const { user } = await validate({ ...tokenset, claims: () => userinfo });

    // Assert
    expect(user.username).toBe(expectUsername);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: expectUsername }),
      { enabled: false },
      true,
      true,
    );
  });

  it('should use email as username when username and preferred_username are missing', async () => {
    // Arrange – remove username and preferred_username
    const userinfo = { ...tokenset.claims() };
    delete userinfo.username;
    delete userinfo.preferred_username;
    const expectUsername = userinfo.email;

    // Act
    const { user } = await validate({ ...tokenset, claims: () => userinfo });

    // Assert
    expect(user.username).toBe(expectUsername);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: expectUsername }),
      { enabled: false },
      true,
      true,
    );
  });

  it('should override username with OPENID_USERNAME_CLAIM when set', async () => {
    // Arrange – set OPENID_USERNAME_CLAIM so that the sub claim is used
    process.env.OPENID_USERNAME_CLAIM = 'sub';
    const userinfo = tokenset.claims();

    // Act
    const { user } = await validate(tokenset);

    // Assert – username should equal the sub (converted as-is)
    expect(user.username).toBe(userinfo.sub);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: userinfo.sub }),
      { enabled: false },
      true,
      true,
    );
  });

  it('should set the full name correctly when given_name and family_name exist', async () => {
    // Arrange
    const userinfo = tokenset.claims();
    const expectedFullName = `${userinfo.given_name} ${userinfo.family_name}`;

    // Act
    const { user } = await validate(tokenset);

    // Assert
    expect(user.name).toBe(expectedFullName);
  });

  it('should override full name with OPENID_NAME_CLAIM when set', async () => {
    // Arrange – use the name claim as the full name
    process.env.OPENID_NAME_CLAIM = 'name';
    const userinfo = { ...tokenset.claims(), name: 'Custom Name' };

    // Act
    const { user } = await validate({ ...tokenset, claims: () => userinfo });

    // Assert
    expect(user.name).toBe('Custom Name');
  });

  it('should update an existing user on login', async () => {
    // Arrange – simulate that a user already exists with openid provider
    const existingUser = {
      _id: 'existingUserId',
      provider: 'openid',
      email: tokenset.claims().email,
      openidId: '',
      username: '',
      name: '',
    };
    findUser.mockImplementation(async (query) => {
      if (query.openidId === tokenset.claims().sub || query.email === tokenset.claims().email) {
        return existingUser;
      }
      return null;
    });

    const userinfo = tokenset.claims();

    // Act
    await validate(tokenset);

    // Assert – updateUser should be called and the user object updated
    expect(updateUser).toHaveBeenCalledWith(
      existingUser._id,
      expect.objectContaining({
        provider: 'openid',
        openidId: userinfo.sub,
        username: userinfo.preferred_username,
        name: `${userinfo.given_name} ${userinfo.family_name}`,
      }),
    );
  });

  it('should block login when email exists with different provider', async () => {
    // Arrange – simulate that a user exists with same email but different provider
    const existingUser = {
      _id: 'existingUserId',
      provider: 'google',
      email: tokenset.claims().email,
      googleId: 'some-google-id',
      username: 'existinguser',
      name: 'Existing User',
    };
    findUser.mockImplementation(async (query) => {
      if (query.email === tokenset.claims().email && !query.provider) {
        return existingUser;
      }
      return null;
    });

    // Act
    const result = await validate(tokenset);

    // Assert – verify that the strategy rejects login
    expect(result.user).toBe(false);
    expect(result.details.message).toBe(ErrorTypes.AUTH_FAILED);
    expect(createUser).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('should enforce the required role and reject login if missing', async () => {
    // Arrange – simulate a token without the required role.
    jwtDecode.mockReturnValue({
      roles: ['SomeOtherRole'],
    });

    // Act
    const { user, details } = await validate(tokenset);

    // Assert – verify that the strategy rejects login
    expect(user).toBe(false);
    expect(details.message).toBe('You must have "requiredRole" role to log in.');
  });

  it('should allow login when single required role is present (backward compatibility)', async () => {
    // Arrange – ensure single role configuration (as set in beforeEach)
    // OPENID_REQUIRED_ROLE = 'requiredRole'
    // Default jwtDecode mock in beforeEach already returns this role
    jwtDecode.mockReturnValue({
      roles: ['requiredRole', 'anotherRole'],
    });

    // Act
    const { user } = await validate(tokenset);

    // Assert – verify that login succeeds with single role configuration
    expect(user).toBeTruthy();
    expect(user.email).toBe(tokenset.claims().email);
    expect(user.username).toBe(tokenset.claims().preferred_username);
    expect(createUser).toHaveBeenCalled();
  });

  it('should attempt to download and save the avatar if picture is provided', async () => {
    // Act
    const { user } = await validate(tokenset);

    // Assert – verify that download was attempted and the avatar field was set via updateUser
    expect(fetch).toHaveBeenCalled();
    // Our mock getStrategyFunctions.saveBuffer returns '/fake/path/to/avatar.png'
    expect(user.avatar).toBe('/fake/path/to/avatar.png');
  });

  it('should not attempt to download avatar if picture is not provided', async () => {
    // Arrange – remove picture
    const userinfo = { ...tokenset.claims() };
    delete userinfo.picture;

    // Act
    await validate({ ...tokenset, claims: () => userinfo });

    // Assert – fetch should not be called and avatar should remain undefined or empty
    expect(fetch).not.toHaveBeenCalled();
    // Depending on your implementation, user.avatar may be undefined or an empty string.
  });

  it('should support comma-separated multiple roles', async () => {
    // Arrange
    process.env.OPENID_REQUIRED_ROLE = 'someRole,anotherRole,admin';
    await setupOpenId(); // Re-initialize the strategy
    verifyCallback = require('openid-client/passport').__getVerifyCallback();
    jwtDecode.mockReturnValue({
      roles: ['anotherRole', 'aThirdRole'],
    });

    // Act
    const { user } = await validate(tokenset);

    // Assert
    expect(user).toBeTruthy();
    expect(user.email).toBe(tokenset.claims().email);
  });

  it('should reject login when user has none of the required multiple roles', async () => {
    // Arrange
    process.env.OPENID_REQUIRED_ROLE = 'someRole,anotherRole,admin';
    await setupOpenId(); // Re-initialize the strategy
    verifyCallback = require('openid-client/passport').__getVerifyCallback();
    jwtDecode.mockReturnValue({
      roles: ['aThirdRole', 'aFourthRole'],
    });

    // Act
    const { user, details } = await validate(tokenset);

    // Assert
    expect(user).toBe(false);
    expect(details.message).toBe(
      'You must have one of: "someRole", "anotherRole", "admin" role to log in.',
    );
  });

  it('should handle spaces in comma-separated roles', async () => {
    // Arrange
    process.env.OPENID_REQUIRED_ROLE = ' someRole , anotherRole , admin ';
    await setupOpenId(); // Re-initialize the strategy
    verifyCallback = require('openid-client/passport').__getVerifyCallback();
    jwtDecode.mockReturnValue({
      roles: ['someRole'],
    });

    // Act
    const { user } = await validate(tokenset);

    // Assert
    expect(user).toBeTruthy();
  });

  it('should default to usePKCE false when OPENID_USE_PKCE is not defined', async () => {
    const OpenIDStrategy = require('openid-client/passport').Strategy;

    delete process.env.OPENID_USE_PKCE;
    await setupOpenId();

    const callOptions = OpenIDStrategy.mock.calls[OpenIDStrategy.mock.calls.length - 1][0];
    expect(callOptions.usePKCE).toBe(false);
    expect(callOptions.params?.code_challenge_method).toBeUndefined();
  });

  it('should set role to "ADMIN" if OPENID_ADMIN_ROLE is set and user has that role', async () => {
    // Act
    const { user } = await validate(tokenset);

    // Assert – verify that the user role is set to "ADMIN"
    expect(user.role).toBe('ADMIN');
  });

  it('should not set user role if OPENID_ADMIN_ROLE is set but the user does not have that role', async () => {
    // Arrange – simulate a token without the admin permission
    jwtDecode.mockReturnValue({
      roles: ['requiredRole'],
      permissions: ['not-admin'],
    });

    // Act
    const { user } = await validate(tokenset);

    // Assert – verify that the user role is not defined
    expect(user.role).toBeUndefined();
  });

  it('should demote existing admin user when admin role is removed from token', async () => {
    // Arrange – simulate an existing user who is currently an admin
    const existingAdminUser = {
      _id: 'existingAdminId',
      provider: 'openid',
      email: tokenset.claims().email,
      openidId: tokenset.claims().sub,
      username: 'adminuser',
      name: 'Admin User',
      role: 'ADMIN',
    };

    findUser.mockImplementation(async (query) => {
      if (query.openidId === tokenset.claims().sub || query.email === tokenset.claims().email) {
        return existingAdminUser;
      }
      return null;
    });

    // Token without admin permission
    jwtDecode.mockReturnValue({
      roles: ['requiredRole'],
      permissions: ['not-admin'],
    });

    const { logger } = require('@librechat/data-schemas');

    // Act
    const { user } = await validate(tokenset);

    // Assert – verify that the user was demoted
    expect(user.role).toBe('USER');
    expect(updateUser).toHaveBeenCalledWith(
      existingAdminUser._id,
      expect.objectContaining({
        role: 'USER',
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('demoted from admin - role no longer present in token'),
    );
  });

  it('should NOT demote admin user when admin role env vars are not configured', async () => {
    // Arrange – remove admin role env vars
    delete process.env.OPENID_ADMIN_ROLE;
    delete process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH;
    delete process.env.OPENID_ADMIN_ROLE_TOKEN_KIND;

    await setupOpenId();
    verifyCallback = require('openid-client/passport').__getVerifyCallback();

    // Simulate an existing admin user
    const existingAdminUser = {
      _id: 'existingAdminId',
      provider: 'openid',
      email: tokenset.claims().email,
      openidId: tokenset.claims().sub,
      username: 'adminuser',
      name: 'Admin User',
      role: 'ADMIN',
    };

    findUser.mockImplementation(async (query) => {
      if (query.openidId === tokenset.claims().sub || query.email === tokenset.claims().email) {
        return existingAdminUser;
      }
      return null;
    });

    jwtDecode.mockReturnValue({
      roles: ['requiredRole'],
    });

    // Act
    const { user } = await validate(tokenset);

    // Assert – verify that the admin user was NOT demoted
    expect(user.role).toBe('ADMIN');
    expect(updateUser).toHaveBeenCalledWith(
      existingAdminUser._id,
      expect.objectContaining({
        role: 'ADMIN',
      }),
    );
  });

  describe('lodash get - nested path extraction', () => {
    it('should extract roles from deeply nested token path', async () => {
      process.env.OPENID_REQUIRED_ROLE = 'app-user';
      process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH = 'resource_access.my-client.roles';

      jwtDecode.mockReturnValue({
        resource_access: {
          'my-client': {
            roles: ['app-user', 'viewer'],
          },
        },
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(user).toBeTruthy();
      expect(user.email).toBe(tokenset.claims().email);
    });

    it('should extract roles from three-level nested path', async () => {
      process.env.OPENID_REQUIRED_ROLE = 'editor';
      process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH = 'data.access.permissions.roles';

      jwtDecode.mockReturnValue({
        data: {
          access: {
            permissions: {
              roles: ['editor', 'reader'],
            },
          },
        },
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(user).toBeTruthy();
    });

    it('should log error and reject login when required role path does not exist in token', async () => {
      const { logger } = require('@librechat/data-schemas');
      process.env.OPENID_REQUIRED_ROLE = 'app-user';
      process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH = 'resource_access.nonexistent.roles';

      jwtDecode.mockReturnValue({
        resource_access: {
          'my-client': {
            roles: ['app-user'],
          },
        },
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user, details } = await validate(tokenset);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Key 'resource_access.nonexistent.roles' not found or invalid type in id token!",
        ),
      );
      expect(user).toBe(false);
      expect(details.message).toContain('role to log in');
    });

    it('should handle missing intermediate nested path gracefully', async () => {
      const { logger } = require('@librechat/data-schemas');
      process.env.OPENID_REQUIRED_ROLE = 'user';
      process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH = 'org.team.roles';

      jwtDecode.mockReturnValue({
        org: {
          other: 'value',
        },
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Key 'org.team.roles' not found or invalid type in id token!"),
      );
      expect(user).toBe(false);
    });

    it('should extract admin role from nested path in access token', async () => {
      process.env.OPENID_ADMIN_ROLE = 'admin';
      process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH = 'realm_access.roles';
      process.env.OPENID_ADMIN_ROLE_TOKEN_KIND = 'access';

      jwtDecode.mockImplementation((token) => {
        if (token === 'fake_access_token') {
          return {
            realm_access: {
              roles: ['admin', 'user'],
            },
          };
        }
        return {
          roles: ['requiredRole'],
        };
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(user.role).toBe('ADMIN');
    });

    it('should extract admin role from nested path in userinfo', async () => {
      process.env.OPENID_ADMIN_ROLE = 'admin';
      process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH = 'organization.permissions';
      process.env.OPENID_ADMIN_ROLE_TOKEN_KIND = 'userinfo';

      const userinfoWithNestedGroups = {
        ...tokenset.claims(),
        organization: {
          permissions: ['admin', 'write'],
        },
      };

      require('openid-client').fetchUserInfo.mockResolvedValue({
        organization: {
          permissions: ['admin', 'write'],
        },
      });

      jwtDecode.mockReturnValue({
        roles: ['requiredRole'],
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate({
        ...tokenset,
        claims: () => userinfoWithNestedGroups,
      });

      expect(user.role).toBe('ADMIN');
    });

    it('should handle boolean admin role value', async () => {
      process.env.OPENID_ADMIN_ROLE = 'admin';
      process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH = 'is_admin';

      jwtDecode.mockReturnValue({
        roles: ['requiredRole'],
        is_admin: true,
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(user.role).toBe('ADMIN');
    });

    it('should handle string admin role value matching exactly', async () => {
      process.env.OPENID_ADMIN_ROLE = 'super-admin';
      process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH = 'role';

      jwtDecode.mockReturnValue({
        roles: ['requiredRole'],
        role: 'super-admin',
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(user.role).toBe('ADMIN');
    });

    it('should not set admin role when string value does not match', async () => {
      process.env.OPENID_ADMIN_ROLE = 'super-admin';
      process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH = 'role';

      jwtDecode.mockReturnValue({
        roles: ['requiredRole'],
        role: 'regular-user',
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(user.role).toBeUndefined();
    });

    it('should handle array admin role value', async () => {
      process.env.OPENID_ADMIN_ROLE = 'site-admin';
      process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH = 'app_roles';

      jwtDecode.mockReturnValue({
        roles: ['requiredRole'],
        app_roles: ['user', 'site-admin', 'moderator'],
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(user.role).toBe('ADMIN');
    });

    it('should not set admin when role is not in array', async () => {
      process.env.OPENID_ADMIN_ROLE = 'site-admin';
      process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH = 'app_roles';

      jwtDecode.mockReturnValue({
        roles: ['requiredRole'],
        app_roles: ['user', 'moderator'],
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(user.role).toBeUndefined();
    });

    it('should handle nested path with special characters in keys', async () => {
      process.env.OPENID_REQUIRED_ROLE = 'app-user';
      process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH = 'resource_access.my-app-123.roles';

      jwtDecode.mockReturnValue({
        resource_access: {
          'my-app-123': {
            roles: ['app-user'],
          },
        },
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(user).toBeTruthy();
    });

    it('should handle empty object at nested path', async () => {
      const { logger } = require('@librechat/data-schemas');
      process.env.OPENID_REQUIRED_ROLE = 'user';
      process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH = 'access.roles';

      jwtDecode.mockReturnValue({
        access: {},
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Key 'access.roles' not found or invalid type in id token!"),
      );
      expect(user).toBe(false);
    });

    it('should handle null value at intermediate path', async () => {
      const { logger } = require('@librechat/data-schemas');
      process.env.OPENID_REQUIRED_ROLE = 'user';
      process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH = 'data.roles';

      jwtDecode.mockReturnValue({
        data: null,
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Key 'data.roles' not found or invalid type in id token!"),
      );
      expect(user).toBe(false);
    });

    it('should reject login with invalid admin role token kind', async () => {
      process.env.OPENID_ADMIN_ROLE = 'admin';
      process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH = 'roles';
      process.env.OPENID_ADMIN_ROLE_TOKEN_KIND = 'invalid';

      const { logger } = require('@librechat/data-schemas');

      jwtDecode.mockReturnValue({
        roles: ['requiredRole', 'admin'],
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      await expect(validate(tokenset)).rejects.toThrow('Invalid admin role token kind');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Invalid admin role token kind: invalid. Must be one of 'access', 'id', or 'userinfo'",
        ),
      );
    });

    it('should reject login when roles path returns invalid type (object)', async () => {
      const { logger } = require('@librechat/data-schemas');
      process.env.OPENID_REQUIRED_ROLE = 'app-user';
      process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH = 'roles';

      jwtDecode.mockReturnValue({
        roles: { admin: true, user: false },
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user, details } = await validate(tokenset);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Key 'roles' not found or invalid type in id token!"),
      );
      expect(user).toBe(false);
      expect(details.message).toContain('role to log in');
    });

    it('should reject login when roles path returns invalid type (number)', async () => {
      const { logger } = require('@librechat/data-schemas');
      process.env.OPENID_REQUIRED_ROLE = 'user';
      process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH = 'roleCount';

      jwtDecode.mockReturnValue({
        roleCount: 5,
      });

      await setupOpenId();
      verifyCallback = require('openid-client/passport').__getVerifyCallback();

      const { user } = await validate(tokenset);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Key 'roleCount' not found or invalid type in id token!"),
      );
      expect(user).toBe(false);
    });
  });
});
