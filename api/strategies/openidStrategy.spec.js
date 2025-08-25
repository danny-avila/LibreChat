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
  getBalanceConfig: jest.fn(() => ({
    enabled: false,
  })),
}));
jest.mock('~/models', () => ({
  findUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
}));
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isEnabled: jest.fn(() => false),
}));
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/api'),
  logger: {
    info: jest.fn(),
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
    delete process.env.OPENID_USERNAME_CLAIM;
    delete process.env.OPENID_NAME_CLAIM;
    delete process.env.PROXY;
    delete process.env.OPENID_USE_PKCE;

    // Default jwtDecode mock returns a token that includes the required role.
    jwtDecode.mockReturnValue({
      roles: ['requiredRole'],
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
      if (
        query.openidId === tokenset.claims().sub ||
        (query.email === tokenset.claims().email && query.provider === 'openid')
      ) {
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
    expect(details.message).toBe('You must have the "requiredRole" role to log in.');
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

  it('should default to usePKCE false when OPENID_USE_PKCE is not defined', async () => {
    const OpenIDStrategy = require('openid-client/passport').Strategy;

    delete process.env.OPENID_USE_PKCE;
    await setupOpenId();

    const callOptions = OpenIDStrategy.mock.calls[OpenIDStrategy.mock.calls.length - 1][0];
    expect(callOptions.usePKCE).toBe(false);
    expect(callOptions.params?.code_challenge_method).toBeUndefined();
  });
});
