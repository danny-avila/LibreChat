jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), debug: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('~/server/services/GraphTokenService', () => ({
  getGraphApiToken: jest.fn(),
}));
jest.mock('~/server/services/AuthService', () => ({
  requestPasswordReset: jest.fn(),
  setOpenIDAuthTokens: jest.fn(),
  setCloudFrontAuthCookies: jest.fn(),
  resetPassword: jest.fn(),
  setAuthTokens: jest.fn(),
  registerUser: jest.fn(),
}));
jest.mock('~/strategies', () => ({ getOpenIdConfig: jest.fn(), getOpenIdEmail: jest.fn() }));
jest.mock('openid-client', () => ({ refreshTokenGrant: jest.fn() }));
jest.mock('~/models', () => ({
  deleteAllUserSessions: jest.fn(),
  getUserById: jest.fn(),
  findSession: jest.fn(),
  updateUser: jest.fn(),
  findUser: jest.fn(),
}));
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(),
  findOpenIDUser: jest.fn(),
  getOpenIdIssuer: jest.fn(() => 'https://issuer.example.com'),
  buildOpenIDRefreshParams: jest.fn(() => {
    const params = {};
    if (process.env.OPENID_SCOPE) {
      params.scope = process.env.OPENID_SCOPE;
    }
    if (process.env.OPENID_REFRESH_AUDIENCE) {
      params.audience = process.env.OPENID_REFRESH_AUDIENCE;
    }
    return params;
  }),
}));

const openIdClient = require('openid-client');
const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');
const { isEnabled, findOpenIDUser, buildOpenIDRefreshParams } = require('@librechat/api');
const { graphTokenController, refreshController } = require('./AuthController');
const { getGraphApiToken } = require('~/server/services/GraphTokenService');
const {
  setOpenIDAuthTokens,
  setCloudFrontAuthCookies,
  setAuthTokens,
} = require('~/server/services/AuthService');
const { getOpenIdConfig, getOpenIdEmail } = require('~/strategies');
const { getUserById, findSession, updateUser } = require('~/models');

const ORIGINAL_OPENID_SCOPE = process.env.OPENID_SCOPE;
const ORIGINAL_OPENID_REFRESH_AUDIENCE = process.env.OPENID_REFRESH_AUDIENCE;
const ORIGINAL_JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe('graphTokenController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    isEnabled.mockReturnValue(true);

    req = {
      user: {
        openidId: 'oid-123',
        provider: 'openid',
        federatedTokens: {
          access_token: 'federated-access-token',
          id_token: 'federated-id-token',
        },
      },
      headers: { authorization: 'Bearer app-jwt-which-is-id-token' },
      query: { scopes: 'https://graph.microsoft.com/.default' },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    getGraphApiToken.mockResolvedValue({
      access_token: 'graph-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
  });

  it('should pass federatedTokens.access_token as OBO assertion, not the auth header bearer token', async () => {
    await graphTokenController(req, res);

    expect(getGraphApiToken).toHaveBeenCalledWith(
      req.user,
      'federated-access-token',
      'https://graph.microsoft.com/.default',
    );
    expect(getGraphApiToken).not.toHaveBeenCalledWith(
      expect.anything(),
      'app-jwt-which-is-id-token',
      expect.anything(),
    );
  });

  it('should return the graph token response on success', async () => {
    await graphTokenController(req, res);

    expect(res.json).toHaveBeenCalledWith({
      access_token: 'graph-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
  });

  it('should return 403 when user is not authenticated via Entra ID', async () => {
    req.user.provider = 'google';
    req.user.openidId = undefined;

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getGraphApiToken).not.toHaveBeenCalled();
  });

  it('should return 403 when OPENID_REUSE_TOKENS is not enabled', async () => {
    isEnabled.mockReturnValue(false);

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getGraphApiToken).not.toHaveBeenCalled();
  });

  it('should return 400 when scopes query param is missing', async () => {
    req.query.scopes = undefined;

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getGraphApiToken).not.toHaveBeenCalled();
  });

  it('should return 401 when federatedTokens.access_token is missing', async () => {
    req.user.federatedTokens = {};

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(getGraphApiToken).not.toHaveBeenCalled();
  });

  it('should return 401 when federatedTokens is absent entirely', async () => {
    req.user.federatedTokens = undefined;

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(getGraphApiToken).not.toHaveBeenCalled();
  });

  it('should return 500 when getGraphApiToken throws', async () => {
    getGraphApiToken.mockRejectedValue(new Error('OBO exchange failed'));

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to obtain Microsoft Graph token',
    });
  });
});

