const fetch = require('node-fetch');
const jwtDecode = require('jsonwebtoken/decode');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const setupOpenId = require('./openidStrategy');
const OpenIdDataMapper = require('./OpenId/openidDataMapper');

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
  isEnabled: jest.fn(() => false),
}));
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
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

// Capture the verify callback from the strategy via the mock constructor
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
    delete process.env.OPENID_CUSTOM_DATA;
    delete process.env.OPENID_PROVIDER;

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
    const userinfo = { ...baseUserinfo };
    const { user } = await validate(tokenset, userinfo);
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
    const { user } = await validate(tokenset, userinfo);
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
    const { user } = await validate(tokenset, userinfo);
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
    const { user } = await validate(tokenset, userinfo);
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
    const { user } = await validate(tokenset, userinfo);
    expect(user.name).toBe(expectedFullName);
  });

  it('should override full name with OPENID_NAME_CLAIM when set', async () => {
    process.env.OPENID_NAME_CLAIM = 'name';
    const userinfo = { ...baseUserinfo, name: 'Custom Name' };
    const { user } = await validate(tokenset, userinfo);
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
    await validate(tokenset, userinfo);
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
    jwtDecode.mockReturnValue({
      roles: ['SomeOtherRole'],
    });
    const userinfo = { ...baseUserinfo };
    const { user, details } = await validate(tokenset, userinfo);
    expect(user).toBe(false);
    expect(details.message).toBe('You must have the "requiredRole" role to log in.');
  });

  it('should attempt to download and save the avatar if picture is provided', async () => {
    const userinfo = { ...baseUserinfo };
    const { user } = await validate(tokenset, userinfo);
    expect(fetch).toHaveBeenCalled();
    expect(user.avatar).toBe('/fake/path/to/avatar.png');
  });

  it('should not attempt to download avatar if picture is not provided', async () => {
    const userinfo = { ...baseUserinfo };
    delete userinfo.picture;
    const { user } = await validate(tokenset, userinfo);
    expect(fetch).not.toHaveBeenCalled();
    expect(user.avatar).toBeFalsy();
  });

  it('should map customOpenIdData as an object when OPENID_CUSTOM_DATA is set', async () => {
    process.env.OPENID_CUSTOM_DATA = 'some,fields';
    process.env.OPENID_PROVIDER = 'microsoft';
    const fakeCustomData = { foo: 'bar' };
    const fakeDataMapper = { mapCustomData: jest.fn().mockResolvedValue(fakeCustomData) };
    OpenIdDataMapper.getMapper = jest.fn(() => fakeDataMapper);

    const userinfo = { ...baseUserinfo };
    const { user } = await validate(tokenset, userinfo);
    expect(OpenIdDataMapper.getMapper).toHaveBeenCalledWith('microsoft');
    expect(fakeDataMapper.mapCustomData).toHaveBeenCalledWith(tokenset.access_token, 'some,fields');
    expect(user.customOpenIdData).toEqual({ ...fakeCustomData, roles: ['requiredRole'] });
  });
});
