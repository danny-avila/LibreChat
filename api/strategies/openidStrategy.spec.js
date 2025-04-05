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
    warn: jest.fn(),
  },
}));

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
          return reject(err);
        }
        resolve({ user, details });
      });
    });

  // Default tokenset: tokens now include a period to simulate a JWT
  const validTokenSet = {
    id_token: 'header.payload.signature',
    access_token: 'header.payload.signature',
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
    roles: ['requiredRole'],
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
    process.env.OPENID_REQUIRED_ROLE_SOURCE = 'token';
    delete process.env.OPENID_USERNAME_CLAIM;
    delete process.env.OPENID_NAME_CLAIM;
    delete process.env.PROXY;
    delete process.env.OPENID_USE_PKCE;

    // By default, jwtDecode returns a token that includes the required role.
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

    // Call setupOpenId so that passport.use gets called
    await setupOpenId();
  });

  it('should create a new user with correct username when username claim exists', async () => {
    // Arrange – our userinfo already has username 'flast'
    const userinfo = { ...baseUserinfo };

    // Act
    const { user } = await validate(validTokenSet, userinfo);

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
    // Expect the username to be the given name
    const expectUsername = userinfo.given_name;

    // Act
    const { user } = await validate(validTokenSet, userinfo);

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
    const { user } = await validate(validTokenSet, userinfo);

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
    const { user } = await validate(validTokenSet, userinfo);

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
    const { user } = await validate(validTokenSet, userinfo);

    // Assert
    expect(user.name).toBe(expectedFullName);
  });

  it('should override full name with OPENID_NAME_CLAIM when set', async () => {
    // Arrange – use the name claim as the full name
    process.env.OPENID_NAME_CLAIM = 'name';
    const userinfo = { ...baseUserinfo, name: 'Custom Name' };

    // Act
    const { user } = await validate(validTokenSet, userinfo);

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
    await validate(validTokenSet, userinfo);

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
    const { user, details } = await validate(validTokenSet, userinfo);

    // Assert – verify that the strategy rejects login
    expect(user).toBe(false);
    expect(details.message).toBe('You must have the "requiredRole" role to log in.');
  });

  it('should attempt to download and save the avatar if picture is provided', async () => {
    // Arrange – ensure userinfo contains a picture URL
    const userinfo = { ...baseUserinfo };

    // Act
    const { user } = await validate(validTokenSet, userinfo);

    // Assert – verify that download was attempted and the avatar field was set via updateUser
    expect(fetch).toHaveBeenCalled();
    expect(user.avatar).toBe('/fake/path/to/avatar.png');
  });

  it('should not attempt to download avatar if picture is not provided', async () => {
    // Arrange – remove picture
    const userinfo = { ...baseUserinfo };
    delete userinfo.picture;

    // Act
    await validate(validTokenSet, userinfo);

    // Assert – fetch should not be called and avatar should remain undefined or empty
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should fallback to userinfo roles if the id_token is invalid (missing a period)', async () => {
    // Arrange – simulate an invalid id_token and ensure userinfo.roles contains the required role
    const invalidTokenSet = { ...validTokenSet, id_token: 'invalidtoken' };
    const userinfo = { ...baseUserinfo, roles: ['requiredRole'] };

    // Act
    const { user } = await validate(invalidTokenSet, userinfo);

    // Assert – login should succeed using roles from userinfo
    expect(user).toBeDefined();
    expect(createUser).toHaveBeenCalled();
  });

  it('should handle downloadImage failure gracefully and not set an avatar', async () => {
    // Arrange – force fetch to reject, simulating a network error for image download
    fetch.mockRejectedValue(new Error('network error'));
    const userinfo = { ...baseUserinfo };

    // Act
    const { user } = await validate(validTokenSet, userinfo);

    // Assert – verify that fetch was called but avatar is not updated
    expect(fetch).toHaveBeenCalled();
    expect(user.avatar).toBeUndefined();
  });

  it('should allow login if no required role is specified', async () => {
    // Arrange – remove role requirements
    delete process.env.OPENID_REQUIRED_ROLE;
    delete process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH;
    // Ensure jwtDecode returns empty roles (should not matter now)
    jwtDecode.mockReturnValue({});
    const userinfo = { ...baseUserinfo };

    // Act
    const { user } = await validate(validTokenSet, userinfo);

    // Assert – login should succeed without checking for roles
    expect(user).toBeDefined();
    expect(createUser).toHaveBeenCalled();
  });

  it('should use roles from userinfo when OPENID_REQUIRED_ROLE_SOURCE is set to "userinfo"', async () => {
    // Arrange – force roleSource to be userinfo and have jwtDecode return empty roles
    process.env.OPENID_REQUIRED_ROLE_SOURCE = 'userinfo';
    jwtDecode.mockReturnValue({});
    const userinfo = { ...baseUserinfo, roles: ['requiredRole'] };

    // Act
    const { user } = await validate(validTokenSet, userinfo);

    // Assert – login should succeed because roles are taken from userinfo
    expect(user).toBeDefined();
    expect(createUser).toHaveBeenCalled();
  });

  it('should call done with error when createUser fails', async () => {
    // Arrange – simulate createUser throwing an error
    const errorMessage = 'createUser failed';
    createUser.mockImplementation(async () => {
      throw new Error(errorMessage);
    });
    const userinfo = { ...baseUserinfo };

    // Act & Assert – verify that the verify callback rejects with the error
    await expect(validate(validTokenSet, userinfo)).rejects.toThrow(errorMessage);
  });

  it('should not download avatar if existing user has avatar marked as manual', async () => {
    // Arrange – simulate an existing user with a manually set avatar
    const existingUser = {
      _id: 'existingUserId',
      provider: 'local',
      email: baseUserinfo.email,
      openidId: '',
      username: '',
      name: '',
      avatar: 'some/path?manual=true',
    };
    findUser.mockResolvedValue(existingUser);
    const userinfo = { ...baseUserinfo };

    // Act
    const { user } = await validate(validTokenSet, userinfo);

    // Assert – fetch should not be called since avatar is manually set
    expect(fetch).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledWith(
      existingUser._id,
      expect.objectContaining({ avatar: existingUser.avatar }),
    );
    expect(user.avatar).toBe(existingUser.avatar);
  });

  it('should pass usePKCE true and set code_challenge_method in params when OPENID_USE_PKCE is "true"', async () => {
    process.env.OPENID_USE_PKCE = 'true';
    await setupOpenId();
    // Get the options from the last call of OpenIDStrategy
    const callOptions = OpenIDStrategy.mock.calls[OpenIDStrategy.mock.calls.length - 1][0];
    expect(callOptions.usePKCE).toBe(true);
    expect(callOptions.params.code_challenge_method).toBe('S256');
  });

  it('should pass usePKCE false and not set code_challenge_method in params when OPENID_USE_PKCE is "false"', async () => {
    process.env.OPENID_USE_PKCE = 'false';
    await setupOpenId();
    const callOptions = OpenIDStrategy.mock.calls[OpenIDStrategy.mock.calls.length - 1][0];
    expect(callOptions.usePKCE).toBe(false);
    expect(callOptions.params.code_challenge_method).toBeUndefined();
  });

  it('should default to usePKCE false when OPENID_USE_PKCE is not defined', async () => {
    delete process.env.OPENID_USE_PKCE;
    await setupOpenId();
    const callOptions = OpenIDStrategy.mock.calls[OpenIDStrategy.mock.calls.length - 1][0];
    expect(callOptions.usePKCE).toBe(false);
    expect(callOptions.params.code_challenge_method).toBeUndefined();
  });
});