describe('refreshController – OpenID path', () => {
  const mockTokenset = {
    claims: jest.fn(),
    access_token: 'new-access',
    id_token: 'new-id',
    refresh_token: 'new-refresh',
    expires_in: 3600,
  };

  const baseClaims = {
    iss: 'https://issuer.example.com',
    sub: 'oidc-sub-123',
    oid: 'oid-456',
    email: 'user@example.com',
    exp: 9999999999,
  };

  const defaultUser = {
    _id: 'user-db-id',
    email: baseClaims.email,
    openidId: baseClaims.sub,
    password: '$2b$10$hashedpassword',
    __v: 0,
    totpSecret: 'encrypted-totp-secret',
    backupCodes: ['hashed-code-1', 'hashed-code-2'],
  };

  let req, res;
  const idpSigningSecret = 'idp-signing-secret';

  const makeSessionToken = (claims = {}) =>
    jwt.sign(
      {
        sub: baseClaims.sub,
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...claims,
      },
      idpSigningSecret,
    );

  const makeSignedUserId = (id = 'user-db-id', options = { expiresIn: '1h' }) =>
    jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, options);

  const setOpenIDReuseCookies = (signedUserId = makeSignedUserId()) => {
    req.headers.cookie = [
      'token_provider=openid',
      'refreshToken=stored-refresh',
      `openid_user_id=${signedUserId}`,
    ].join('; ');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENID_SCOPE;
    delete process.env.OPENID_REFRESH_AUDIENCE;
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

    isEnabled.mockReturnValue(true);
    getOpenIdConfig.mockReturnValue({ some: 'config' });
    openIdClient.refreshTokenGrant.mockResolvedValue(mockTokenset);
    mockTokenset.claims.mockReturnValue(baseClaims);
    getOpenIdEmail.mockReturnValue(baseClaims.email);
    setOpenIDAuthTokens.mockReturnValue('new-app-token');
    setCloudFrontAuthCookies.mockReturnValue(true);
    findOpenIDUser.mockResolvedValue({ user: { ...defaultUser }, error: null, migration: false });
    getUserById.mockResolvedValue({
      _id: 'user-db-id',
      email: baseClaims.email,
      openidId: baseClaims.sub,
    });
    updateUser.mockResolvedValue({});

    req = {
      headers: { cookie: 'token_provider=openid; refreshToken=stored-refresh' },
      session: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
    };
  });

  afterAll(() => {
    if (ORIGINAL_OPENID_SCOPE === undefined) {
      delete process.env.OPENID_SCOPE;
    } else {
      process.env.OPENID_SCOPE = ORIGINAL_OPENID_SCOPE;
    }

    if (ORIGINAL_OPENID_REFRESH_AUDIENCE === undefined) {
      delete process.env.OPENID_REFRESH_AUDIENCE;
    } else {
      process.env.OPENID_REFRESH_AUDIENCE = ORIGINAL_OPENID_REFRESH_AUDIENCE;
    }

    if (ORIGINAL_JWT_REFRESH_SECRET === undefined) {
      delete process.env.JWT_REFRESH_SECRET;
    } else {
      process.env.JWT_REFRESH_SECRET = ORIGINAL_JWT_REFRESH_SECRET;
    }
  });

  /** Asserts the full OpenID refresh grant was triggered using default mock state. */
  const expectOpenIDRefreshGrant = () => {
    expect(openIdClient.refreshTokenGrant).toHaveBeenCalledWith(
      { some: 'config' },
      'stored-refresh',
      {},
    );
    expect(setOpenIDAuthTokens).toHaveBeenCalledWith(mockTokenset, req, res, {
      userId: 'user-db-id',
      existingRefreshToken: 'stored-refresh',
      tenantId: undefined,
    });
  };

  it('should call getOpenIdEmail with token claims and use result for findOpenIDUser', async () => {
    await refreshController(req, res);

    expect(buildOpenIDRefreshParams).toHaveBeenCalledTimes(1);
    expect(getOpenIdEmail).toHaveBeenCalledWith(baseClaims);
    expect(findOpenIDUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: baseClaims.email,
        openidIssuer: baseClaims.iss,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reuses valid OpenID session tokens and refreshes CloudFront cookies', async () => {
    const reusableIdToken = makeSessionToken();
    const signedUserId = makeSignedUserId();
    setOpenIDReuseCookies(signedUserId);
    req.session = {
      openidTokens: {
        accessToken: 'session-access-token',
        idToken: reusableIdToken,
        refreshToken: 'stored-refresh',
        lastRefreshedAt: Date.now(),
      },
    };
    const user = {
      ...defaultUser,
      federatedTokens: { access_token: 'do-not-return' },
    };
    getUserById.mockResolvedValue(user);

    await refreshController(req, res);

    expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
    expect(setOpenIDAuthTokens).not.toHaveBeenCalled();
    expect(getUserById).toHaveBeenCalledWith(
      'user-db-id',
      '-password -__v -totpSecret -backupCodes -federatedTokens',
    );
    expect(setCloudFrontAuthCookies).toHaveBeenCalledWith(req, res, user);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({
      token: reusableIdToken,
      user: expect.objectContaining({
        _id: 'user-db-id',
        email: baseClaims.email,
        openidId: baseClaims.sub,
      }),
    });

    const sentPayload = res.send.mock.calls[0][0];
    expect(sentPayload.user).not.toHaveProperty('password');
    expect(sentPayload.user).not.toHaveProperty('totpSecret');
    expect(sentPayload.user).not.toHaveProperty('backupCodes');
    expect(sentPayload.user).not.toHaveProperty('federatedTokens');
    expect(logger.debug).toHaveBeenCalledWith(
      '[refreshController] OpenID session token reused',
      expect.objectContaining({
        token_type: 'id_token',
        cloudfront_cookies_set: true,
      }),
    );
    const debugOutput = JSON.stringify(logger.debug.mock.calls);
    expect(debugOutput).not.toContain(reusableIdToken);
    expect(debugOutput).not.toContain(signedUserId);
    expect(debugOutput).not.toContain('session-access-token');
  });

  it('falls through to full OpenID refresh when session tokens are expired', async () => {
    const expiredToken = makeSessionToken({ exp: Math.floor(Date.now() / 1000) - 60 });
    setOpenIDReuseCookies();
    req.session = {
      openidTokens: {
        accessToken: expiredToken,
        idToken: expiredToken,
        refreshToken: 'stored-refresh',
        lastRefreshedAt: Date.now(),
      },
    };

    await refreshController(req, res);

    expect(getUserById).not.toHaveBeenCalled();
    expect(setCloudFrontAuthCookies).not.toHaveBeenCalled();
    expectOpenIDRefreshGrant();
  });

  it('falls through to full OpenID refresh when session tokens are near expiry', async () => {
    const nearExpiryToken = makeSessionToken({ exp: Math.floor(Date.now() / 1000) + 5 });
    setOpenIDReuseCookies();
    req.session = {
      openidTokens: {
        accessToken: nearExpiryToken,
        idToken: nearExpiryToken,
        refreshToken: 'stored-refresh',
        lastRefreshedAt: Date.now(),
      },
    };

    await refreshController(req, res);

    expect(getUserById).not.toHaveBeenCalled();
    expectOpenIDRefreshGrant();
  });

  it('falls through to full OpenID refresh when session tokens have no exp claim', async () => {
    const tokenWithoutExp = jwt.sign({ sub: baseClaims.sub }, idpSigningSecret);
    setOpenIDReuseCookies();
    req.session = {
      openidTokens: {
        accessToken: tokenWithoutExp,
        idToken: tokenWithoutExp,
        refreshToken: 'stored-refresh',
        lastRefreshedAt: Date.now(),
      },
    };

    await refreshController(req, res);

    expect(getUserById).not.toHaveBeenCalled();
    expectOpenIDRefreshGrant();
  });

  it('falls through to full OpenID refresh when the signed reuse user cookie is invalid', async () => {
    setOpenIDReuseCookies('tampered-cookie');
    req.session = {
      openidTokens: {
        accessToken: 'session-access-token',
        idToken: makeSessionToken(),
        refreshToken: 'stored-refresh',
        lastRefreshedAt: Date.now(),
      },
    };

    await refreshController(req, res);

    expect(getUserById).not.toHaveBeenCalled();
    expectOpenIDRefreshGrant();
  });

  it('falls through to full OpenID refresh when the reuse user no longer exists', async () => {
    setOpenIDReuseCookies();
    req.session = {
      openidTokens: {
        accessToken: 'session-access-token',
        idToken: makeSessionToken(),
        refreshToken: 'stored-refresh',
        lastRefreshedAt: Date.now(),
      },
    };
    getUserById.mockResolvedValueOnce(null);

    await refreshController(req, res);

    expect(getUserById).toHaveBeenCalledWith(
      'user-db-id',
      '-password -__v -totpSecret -backupCodes -federatedTokens',
    );
    expect(setCloudFrontAuthCookies).not.toHaveBeenCalled();
    expectOpenIDRefreshGrant();
  });

  it('falls through to full OpenID refresh when session tokens are stale', async () => {
    setOpenIDReuseCookies();
    req.session = {
      openidTokens: {
        accessToken: 'session-access-token',
        idToken: makeSessionToken(),
        refreshToken: 'stored-refresh',
        lastRefreshedAt: Date.now() - 16 * 60 * 1000,
      },
    };

    await refreshController(req, res);

    expect(getUserById).not.toHaveBeenCalled();
    expectOpenIDRefreshGrant();
  });

  it('falls through to full OpenID refresh when session refresh timestamp is in the future', async () => {
    setOpenIDReuseCookies();
    req.session = {
      openidTokens: {
        accessToken: 'session-access-token',
        idToken: makeSessionToken(),
        refreshToken: 'stored-refresh',
        lastRefreshedAt: Date.now() + 60 * 1000,
      },
    };

    await refreshController(req, res);

    expect(getUserById).not.toHaveBeenCalled();
    expectOpenIDRefreshGrant();
  });

  it('falls through to full OpenID refresh for pre-upgrade sessions without lastRefreshedAt', async () => {
    setOpenIDReuseCookies();
    req.session = {
      openidTokens: {
        accessToken: 'session-access-token',
        idToken: makeSessionToken(),
        refreshToken: 'stored-refresh',
      },
    };

    await refreshController(req, res);

    expect(getUserById).not.toHaveBeenCalled();
    expectOpenIDRefreshGrant();
  });

  it('sanitizes Mongoose-style user documents on the OpenID reuse path', async () => {
    const reusableIdToken = makeSessionToken();
    setOpenIDReuseCookies();
    req.session = {
      openidTokens: {
        accessToken: 'session-access-token',
        idToken: reusableIdToken,
        refreshToken: 'stored-refresh',
        lastRefreshedAt: Date.now(),
      },
    };
    const userDocument = {
      toObject: () => ({
        ...defaultUser,
        federatedTokens: { access_token: 'do-not-return' },
      }),
    };
    getUserById.mockResolvedValue(userDocument);

    await refreshController(req, res);

    const sentPayload = res.send.mock.calls[0][0];
    expect(setCloudFrontAuthCookies).toHaveBeenCalledWith(req, res, userDocument);
    expect(sentPayload).toEqual({
      token: reusableIdToken,
      user: expect.objectContaining({
        _id: 'user-db-id',
        email: baseClaims.email,
      }),
    });
    expect(sentPayload.user).not.toHaveProperty('password');
    expect(sentPayload.user).not.toHaveProperty('federatedTokens');
  });

  it('should pass scope-only OpenID refresh params when OPENID_SCOPE is set', async () => {
    process.env.OPENID_SCOPE = 'openid profile email';

    await refreshController(req, res);

    expect(openIdClient.refreshTokenGrant).toHaveBeenCalledWith(
      { some: 'config' },
      'stored-refresh',
      { scope: 'openid profile email' },
    );
  });

  it('should pass scope and audience OpenID refresh params when both are set', async () => {
    process.env.OPENID_SCOPE = 'openid profile email';
    process.env.OPENID_REFRESH_AUDIENCE = 'https://api.example.com';

    await refreshController(req, res);

    expect(openIdClient.refreshTokenGrant).toHaveBeenCalledWith(
      { some: 'config' },
      'stored-refresh',
      {
        scope: 'openid profile email',
        audience: 'https://api.example.com',
      },
    );
  });

  it('should pass audience-only OpenID refresh params when scope is unset', async () => {
    process.env.OPENID_REFRESH_AUDIENCE = 'https://api.example.com';

    await refreshController(req, res);

    expect(openIdClient.refreshTokenGrant).toHaveBeenCalledWith(
      { some: 'config' },
      'stored-refresh',
      { audience: 'https://api.example.com' },
    );
  });

  it('should omit empty OpenID refresh audience', async () => {
    process.env.OPENID_SCOPE = 'openid profile email';
    process.env.OPENID_REFRESH_AUDIENCE = '';

    await refreshController(req, res);

    expect(openIdClient.refreshTokenGrant).toHaveBeenCalledWith(
      { some: 'config' },
      'stored-refresh',
      { scope: 'openid profile email' },
    );
  });

  it('should keep OpenID refresh diagnostics free of token and audience values', async () => {
    process.env.OPENID_SCOPE = 'openid profile email';
    process.env.OPENID_REFRESH_AUDIENCE = 'https://api.example.com';

    await refreshController(req, res);

    expect(logger.debug).toHaveBeenCalledWith('[refreshController] OpenID refresh params', {
      has_scope: true,
      has_refresh_audience: true,
    });
    expect(logger.debug).toHaveBeenCalledWith('[refreshController] OpenID refresh succeeded', {
      has_access_token: true,
      has_id_token: true,
      has_refresh_token: true,
      expires_in: 3600,
    });
    const debugOutput = JSON.stringify(logger.debug.mock.calls);
    expect(debugOutput).not.toContain('stored-refresh');
    expect(debugOutput).not.toContain('new-access');
    expect(debugOutput).not.toContain('new-id');
    expect(debugOutput).not.toContain('new-refresh');
    expect(debugOutput).not.toContain('https://api.example.com');
  });

  it('should use OPENID_EMAIL_CLAIM-resolved value when claim is present in token', async () => {
    const claimsWithUpn = { ...baseClaims, upn: 'user@corp.example.com' };
    mockTokenset.claims.mockReturnValue(claimsWithUpn);
    getOpenIdEmail.mockReturnValue('user@corp.example.com');

    const user = {
      _id: 'user-db-id',
      email: 'user@corp.example.com',
      openidId: baseClaims.sub,
    };
    findOpenIDUser.mockResolvedValue({ user, error: null, migration: false });

    await refreshController(req, res);

    expect(getOpenIdEmail).toHaveBeenCalledWith(claimsWithUpn);
    expect(findOpenIDUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@corp.example.com',
        openidIssuer: baseClaims.iss,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should fall back to claims.email when configured claim is absent from token claims', async () => {
    getOpenIdEmail.mockReturnValue(baseClaims.email);

    await refreshController(req, res);

    expect(findOpenIDUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: baseClaims.email,
        openidIssuer: baseClaims.iss,
      }),
    );
  });

  it('should not expose sensitive fields or federatedTokens in refresh response', async () => {
    await refreshController(req, res);

    const sentPayload = res.send.mock.calls[0][0];
    expect(sentPayload).toEqual({
      token: 'new-app-token',
      user: expect.objectContaining({
        _id: 'user-db-id',
        email: baseClaims.email,
        openidId: baseClaims.sub,
      }),
    });
    expect(sentPayload.user).not.toHaveProperty('federatedTokens');
    expect(sentPayload.user).not.toHaveProperty('password');
    expect(sentPayload.user).not.toHaveProperty('totpSecret');
    expect(sentPayload.user).not.toHaveProperty('backupCodes');
    expect(sentPayload.user).not.toHaveProperty('__v');
  });

  it('should update openidId when migration is triggered on refresh', async () => {
    const user = { _id: 'user-db-id', email: baseClaims.email, openidId: null };
    findOpenIDUser.mockResolvedValue({ user, error: null, migration: true });

    await refreshController(req, res);

    expect(updateUser).toHaveBeenCalledWith(
      'user-db-id',
      expect.objectContaining({
        provider: 'openid',
        openidId: baseClaims.sub,
        openidIssuer: baseClaims.iss,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should return 401 and redirect to /login when findOpenIDUser returns no user', async () => {
    findOpenIDUser.mockResolvedValue({ user: null, error: null, migration: false });

    await refreshController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.redirect).toHaveBeenCalledWith('/login');
  });

  it('should return 401 and redirect when findOpenIDUser returns an error', async () => {
    findOpenIDUser.mockResolvedValue({ user: null, error: 'AUTH_FAILED', migration: false });

    await refreshController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.redirect).toHaveBeenCalledWith('/login');
  });

  it('should preserve invalid OpenID refresh token behavior', async () => {
    openIdClient.refreshTokenGrant.mockRejectedValue(new Error('invalid_grant'));

    await refreshController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Invalid OpenID refresh token');
  });

  it('should skip OpenID path when token_provider is not openid', async () => {
    req.headers.cookie = 'token_provider=local; refreshToken=some-token';

    await refreshController(req, res);

    expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
  });

  it('should skip OpenID path when OPENID_REUSE_TOKENS is disabled', async () => {
    isEnabled.mockReturnValue(false);

    await refreshController(req, res);

    expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
  });

  it('should return 200 with token not provided when refresh token is absent', async () => {
    req.headers.cookie = 'token_provider=openid';
    req.session = {};

    await refreshController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('Refresh token not provided');
  });
});

