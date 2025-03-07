const fetch = require('node-fetch');
const jwtDecode = require('jsonwebtoken/decode');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const setupOpenId = require('./openidStrategy');

// --- Mocks ---
jest.mock('node-fetch');
jest.mock('openid-client');
jest.mock('jsonwebtoken/decode');
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({
    // You can modify this mock as needed (here returning a dummy function)
    saveBuffer: jest.fn().mockResolvedValue('/fake/path/to/avatar.png'),
  })),
}));
jest.mock('~/models/userMethods', () => ({
  findUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
}));
jest.mock('~/server/utils/crypto', () => ({
  hashToken: jest.fn().mockResolvedValue('hashed-token'),
}));
jest.mock('~/server/utils', () => ({
  isEnabled: jest.fn(() => false), // default to false, override per test if needed
}));
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// IMPORTANT: Mock the openid helper to return our desired tenant configuration.
jest.mock('~/server/utils/openidHelper', () => ({
  getOpenIdTenants: jest.fn(),
  chooseOpenIdStrategy: jest.fn(), // Not used in these tests.
}));

// Import our mocked helper so we can set its return value.
const { getOpenIdTenants } = require('~/server/utils/openidHelper');

// Mock Issuer.discover so that setupOpenId gets a fake issuer and client
Issuer.discover = jest.fn().mockResolvedValue({
  id_token_signing_alg_values_supported: ['RS256'],
  Client: jest.fn().mockImplementation((clientMetadata) => {
    return {
      metadata: clientMetadata,
    };
  }),
});

// To capture the verify callback from the strategy, we grab it from the mock constructor
let verifyCallback;
OpenIDStrategy.mockImplementation((options, verify) => {
  verifyCallback = verify;
  return { name: 'openid', options, verify };
});

