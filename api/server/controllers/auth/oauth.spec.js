const mockIsEnabled = jest.fn();
const mockSyncUserEntraGroupMemberships = jest.fn();
const mockSetAuthTokens = jest.fn();
const mockSendOpenIDAuthResponse = jest.fn();
const mockCheckBan = jest.fn();
const mockLogger = { info: jest.fn(), error: jest.fn() };

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  isEnabled: (...args) => mockIsEnabled(...args),
}));

jest.mock('~/server/services/PermissionService', () => ({
  syncUserEntraGroupMemberships: (...args) => mockSyncUserEntraGroupMemberships(...args),
}));

jest.mock('~/server/services/AuthService', () => ({
  setAuthTokens: (...args) => mockSetAuthTokens(...args),
}));

jest.mock('~/server/services/OpenIDRefreshRecovery', () => ({
  sendOpenIDAuthResponse: (...args) => mockSendOpenIDAuthResponse(...args),
}));

jest.mock('~/server/middleware', () => ({
  checkBan: (...args) => mockCheckBan(...args),
}));

const { createOAuthHandler } = require('./oauth');

const ORIGINAL_ENV = process.env;

function buildReq(overrides = {}) {
  return {
    user: {
      _id: 'user-123',
      email: 'someone@example.com',
      provider: 'openid',
      tokenset: { refresh_token: 'openid-refresh-token', access_token: 'openid-access-token' },
    },
    session: {},
    banned: false,
    ...overrides,
  };
}

function buildRes() {
  return {
    headersSent: false,
    redirect: jest.fn(),
  };
}

describe('createOAuthHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      DOMAIN_CLIENT: 'http://localhost:3080',
      DOMAIN_SERVER: 'http://localhost:3080',
      OPENID_REUSE_TOKENS: 'false',
    };
    mockIsEnabled.mockImplementation((value) => value === 'true' || value === true);
    mockCheckBan.mockResolvedValue(undefined);
    mockSendOpenIDAuthResponse.mockResolvedValue('app-token');
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('publishes the OpenID login through the durable generation service', async () => {
    process.env.OPENID_REUSE_TOKENS = 'true';
    const handler = createOAuthHandler('http://localhost:3080');
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await handler(req, res, next);

    expect(mockSendOpenIDAuthResponse).toHaveBeenCalledWith({
      tokenset: req.user.tokenset,
      user: req.user,
      existingRefreshToken: 'openid-refresh-token',
      openidSubject: undefined,
      openidIssuer: undefined,
      discardSessionTokens: true,
      req,
      res,
    });
    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3080');
    expect(next).not.toHaveBeenCalled();
  });

  it('sets the session cookies for other providers and returns to the app', async () => {
    const handler = createOAuthHandler('http://localhost:3080');
    const req = buildReq({ user: { _id: 'user-9', email: 'g@example.com', provider: 'google' } });
    const res = buildRes();
    const next = jest.fn();

    await handler(req, res, next);

    expect(mockSetAuthTokens).toHaveBeenCalledWith('user-9', res, null, req);
    expect(mockSendOpenIDAuthResponse).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3080');
  });

  it('stops when the account is banned', async () => {
    const handler = createOAuthHandler('http://localhost:3080');
    const req = buildReq({ banned: true });
    const res = buildRes();

    await handler(req, res, jest.fn());

    expect(mockSetAuthTokens).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
