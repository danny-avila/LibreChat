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
  isEnabled: jest.fn(() => false), // default to false; override per test if needed
}));
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Update Issuer.discover mock so that the returned issuer has an 'issuer' property.
Issuer.discover = jest.fn().mockResolvedValue({
  issuer: 'https://fake-issuer.com',
  id_token_signing_alg_values_supported: ['RS256'],
  Client: jest.fn().mockImplementation((clientMetadata) => {
    return {
      metadata: clientMetadata,
    };
  }),
});

// To capture the verify callback from the strategy, we grab it from the mock constructor.
let verifyCallback;
OpenIDStrategy.mockImplementation((options, verify) => {
  verifyCallback = verify;
  return { name: 'openid', options, verify };
});

describe('setupOpenId', () => {
  // Helper to wrap the verify callback in a promise.
  const validate = (tokenset, userinfo) =>
    new Promise((resolve, reject) => {
      verifyCallback(tokenset, userinfo, (err, user, details) => {
        if (err) {
          return reject(err);
        }
        resolve({ user, details });
      });
    });

  // Default tokenset: tokens include a period to simulate a JWT.
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
    // Clear previous mock calls and reset implementations.
    jest.clearAllMocks();

    // Reset environment variables needed by the strategy.
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
    delete process.env.OPENID_SET_FIRST_SUPPORTED_ALGORITHM;

    // By default, jwtDecode returns a token that includes the required role.
    jwtDecode.mockReturnValue({
      roles: ['requiredRole'],
    });

    // By default, assume that no user is found so that createUser will be called.
    findUser.mockResolvedValue(null);
    createUser.mockImplementation(async (userData) => {
      // Simulate created user with an _id property.
      return { _id: 'newUserId', ...userData };
    });
    updateUser.mockImplementation(async (id, userData) => {
      return { _id: id, ...userData };
    });

    // For image download, simulate a successful response.
    const fakeBuffer = Buffer.from('fake image');
    const fakeResponse = {
      ok: true,
      buffer: jest.fn().mockResolvedValue(fakeBuffer),
    };
    fetch.mockResolvedValue(fakeResponse);

    // (Re)initialize the strategy with current env settings.
    await setupOpenId();
  });

  it('should create a new user with correct username when username claim exists', async () => {
    const userinfo = { ...baseUserinfo };
    const { user } = await validate(validTokenSet, userinfo);
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
    const userinfo = { ...baseUserinfo };
    delete userinfo.username;
    const expectUsername = userinfo.given_name;
    const { user } = await validate(validTokenSet, userinfo);
    expect(user.username).toBe(expectUsername);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: expectUsername }),
      true,
      true,
    );
  });

  it('should use email as username when username and given_name are missing', async () => {
    const userinfo = { ...baseUserinfo };
    delete userinfo.username;
    delete userinfo.given_name;
    const expectUsername = userinfo.email;
    const { user } = await validate(validTokenSet, userinfo);
    expect(user.username).toBe(expectUsername);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: expectUsername }),
      true,
      true,
    );
  });

  it('should override username with OPENID_USERNAME_CLAIM when set', async () => {
    process.env.OPENID_USERNAME_CLAIM = 'sub';
    const userinfo = { ...baseUserinfo };
    await setupOpenId();
    const { user } = await validate(validTokenSet, userinfo);
    expect(user.username).toBe(userinfo.sub);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: userinfo.sub }),
      true,
      true,
    );
  });

  it('should set the full name correctly when given_name and family_name exist', async () => {
    const userinfo = { ...baseUserinfo };
    const expectedFullName = `${userinfo.given_name} ${userinfo.family_name}`;
    const { user } = await validate(validTokenSet, userinfo);
    expect(user.name).toBe(expectedFullName);
  });

  it('should override full name with OPENID_NAME_CLAIM when set', async () => {
    process.env.OPENID_NAME_CLAIM = 'name';
    const userinfo = { ...baseUserinfo, name: 'Custom Name' };
    await setupOpenId();
    const { user } = await validate(validTokenSet, userinfo);
    expect(user.name).toBe('Custom Name');
  });

  it('should update an existing user on login', async () => {
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
    await validate(validTokenSet, userinfo);
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
    jwtDecode.mockReturnValue({ roles: ['SomeOtherRole'] });
    const userinfo = { ...baseUserinfo };
    const { user, details } = await validate(validTokenSet, userinfo);
    expect(user).toBe(false);
    expect(details.message).toBe('You must have the "requiredRole" role to log in.');
  });

  it('should attempt to download and save the avatar if picture is provided', async () => {
    const userinfo = { ...baseUserinfo };
    const { user } = await validate(validTokenSet, userinfo);
    expect(fetch).toHaveBeenCalled();
    expect(user.avatar).toBe('/fake/path/to/avatar.png');
  });

  it('should not attempt to download avatar if picture is not provided', async () => {
    const userinfo = { ...baseUserinfo };
    delete userinfo.picture;
    await validate(validTokenSet, userinfo);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should fallback to userinfo roles if the id_token is invalid (missing a period)', async () => {
    const invalidTokenSet = { ...validTokenSet, id_token: 'invalidtoken' };
    const userinfo = { ...baseUserinfo, roles: ['requiredRole'] };
    const { user } = await validate(invalidTokenSet, userinfo);
    expect(user).toBeDefined();
    expect(createUser).toHaveBeenCalled();
  });

  it('should handle downloadImage failure gracefully and not set an avatar', async () => {
    fetch.mockRejectedValue(new Error('network error'));
    const userinfo = { ...baseUserinfo };
    const { user } = await validate(validTokenSet, userinfo);
    expect(fetch).toHaveBeenCalled();
    expect(user.avatar).toBeUndefined();
  });

  it('should allow login if no required role is specified', async () => {
    delete process.env.OPENID_REQUIRED_ROLE;
    delete process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH;
    jwtDecode.mockReturnValue({});
    const userinfo = { ...baseUserinfo };
    const { user } = await validate(validTokenSet, userinfo);
    expect(user).toBeDefined();
    expect(createUser).toHaveBeenCalled();
  });

  it('should use roles from userinfo when OPENID_REQUIRED_ROLE_SOURCE is set to "userinfo"', async () => {
    process.env.OPENID_REQUIRED_ROLE_SOURCE = 'userinfo';
    jwtDecode.mockReturnValue({});
    const userinfo = { ...baseUserinfo, roles: ['requiredRole'] };
    await setupOpenId();
    const { user } = await validate(validTokenSet, userinfo);
    expect(user).toBeDefined();
    expect(createUser).toHaveBeenCalled();
  });

  it('should merge roles from both token and userinfo when OPENID_REQUIRED_ROLE_SOURCE is "both"', async () => {
    process.env.OPENID_REQUIRED_ROLE_SOURCE = 'both';
    jwtDecode.mockReturnValue({ roles: ['extraRole'] });
    const userinfo = { ...baseUserinfo, roles: ['requiredRole'] };
    await setupOpenId();
    const { user } = await validate(validTokenSet, userinfo);
    expect(user).toBeDefined();
    expect(createUser).toHaveBeenCalled();
  });

  it('should fall back to userinfo roles when token decode fails and roleSource is "both"', async () => {
    process.env.OPENID_REQUIRED_ROLE_SOURCE = 'both';
    jwtDecode.mockImplementation(() => {
      throw new Error('Decode error');
    });
    const userinfo = { ...baseUserinfo, roles: ['requiredRole'] };
    await setupOpenId();
    const { user } = await validate(validTokenSet, userinfo);
    expect(user).toBeDefined();
    expect(createUser).toHaveBeenCalled();
  });

  it('should merge roles from both token and userinfo when token is invalid and roleSource is "both"', async () => {
    process.env.OPENID_REQUIRED_ROLE_SOURCE = 'both';
    const invalidTokenSet = { ...validTokenSet, id_token: 'invalidtoken' };
    const userinfo = { ...baseUserinfo, roles: ['requiredRole'] };
    await setupOpenId();
    const { user } = await validate(invalidTokenSet, userinfo);
    expect(user).toBeDefined();
    expect(createUser).toHaveBeenCalled();
  });

  it('should reject login if merged roles from both token and userinfo do not include required role', async () => {
    process.env.OPENID_REQUIRED_ROLE_SOURCE = 'both';
    jwtDecode.mockReturnValue({ roles: ['SomeOtherRole'] });
    const userinfo = { ...baseUserinfo, roles: ['AnotherRole'] };
    await setupOpenId();
    const { user, details } = await validate(validTokenSet, userinfo);
    expect(user).toBe(false);
    expect(details.message).toBe('You must have the "requiredRole" role to log in.');
  });

  it('should pass usePKCE true and set code_challenge_method in params when OPENID_USE_PKCE is "true"', async () => {
    process.env.OPENID_USE_PKCE = 'true';
    await setupOpenId();
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

  it('should set id_token_signed_response_alg if OPENID_SET_FIRST_SUPPORTED_ALGORITHM is enabled', async () => {
    process.env.OPENID_SET_FIRST_SUPPORTED_ALGORITHM = 'true';
    // Override isEnabled so that it returns true.
    const { isEnabled } = require('~/server/utils');
    isEnabled.mockReturnValue(true);
    await setupOpenId();
    const callOptions = OpenIDStrategy.mock.calls[OpenIDStrategy.mock.calls.length - 1][0];
    expect(callOptions.client.metadata.id_token_signed_response_alg).toBe('RS256');
  });

  it('should use access token when OPENID_REQUIRED_ROLE_TOKEN_KIND is set to "access"', async () => {
    process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND = 'access';
    // Reinitialize strategy so that the new token kind is used.
    await setupOpenId();
    jwtDecode.mockClear();
    jwtDecode.mockReturnValue({ roles: ['requiredRole'] });
    const userinfo = { ...baseUserinfo };
    await validate(validTokenSet, userinfo);
    expect(jwtDecode).toHaveBeenCalledWith(validTokenSet.access_token);
  });

  it('should use proxy agent if PROXY is provided', async () => {
    process.env.PROXY = 'http://fake-proxy.com';
    await setupOpenId();
    const { logger } = require('~/config');
    expect(logger.info).toHaveBeenCalledWith(`[openidStrategy] Using proxy: ${process.env.PROXY}`);
  });
});