describe('refreshController – LibreChat path', () => {
  let req, res;
  const refreshSecret = 'test-refresh-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_REFRESH_SECRET = refreshSecret;
    process.env.NODE_ENV = 'test';
    setAuthTokens.mockResolvedValue('local-app-token');
    findSession.mockResolvedValue({ expiration: new Date(Date.now() + 60_000) });

    const refreshToken = jwt.sign({ id: 'local-user-id' }, refreshSecret, {
      expiresIn: '1h',
    });
    req = {
      headers: { cookie: `refreshToken=${refreshToken}` },
      query: {},
      session: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
    };
  });

  afterAll(() => {
    if (ORIGINAL_JWT_REFRESH_SECRET === undefined) {
      delete process.env.JWT_REFRESH_SECRET;
    } else {
      process.env.JWT_REFRESH_SECRET = ORIGINAL_JWT_REFRESH_SECRET;
    }

    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
  });

  it('sanitizes user documents before returning local refresh responses', async () => {
    getUserById.mockResolvedValue({
      toObject: () => ({
        _id: 'local-user-id',
        email: 'local@example.com',
        password: 'hashed-password',
        __v: 1,
        totpSecret: 'totp-secret',
        backupCodes: ['backup-code'],
        federatedTokens: { access_token: 'do-not-return' },
      }),
    });

    await refreshController(req, res);

    const sentPayload = res.send.mock.calls[0][0];
    expect(setAuthTokens).toHaveBeenCalledWith(
      'local-user-id',
      res,
      { expiration: expect.any(Date) },
      req,
    );
    expect(sentPayload).toEqual({
      token: 'local-app-token',
      user: {
        _id: 'local-user-id',
        email: 'local@example.com',
      },
    });
  });

  it('sanitizes user documents before returning CI refresh responses', async () => {
    process.env.NODE_ENV = 'CI';
    getUserById.mockResolvedValue({
      toObject: () => ({
        _id: 'local-user-id',
        email: 'local@example.com',
        password: 'hashed-password',
        __v: 1,
        totpSecret: 'totp-secret',
        backupCodes: ['backup-code'],
        federatedTokens: { access_token: 'do-not-return' },
      }),
    });

    await refreshController(req, res);

    const sentPayload = res.send.mock.calls[0][0];
    expect(findSession).not.toHaveBeenCalled();
    expect(setAuthTokens).toHaveBeenCalledWith('local-user-id', res, null, req);
    expect(sentPayload).toEqual({
      token: 'local-app-token',
      user: {
        _id: 'local-user-id',
        email: 'local@example.com',
      },
    });
  });
});
