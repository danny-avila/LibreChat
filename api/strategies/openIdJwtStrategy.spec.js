const { SystemRoles, ErrorTypes } = require('librechat-data-provider');
const { findUser, updateUser } = require('~/models');

// --- Mocks ---
jest.mock('~/models', () => ({
  findUser: jest.fn(),
  updateUser: jest.fn(),
}));
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isEnabled: jest.fn(() => false),
  findOpenIDUser: jest.requireActual('@librechat/api').findOpenIDUser,
  math: jest.fn((val, fallback) => (val != null ? Number(val) : fallback)),
}));
jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

// Mock passport-jwt — capture the verify callback
let jwtVerifyCallback;
jest.mock('passport-jwt', () => ({
  Strategy: jest.fn((opts, verify) => {
    jwtVerifyCallback = verify;
    return { name: 'jwt', opts, verify };
  }),
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: jest.fn(() => 'mock-extractor'),
  },
}));

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => 'mock-secret-provider'),
}));

jest.mock('cookie', () => ({
  parse: jest.fn(() => ({})),
}));

const openIdJwtLogin = require('./openIdJwtStrategy');

describe('openIdJwtLogin', () => {
  let verifyCallback;

  const mockOpenIdConfig = {
    serverMetadata: () => ({
      jwks_uri: 'https://fake-issuer.com/.well-known/jwks.json',
    }),
  };

  const basePayload = {
    sub: 'jwt-user-123',
    email: 'jwt@example.com',
    preferred_username: 'jwtuser',
    upn: 'jwt@corp.example.com',
    oid: 'oid-456',
    exp: 9999999999,
  };

  const makeReq = (overrides = {}) => ({
    headers: {
      authorization: 'Bearer raw-jwt-token',
      ...overrides.headers,
    },
    session: overrides.session || {},
  });

  /** Wrap the verify callback in a promise */
  const validate = (req, payload) =>
    new Promise((resolve, reject) => {
      verifyCallback(req, payload, (err, user, details) => {
        if (err) {
          reject(err);
        } else {
          resolve({ user, details });
        }
      });
    });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENID_EMAIL_CLAIM;
    delete process.env.PROXY;

    findUser.mockResolvedValue(null);
    updateUser.mockImplementation(async (id, data) => ({ _id: id, ...data }));

    openIdJwtLogin(mockOpenIdConfig);
    verifyCallback = jwtVerifyCallback;
  });

  it('should find an existing user by openidId (sub claim)', async () => {
    const existingUser = {
      _id: 'user-id-1',
      provider: 'openid',
      openidId: basePayload.sub,
      email: basePayload.email,
      role: SystemRoles.USER,
    };
    findUser.mockImplementation(async (query) => {
      if (query.$or && query.$or.some((c) => c.openidId === basePayload.sub)) {
        return existingUser;
      }
      return null;
    });

    const { user } = await validate(makeReq(), basePayload);

    expect(user).toBeTruthy();
    expect(user.email).toBe(basePayload.email);
    expect(user.id).toBe('user-id-1');
  });

  it('should return false when no user is found', async () => {
    findUser.mockResolvedValue(null);

    const { user } = await validate(makeReq(), basePayload);

    expect(user).toBe(false);
  });

  it('should reject login when email matches a user with a different provider', async () => {
    const googleUser = {
      _id: 'google-user-id',
      provider: 'google',
      email: basePayload.email,
      googleId: 'some-google-id',
    };
    findUser.mockImplementation(async (query) => {
      if (query.email === basePayload.email) {
        return googleUser;
      }
      return null;
    });

    const { user, details } = await validate(makeReq(), basePayload);

    expect(user).toBe(false);
    expect(details.message).toBe(ErrorTypes.AUTH_FAILED);
  });

  it('should migrate a user found by email without openidId', async () => {
    const emailOnlyUser = {
      _id: 'email-user-id',
      provider: 'openid',
      email: basePayload.email,
      role: SystemRoles.USER,
    };
    findUser.mockImplementation(async (query) => {
      if (query.email === basePayload.email) {
        return emailOnlyUser;
      }
      return null;
    });

    const { user } = await validate(makeReq(), basePayload);

    expect(user).toBeTruthy();
    expect(updateUser).toHaveBeenCalledWith(
      'email-user-id',
      expect.objectContaining({
        provider: 'openid',
        openidId: basePayload.sub,
      }),
    );
  });

  it('should set default role to USER when user has no role', async () => {
    const noRoleUser = {
      _id: 'no-role-id',
      provider: 'openid',
      openidId: basePayload.sub,
      email: basePayload.email,
    };
    findUser.mockImplementation(async (query) => {
      if (query.$or) {
        return noRoleUser;
      }
      return null;
    });

    const { user } = await validate(makeReq(), basePayload);

    expect(user.role).toBe(SystemRoles.USER);
    expect(updateUser).toHaveBeenCalledWith(
      'no-role-id',
      expect.objectContaining({ role: SystemRoles.USER }),
    );
  });

  it('should attach federatedTokens from session tokens', async () => {
    const existingUser = {
      _id: 'user-id-1',
      provider: 'openid',
      openidId: basePayload.sub,
      email: basePayload.email,
      role: SystemRoles.USER,
    };
    findUser.mockImplementation(async (query) => {
      if (query.$or) {
        return existingUser;
      }
      return null;
    });

    const req = makeReq({
      session: {
        openidTokens: {
          accessToken: 'session-access-token',
          refreshToken: 'session-refresh-token',
        },
      },
    });

    const { user } = await validate(req, basePayload);

    expect(user.federatedTokens).toEqual({
      access_token: 'session-access-token',
      id_token: 'raw-jwt-token',
      refresh_token: 'session-refresh-token',
      expires_at: basePayload.exp,
    });
  });

  it('should fall back to raw bearer token when no session tokens exist', async () => {
    const existingUser = {
      _id: 'user-id-1',
      provider: 'openid',
      openidId: basePayload.sub,
      email: basePayload.email,
      role: SystemRoles.USER,
    };
    findUser.mockImplementation(async (query) => {
      if (query.$or) {
        return existingUser;
      }
      return null;
    });

    const { user } = await validate(makeReq(), basePayload);

    expect(user.federatedTokens.access_token).toBe('raw-jwt-token');
    expect(user.federatedTokens.id_token).toBe('raw-jwt-token');
  });

  describe('OPENID_EMAIL_CLAIM integration', () => {
    it('should use the default email from payload when OPENID_EMAIL_CLAIM is not set', async () => {
      const existingUser = {
        _id: 'user-id-1',
        provider: 'openid',
        openidId: basePayload.sub,
        email: basePayload.email,
        role: SystemRoles.USER,
      };
      findUser.mockImplementation(async (query) => {
        if (query.$or) {
          return existingUser;
        }
        return null;
      });

      await validate(makeReq(), basePayload);

      // findUser is called with email from default chain (basePayload.email)
      // Since user was found by openidId, email fallback wasn't needed
      expect(findUser).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.arrayContaining([{ openidId: basePayload.sub }]),
        }),
      );
    });

    it('should use OPENID_EMAIL_CLAIM when set for email lookup', async () => {
      process.env.OPENID_EMAIL_CLAIM = 'upn';
      findUser.mockResolvedValue(null);

      // When no user is found by openidId, email fallback uses the configured claim
      const payloadWithUpn = { ...basePayload, upn: 'custom@corp.example.com' };

      const { user } = await validate(makeReq(), payloadWithUpn);

      // User not found, but findUser should have been called with the upn email
      expect(findUser).toHaveBeenCalledWith({ email: 'custom@corp.example.com' });
      expect(user).toBe(false);
    });

    it('should fall back to default chain when OPENID_EMAIL_CLAIM points to missing claim', async () => {
      process.env.OPENID_EMAIL_CLAIM = 'nonexistent_claim';
      findUser.mockResolvedValue(null);

      const { user } = await validate(makeReq(), basePayload);

      // Should fall back to email from default chain
      expect(findUser).toHaveBeenCalledWith({ email: basePayload.email });
      expect(user).toBe(false);
    });

    it('should trim whitespace from OPENID_EMAIL_CLAIM in JWT path', async () => {
      process.env.OPENID_EMAIL_CLAIM = '  upn  ';
      findUser.mockResolvedValue(null);

      const payloadWithUpn = { ...basePayload, upn: 'trimmed@corp.example.com' };

      await validate(makeReq(), payloadWithUpn);

      expect(findUser).toHaveBeenCalledWith({ email: 'trimmed@corp.example.com' });
    });
  });
});
