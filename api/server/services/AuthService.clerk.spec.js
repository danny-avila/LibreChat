const jwt = require('jsonwebtoken');

const mockCreateSession = jest.fn();
const mockGenerateRefreshToken = jest.fn();
const mockGetUserById = jest.fn();

jest.mock('~/models', () => {
  /**
   * Mirrors @librechat/data-schemas' real generateToken signing mechanics
   * exactly (same division-by-1000, same jsonwebtoken.sign call) without
   * requiring the real package — keeps this file's module registry isolated
   * from AuthService.spec.js's fully-mocked @librechat/data-schemas so the
   * two suites don't interact when run together.
   */
  function signLikeRealGenerateToken(user, expiresInMs) {
    const { sign } = require('jsonwebtoken');
    return sign(
      { id: user._id, username: user.username, provider: user.provider, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: expiresInMs / 1000 },
    );
  }

  return {
    findUser: jest.fn(),
    findToken: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    countUsers: jest.fn(),
    getUserById: (...args) => mockGetUserById(...args),
    findSession: jest.fn(),
    createToken: jest.fn(),
    deleteTokens: jest.fn(),
    deleteSession: jest.fn(),
    createSession: (...args) => mockCreateSession(...args),
    generateToken: (...args) => signLikeRealGenerateToken(...args),
    deleteUserById: jest.fn(),
    generateRefreshToken: (...args) => mockGenerateRefreshToken(...args),
  };
});
jest.mock('~/strategies/validators', () => ({
  registerSchema: { safeParse: jest.fn() },
}));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));
jest.mock('~/server/utils', () => ({ sendEmail: jest.fn() }));
// Mirrors AuthService.spec.js's mock exactly (including `{ virtual: true }`)
// rather than requiring the real @librechat/api — this file's point is
// proving the real jsonwebtoken arithmetic never crashes or drifts, not
// exercising CloudFront/email-domain logic, and staying fully self-contained
// avoids any real-vs-virtual-mock interaction with sibling spec files that
// mock the same real package differently in the same --runInBand worker.
jest.mock(
  '@librechat/api',
  () => ({
    isEnabled: jest.fn((val) => val === 'true' || val === true),
    checkEmailConfig: jest.fn(),
    isEmailDomainAllowed: jest.fn(),
    math: jest.fn((val, fallback) => (val ? Number(val) : fallback)),
    shouldUseSecureCookie: jest.fn(() => false),
    resolveAppConfigForUser: jest.fn(async () => ({})),
    setCloudFrontCookies: jest.fn(() => false),
    getCloudFrontConfig: jest.fn(() => null),
    parseCloudFrontCookieScope: jest.fn(() => null),
    CLOUDFRONT_SCOPE_COOKIE: 'LibreChat-CloudFront-Scope',
  }),
  { virtual: true },
);
jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    getTenantId: jest.fn(() => undefined),
    DEFAULT_SESSION_EXPIRY: 900000,
    DEFAULT_REFRESH_TOKEN_EXPIRY: 604800000,
  }),
  { virtual: true },
);

const { setAuthTokens } = require('./AuthService');

const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_SESSION_EXPIRY = process.env.SESSION_EXPIRY;

beforeAll(() => {
  process.env.JWT_SECRET = 'real-jwt-secret-for-auth-service-clerk-spec';
});

afterAll(() => {
  process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
  process.env.SESSION_EXPIRY = ORIGINAL_SESSION_EXPIRY;
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SESSION_EXPIRY;
  mockGetUserById.mockResolvedValue({
    _id: 'user-123',
    username: 'clerk-user',
    provider: 'clerk',
    email: 'clerk-user@test.com',
  });
  mockGenerateRefreshToken.mockResolvedValue('real-refresh-token');
});

function mockResponse() {
  return { cookie: jest.fn() };
}

describe('setAuthTokens — real jsonwebtoken signing against an explicit session deadline', () => {
  it('signs an access token whose decoded exp matches floor(session.expiration / 1000)', async () => {
    // Deliberately not aligned to a whole second.
    const explicitSession = { _id: 'session-1', expiration: new Date(Date.now() + 60437) };
    const res = mockResponse();

    const token = await setAuthTokens('user-123', res, explicitSession, null);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.exp).toBe(Math.floor(explicitSession.expiration.getTime() / 1000));
  });

  it.each([1, 250, 500, 999, 1001, 60437, 123456, 900001])(
    'never crashes real jwt.sign on a %ims offset that does not divide evenly by 1000',
    async (offsetMs) => {
      const explicitSession = { _id: 'session-1', expiration: new Date(Date.now() + offsetMs) };
      const res = mockResponse();

      await expect(setAuthTokens('user-123', res, explicitSession, null)).resolves.toEqual(
        expect.any(String),
      );
    },
  );

  it('clamps the signed token to the configured maximum when the explicit session outlives it', async () => {
    process.env.SESSION_EXPIRY = '5000';
    const explicitSession = { _id: 'session-1', expiration: new Date(Date.now() + 999999999) };
    const res = mockResponse();

    const token = await setAuthTokens('user-123', res, explicitSession, null);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(decoded.exp - nowSeconds).toBeLessThanOrEqual(5);
    expect(decoded.exp - nowSeconds).toBeGreaterThan(0);
  });
});
