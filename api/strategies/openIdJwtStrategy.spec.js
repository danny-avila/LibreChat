const { SystemRoles } = require('librechat-data-provider');

// --- Capture the verify callback from JwtStrategy ---
let capturedVerifyCallback;
jest.mock('passport-jwt', () => ({
  Strategy: jest.fn((_opts, verifyCallback) => {
    capturedVerifyCallback = verifyCallback;
    return { name: 'jwt' };
  }),
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: jest.fn(() => 'mock-extractor'),
  },
}));
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => 'mock-secret-provider'),
}));
jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));
jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => false),
  findOpenIDUser: jest.fn(),
  math: jest.fn((val, fallback) => fallback),
}));
jest.mock('~/models', () => ({
  findUser: jest.fn(),
  updateUser: jest.fn(),
}));

const { findOpenIDUser } = require('@librechat/api');
const { updateUser } = require('~/models');
const openIdJwtLogin = require('./openIdJwtStrategy');

// Helper: build a mock openIdConfig
const mockOpenIdConfig = {
  serverMetadata: () => ({ jwks_uri: 'https://example.com/.well-known/jwks.json' }),
};

// Helper: invoke the captured verify callback
async function invokeVerify(req, payload) {
  return new Promise((resolve, reject) => {
    capturedVerifyCallback(req, payload, (err, user, info) => {
      if (err) {
        return reject(err);
      }
      resolve({ user, info });
    });
  });
}

describe('openIdJwtStrategy – token source handling', () => {
  const baseUser = {
    _id: { toString: () => 'user-abc' },
    role: SystemRoles.USER,
    provider: 'openid',
  };

  const payload = { sub: 'oidc-123', email: 'test@example.com', exp: 9999999999 };

  beforeEach(() => {
    jest.clearAllMocks();
    findOpenIDUser.mockResolvedValue({ user: { ...baseUser }, error: null, migration: false });
    updateUser.mockResolvedValue({});

    // Initialize the strategy so capturedVerifyCallback is set
    openIdJwtLogin(mockOpenIdConfig);
  });

  it('should read all tokens from session when available', async () => {
    const req = {
      headers: { authorization: 'Bearer raw-bearer-token' },
      session: {
        openidTokens: {
          accessToken: 'session-access',
          idToken: 'session-id',
          refreshToken: 'session-refresh',
        },
      },
    };

    const { user } = await invokeVerify(req, payload);

    expect(user.federatedTokens).toEqual({
      access_token: 'session-access',
      id_token: 'session-id',
      refresh_token: 'session-refresh',
      expires_at: payload.exp,
    });
  });

  it('should fall back to cookies when session is absent', async () => {
    const req = {
      headers: {
        authorization: 'Bearer raw-bearer-token',
        cookie:
          'openid_access_token=cookie-access; openid_id_token=cookie-id; refreshToken=cookie-refresh',
      },
    };

    const { user } = await invokeVerify(req, payload);

    expect(user.federatedTokens).toEqual({
      access_token: 'cookie-access',
      id_token: 'cookie-id',
      refresh_token: 'cookie-refresh',
      expires_at: payload.exp,
    });
  });

  it('should fall back to cookie for idToken only when session lacks it', async () => {
    const req = {
      headers: {
        authorization: 'Bearer raw-bearer-token',
        cookie: 'openid_id_token=cookie-id',
      },
      session: {
        openidTokens: {
          accessToken: 'session-access',
          // idToken intentionally missing
          refreshToken: 'session-refresh',
        },
      },
    };

    const { user } = await invokeVerify(req, payload);

    expect(user.federatedTokens).toEqual({
      access_token: 'session-access',
      id_token: 'cookie-id',
      refresh_token: 'session-refresh',
      expires_at: payload.exp,
    });
  });

  it('should use raw Bearer token as access_token fallback when neither session nor cookie has one', async () => {
    const req = {
      headers: {
        authorization: 'Bearer raw-bearer-token',
        cookie: 'openid_id_token=cookie-id; refreshToken=cookie-refresh',
      },
    };

    const { user } = await invokeVerify(req, payload);

    expect(user.federatedTokens.access_token).toBe('raw-bearer-token');
    expect(user.federatedTokens.id_token).toBe('cookie-id');
    expect(user.federatedTokens.refresh_token).toBe('cookie-refresh');
  });

  it('should set id_token to undefined when not available in session or cookies', async () => {
    const req = {
      headers: {
        authorization: 'Bearer raw-bearer-token',
        cookie: 'openid_access_token=cookie-access; refreshToken=cookie-refresh',
      },
    };

    const { user } = await invokeVerify(req, payload);

    expect(user.federatedTokens.access_token).toBe('cookie-access');
    expect(user.federatedTokens.id_token).toBeUndefined();
    expect(user.federatedTokens.refresh_token).toBe('cookie-refresh');
  });

  it('should keep id_token and access_token as distinct values from cookies', async () => {
    const req = {
      headers: {
        authorization: 'Bearer raw-bearer-token',
        cookie:
          'openid_access_token=the-access-token; openid_id_token=the-id-token; refreshToken=the-refresh',
      },
    };

    const { user } = await invokeVerify(req, payload);

    expect(user.federatedTokens.access_token).toBe('the-access-token');
    expect(user.federatedTokens.id_token).toBe('the-id-token');
    expect(user.federatedTokens.access_token).not.toBe(user.federatedTokens.id_token);
  });
});
