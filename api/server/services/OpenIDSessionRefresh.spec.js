jest.mock('openid-client', () => ({
  refreshTokenGrant: jest.fn(),
}));
jest.mock('~/strategies/openidStrategy', () => ({
  getOpenIdConfig: jest.fn(),
}));
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(),
  buildOpenIDRefreshParams: jest.fn(() => ({ scope: 'openid profile' })),
}));

const jwt = require('jsonwebtoken');
const openIdClient = require('openid-client');
const { isEnabled, buildOpenIDRefreshParams } = require('@librechat/api');
const { getOpenIdConfig } = require('~/strategies/openidStrategy');
const {
  createOpenIDSessionTokenProvider,
  refreshOpenIDSession,
  __internals,
} = require('./OpenIDSessionRefresh');

const SECRET = 'test-secret';

const makeJwt = (exp) => jwt.sign({ sub: 'user-123', exp }, SECRET);

const buildReq = (sessionTokens) => ({
  session: Object.assign(
    {
      save: jest.fn((cb) => cb(null)),
    },
    sessionTokens === undefined ? {} : { openidTokens: sessionTokens },
  ),
});

const makeOpenIdUser = () => ({
  id: 'local-id-1',
  openidId: 'oidc-sub-123',
  provider: 'openid',
});

describe('OpenIDSessionRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __internals.inFlightRefreshes.clear();
    isEnabled.mockReturnValue(true);
    getOpenIdConfig.mockReturnValue({ issuer: 'https://issuer.example.com' });
    openIdClient.refreshTokenGrant.mockReset();
  });

  describe('createOpenIDSessionTokenProvider closure no-op cases', () => {
    it('returns null when OPENID_REUSE_TOKENS is disabled', async () => {
      isEnabled.mockReturnValue(false);
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq({ accessToken: makeJwt(Date.now() / 1000 + 600) }),
        user: makeOpenIdUser(),
      });
      await expect(provider()).resolves.toBeNull();
      expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
    });

    it('returns null when user is non-OpenID', async () => {
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq({ accessToken: makeJwt(Date.now() / 1000 + 600) }),
        user: { id: 'local-1', provider: 'local' },
      });
      await expect(provider()).resolves.toBeNull();
      expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
    });

    it('returns null when user is missing entirely', async () => {
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq({ accessToken: makeJwt(Date.now() / 1000 + 600) }),
        user: undefined,
      });
      await expect(provider()).resolves.toBeNull();
    });

    it('returns null when req.session.openidTokens is missing', async () => {
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq(undefined),
        user: makeOpenIdUser(),
      });
      await expect(provider()).resolves.toBeNull();
      expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
    });

    it('returns null when req is missing entirely', async () => {
      const provider = createOpenIDSessionTokenProvider({
        req: undefined,
        user: makeOpenIdUser(),
      });
      await expect(provider()).resolves.toBeNull();
    });
  });

  describe('refreshOpenIDSession live-token reuse', () => {
    it('returns live tokens without calling IdP when id_token still valid past skew', async () => {
      const farFutureExp = Math.floor(Date.now() / 1000) + 600;
      const sessionTokens = {
        accessToken: 'opaque-access-token',
        idToken: makeJwt(farFutureExp),
        refreshToken: 'rt-1',
      };
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, makeOpenIdUser());

      expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
      expect(result).toEqual({
        access_token: 'opaque-access-token',
        id_token: sessionTokens.idToken,
        refresh_token: 'rt-1',
        expires_at: farFutureExp,
      });
    });

    it('falls through to refresh when id_token expires within the skew buffer', async () => {
      const veryNearExp = Math.floor(Date.now() / 1000) + 10; // < 30s buffer
      const sessionTokens = {
        accessToken: makeJwt(veryNearExp),
        idToken: makeJwt(veryNearExp),
        refreshToken: 'rt-2',
      };
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: 'new-access',
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-3',
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, makeOpenIdUser());

      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);
      expect(buildOpenIDRefreshParams).toHaveBeenCalled();
      expect(result.access_token).toBe('new-access');
      expect(result.refresh_token).toBe('rt-3');
      expect(req.session.openidTokens.refreshToken).toBe('rt-3');
      expect(req.session.openidTokens.accessToken).toBe('new-access');
      expect(req.session.save).toHaveBeenCalled();
    });
  });

  describe('refreshOpenIDSession refresh path', () => {
    it('refreshes when id_token is expired and persists session', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-old',
      };
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: 'new-access',
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-new',
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, makeOpenIdUser());

      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);
      expect(req.session.save).toHaveBeenCalledTimes(1);
      expect(result.access_token).toBe('new-access');
      expect(req.session.openidTokens).toEqual(
        expect.objectContaining({
          accessToken: 'new-access',
          refreshToken: 'rt-new',
          lastRefreshedAt: expect.any(Number),
        }),
      );
    });

    it('preserves prior id_token and refresh_token when IdP omits them on rotation', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const priorIdToken = makeJwt(expiredExp);
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: priorIdToken,
        refreshToken: 'rt-keep',
      };
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: 'new-access',
        // id_token and refresh_token both omitted
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, makeOpenIdUser());

      expect(result.id_token).toBe(priorIdToken);
      expect(result.refresh_token).toBe('rt-keep');
      expect(req.session.openidTokens.idToken).toBe(priorIdToken);
      expect(req.session.openidTokens.refreshToken).toBe('rt-keep');
    });

    it('returns null when session lacks a refresh_token (cannot refresh)', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        // no refreshToken
      };
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, makeOpenIdUser());

      expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('rethrows when refreshTokenGrant rejects', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-bad',
      };
      openIdClient.refreshTokenGrant.mockRejectedValueOnce(new Error('invalid_grant'));
      const req = buildReq(sessionTokens);

      await expect(refreshOpenIDSession(req, makeOpenIdUser())).rejects.toThrow('invalid_grant');
      expect(req.session.save).not.toHaveBeenCalled();
    });

    it('rethrows when refreshTokenGrant returns no access_token', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-incomplete',
      };
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        // access_token absent
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);

      await expect(refreshOpenIDSession(req, makeOpenIdUser())).rejects.toThrow(/no access_token/i);
    });
  });

  describe('single-flight coalescing', () => {
    it('shares one refreshTokenGrant call across concurrent waiters with same userId', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-shared',
      };
      let resolveGrant;
      const grantPromise = new Promise((resolve) => {
        resolveGrant = resolve;
      });
      openIdClient.refreshTokenGrant.mockReturnValueOnce(grantPromise);

      const req = buildReq(sessionTokens);
      const user = makeOpenIdUser();

      const p1 = refreshOpenIDSession(req, user);
      const p2 = refreshOpenIDSession(req, user);

      // Both calls land before the IdP responds
      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);

      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      resolveGrant({
        access_token: 'new-access',
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-rotated',
        expires_in: 3600,
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(r2);
      expect(r1.access_token).toBe('new-access');
      expect(__internals.inFlightRefreshes.size).toBe(0);
    });

    it('clears in-flight slot on rejection so subsequent attempts can retry', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-flaky',
      };
      openIdClient.refreshTokenGrant.mockRejectedValueOnce(new Error('transient'));
      const req = buildReq(sessionTokens);
      const user = makeOpenIdUser();

      await expect(refreshOpenIDSession(req, user)).rejects.toThrow('transient');
      expect(__internals.inFlightRefreshes.size).toBe(0);

      // Second attempt: succeed
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: 'new-access',
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-recovered',
        expires_in: 3600,
      });
      const result = await refreshOpenIDSession(req, user);
      expect(result.access_token).toBe('new-access');
    });
  });

  describe('createOpenIDSessionTokenProvider closure delegation', () => {
    it('returns the live OIDCTokens shape from a valid session', async () => {
      const farFutureExp = Math.floor(Date.now() / 1000) + 600;
      const sessionTokens = {
        accessToken: 'access-1',
        idToken: makeJwt(farFutureExp),
        refreshToken: 'rt-1',
      };
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq(sessionTokens),
        user: makeOpenIdUser(),
      });

      const result = await provider();
      expect(result).toEqual({
        access_token: 'access-1',
        id_token: sessionTokens.idToken,
        refresh_token: 'rt-1',
        expires_at: farFutureExp,
      });
    });

    it('rejects with the IdP error when refresh fails through the closure', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-fail',
      };
      openIdClient.refreshTokenGrant.mockRejectedValueOnce(new Error('invalid_grant'));
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq(sessionTokens),
        user: makeOpenIdUser(),
      });

      await expect(provider()).rejects.toThrow('invalid_grant');
    });
  });
});