describe('setupOpenId', () => {
  // Helper to wrap the verify callback in a promise
  const validate = (tokenset, userinfo) =>
    new Promise((resolve, reject) => {
      verifyCallback(tokenset, userinfo, (err, user, details) => {
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
  };

  const baseUserinfo = {
    sub: '1234',
    email: 'test@example.com',
    email_verified: true,
    given_name: 'First',
    family_name: 'Last',
    name: 'My Full',
    username: 'flast',
    picture: 'https://example.com/avatar.png',
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

    // Set up our mocked tenant configuration.
    // Here we simulate a single tenant with an empty domains field.
    // (Our updated multi-tenant code uses the tenant name to build the strategy.)
    getOpenIdTenants.mockResolvedValue([
      {
        name: 'tenant1',
        domains: '', // Using an empty string so the single-tenant branch is taken.
        openid: {
          issuer: process.env.OPENID_ISSUER,
          clientId: process.env.OPENID_CLIENT_ID,
          clientSecret: process.env.OPENID_CLIENT_SECRET,
        },
      },
    ]);

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

    // Finally, call the setup function so that passport.use gets called
    await setupOpenId();
  });

  it('should create a new user with correct username when username claim exists', async () => {
    // Arrange – our userinfo already has username 'flast'
    const userinfo = { ...baseUserinfo };

    // Act
    const { user } = await validate(tokenset, userinfo);

    // Assert
    expect(user.username).toBe(userinfo.username);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openid',
        openidId: userinfo.sub,
        username: userinfo.username,
        email: userinfo.email,
        name: `${userinfo.given_name} ${userinfo.family_name}`,
      }),
      true,
      true,
    );
  });

  it('should use given_name as username when username claim is missing', async () => {
    // Arrange – remove username from userinfo
    const userinfo = { ...baseUserinfo };
    delete userinfo.username;
    // Expect the username to be the given name (unchanged case)
    const expectUsername = userinfo.given_name;

    // Act
    const { user } = await validate(tokenset, userinfo);

    // Assert
    expect(user.username).toBe(expectUsername);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: expectUsername }),
      true,
      true,
    );
  });

  it('should use email as username when username and given_name are missing', async () => {
    // Arrange – remove username and given_name
    const userinfo = { ...baseUserinfo };
    delete userinfo.username;
    delete userinfo.given_name;
    const expectUsername = userinfo.email;

    // Act
    const { user } = await validate(tokenset, userinfo);

    // Assert
    expect(user.username).toBe(expectUsername);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: expectUsername }),
      true,
      true,
    );
  });

  it('should override username with OPENID_USERNAME_CLAIM when set', async () => {
    // Arrange – set OPENID_USERNAME_CLAIM so that the sub claim is used
    process.env.OPENID_USERNAME_CLAIM = 'sub';
    const userinfo = { ...baseUserinfo };

    // Act
    const { user } = await validate(tokenset, userinfo);

    // Assert – username should equal the sub (converted as-is)
    expect(user.username).toBe(userinfo.sub);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: userinfo.sub }),
      true,
      true,
    );
  });

  it('should set the full name correctly when given_name and family_name exist', async () => {
    // Arrange
    const userinfo = { ...baseUserinfo };
    const expectedFullName = `${userinfo.given_name} ${userinfo.family_name}`;

    // Act
    const { user } = await validate(tokenset, userinfo);

    // Assert
    expect(user.name).toBe(expectedFullName);
  });

  it('should override full name with OPENID_NAME_CLAIM when set', async () => {
    // Arrange – use the name claim as the full name
    process.env.OPENID_NAME_CLAIM = 'name';
    const userinfo = { ...baseUserinfo, name: 'Custom Name' };

    // Act
    const { user } = await validate(tokenset, userinfo);

    // Assert
    expect(user.name).toBe('Custom Name');
  });

  it('should update an existing user on login', async () => {
    // Arrange – simulate that a user already exists
    const existingUser = {
      _id: 'existingUserId',
      provider: 'local',
      email: baseUserinfo.email,
      openidId: '',
      username: '',
      name: '',
    };
    findUser.mockImplementation(async (query) => {
      if (query.openidId === baseUserinfo.sub || query.email === baseUserinfo.email) {
        return existingUser;
      }
      return null;
    });

    const userinfo = { ...baseUserinfo };

    // Act
    await validate(tokenset, userinfo);

    // Assert – updateUser should be called and the user object updated
    expect(updateUser).toHaveBeenCalledWith(
      existingUser._id,
      expect.objectContaining({
        provider: 'openid',
        openidId: baseUserinfo.sub,
        username: baseUserinfo.username,
        name: `${baseUserinfo.given_name} ${baseUserinfo.family_name}`,
      }),
    );
  });

  it('should enforce the required role and reject login if missing', async () => {
    // Arrange – simulate a token without the required role.
    jwtDecode.mockReturnValue({
      roles: ['SomeOtherRole'],
    });
    const userinfo = { ...baseUserinfo };

    // Act
    const { user, details } = await validate(tokenset, userinfo);

    // Assert – verify that the strategy rejects login
    expect(user).toBe(false);
    expect(details.message).toBe('You must have the "requiredRole" role to log in.');
  });

  it('should attempt to download and save the avatar if picture is provided', async () => {
    // Arrange – ensure userinfo contains a picture URL
    const userinfo = { ...baseUserinfo };

    // Act
    const { user } = await validate(tokenset, userinfo);

    // Assert – verify that download was attempted and the avatar field was set via updateUser
    expect(fetch).toHaveBeenCalled();
    // Our mock getStrategyFunctions.saveBuffer returns '/fake/path/to/avatar.png'
    expect(user.avatar).toBe('/fake/path/to/avatar.png');
  });

  it('should not attempt to download avatar if picture is not provided', async () => {
    // Arrange – remove picture
    const userinfo = { ...baseUserinfo };
    delete userinfo.picture;

    // Act
    await validate(tokenset, userinfo);

    // Assert – fetch should not be called and avatar should remain undefined or empty
    expect(fetch).not.toHaveBeenCalled();
    // Depending on your implementation, user.avatar may be undefined or an empty string.
  });
});
