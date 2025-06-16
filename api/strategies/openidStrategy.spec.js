const passport = require('passport');
const mongoose = require('mongoose');
// --- Mocks ---
jest.mock('jsonwebtoken/decode');

jest.mock('~/server/services/Config', () => ({
  getBalanceConfig: jest.fn(() => ({
    enabled: false,
  })),
}));

const mockedMethods = {
  findUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
};

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    createMethods: jest.fn(() => mockedMethods),
  };
});

jest.mock('~/server/utils/crypto', () => ({
  hashToken: jest.fn().mockResolvedValue('hashed-token'),
}));
jest.mock('~/server/utils', () => ({
  isEnabled: jest.fn(() => false),
}));
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));
jest.mock('~/cache/getLogStores', () =>
  jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
);

// Mock the openid-client module and all its dependencies
jest.mock('openid-client', () => {
  const actual = jest.requireActual('openid-client');
  return {
    ...actual,
    discovery: jest.fn().mockResolvedValue({
      clientId: 'fake_client_id',
      clientSecret: 'fake_client_secret',
      issuer: 'https://fake-issuer.com',
      // Add any other properties needed by the implementation
    }),
    fetchUserInfo: jest.fn().mockImplementation((config, accessToken, sub) => {
      // Only return additional properties, but don't override any claims
      return Promise.resolve({
        preferred_username: 'preferred_username',
      });
    }),
    customFetch: Symbol('customFetch'),
  };
});

jest.mock('openid-client/passport', () => {
  let verifyCallback;
  const mockConstructor = jest.fn((options, verify) => {
    verifyCallback = verify;
    return {
      name: 'openid',
      options,
      verify,
    };
  });

  return {
    Strategy: mockConstructor,
    __getVerifyCallback: () => verifyCallback,
  };
});

// Mock passport
jest.mock('passport', () => ({
  use: jest.fn(),
}));

const jwtDecode = require('jsonwebtoken/decode');

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
    delete process.env.OPENID_USERNAME_CLAIM;
    delete process.env.OPENID_NAME_CLAIM;
    delete process.env.PROXY;
    delete process.env.OPENID_USE_PKCE;

    // Default jwtDecode mock returns a token that includes the required role.
    jwtDecode.mockReturnValue({
      roles: ['requiredRole'],
    });

    // By default, assume that no user is found, so createUser will be called
    mockedMethods.findUser.mockResolvedValue(null);
    mockedMethods.createUser.mockImplementation(async (userData) => {
      // simulate created user with an _id property
      return { _id: 'newUserId', ...userData };
    });
    mockedMethods.updateUser.mockImplementation(async (id, userData) => {
      return { _id: id, ...userData };
    });

    // For image download, simulate a successful response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('fake image')),
    });
    // const { initAuth, setupOpenId } = require('@librechat/auth');
    const { setupOpenId } = require('../../packages/auth/src/strategies/openidStrategy');
    const { initAuth } = require('../../packages/auth/src/initAuth');
    const saveBufferMock = jest.fn().mockResolvedValue('/fake/path/to/avatar.png');
    await initAuth(mongoose, { enabled: false }, saveBufferMock); // mongoose: {}, fake balance config, dummy saveBuffer

    const openidLogin = await setupOpenId({});

    // Simulate the app's `passport.use(...)`
    passport.use('openid', openidLogin);

    verifyCallback = require('openid-client/passport').__getVerifyCallback();
  });

  it('should create a new user with correct username when username claim exists', async () => {
    // Arrange – our userinfo already has username 'flast'
    const userinfo = tokenset.claims();

    // Act
    const { user } = await validate(tokenset);

    // Assert
    expect(user.username).toBe(userinfo.username);
    expect(mockedMethods.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openid',
        openidId: userinfo.sub,
        username: userinfo.username,
        email: userinfo.email,
        name: `${userinfo.given_name} ${userinfo.family_name}`,
      }),
      { enabled: false },
      true,
      true,
    );
  });

  it('should use given_name as username when username claim is missing', async () => {
    // Arrange – remove username from userinfo
    const userinfo = { ...tokenset.claims() };
    delete userinfo.username;
    // Expect the username to be the given name (unchanged case)
    const expectUsername = userinfo.given_name;

    // Act
    const { user } = await validate({ ...tokenset, claims: () => userinfo });

    // Assert
    expect(user.username).toBe(expectUsername);
    expect(mockedMethods.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: expectUsername }),
      { enabled: false },
      true,
      true,
    );
  });

  it('should use email as username when username and given_name are missing', async () => {
    // Arrange – remove username and given_name
    const userinfo = { ...tokenset.claims() };
    delete userinfo.username;
    delete userinfo.given_name;
    const expectUsername = userinfo.email;

    // Act
    const { user } = await validate({ ...tokenset, claims: () => userinfo });

    // Assert
    expect(user.username).toBe(expectUsername);
    expect(mockedMethods.createUser).toHaveBeenCalledWith(
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
    expect(mockedMethods.createUser).toHaveBeenCalledWith(
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
    // Arrange – simulate that a user already exists
    const existingUser = {
      _id: 'existingUserId',
      provider: 'local',
      email: tokenset.claims().email,
      openidId: '',
      username: '',
      name: '',
    };
    mockedMethods.findUser.mockImplementation(async (query) => {
      if (query.openidId === tokenset.claims().sub || query.email === tokenset.claims().email) {
        return existingUser;
      }
      return null;
    });

    const userinfo = tokenset.claims();

    // Act
    await validate(tokenset);

    // Assert – updateUser should be called and the user object updated
    expect(mockedMethods.updateUser).toHaveBeenCalledWith(
      existingUser._id,
      expect.objectContaining({
        provider: 'openid',
        openidId: userinfo.sub,
        username: userinfo.username,
        name: `${userinfo.given_name} ${userinfo.family_name}`,
      }),
    );
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
    expect(details.message).toBe('You must have the "requiredRole" role to log in.');
  });

  it('should attempt to download and save the avatar if picture is provided', async () => {
    // Act
    const { user } = await validate(tokenset);

    // Assert – verify that download was attempted and the avatar field was set via updateUser
    expect(global.fetch).toHaveBeenCalled();

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
    expect(global.fetch).not.toHaveBeenCalled();
    // Depending on your implementation, user.avatar may be undefined or an empty string.
  });

  it('should default to usePKCE false when OPENID_USE_PKCE is not defined', async () => {
    const OpenIDStrategy = require('openid-client/passport').Strategy;

    delete process.env.OPENID_USE_PKCE;
    const { setupOpenId } = require('../../packages/auth/src/strategies/openidStrategy');
    await setupOpenId({});

    const callOptions = OpenIDStrategy.mock.calls[OpenIDStrategy.mock.calls.length - 1][0];
    expect(callOptions.usePKCE).toBe(false);
    expect(callOptions.params?.code_challenge_method).toBeUndefined();
  });
});
