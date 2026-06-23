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
  DEFAULT_REFRESH_TOKEN_EXPIRY: 1000 * 60 * 60 * 24 * 7,
}));
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(),
  math: jest.fn((_value, fallback) => fallback),
  buildOpenIDRefreshParams: jest.fn(() => ({ scope: 'openid profile' })),
  setRefreshTokenCookie: jest.fn((res, refreshToken, expires) => {
    res.cookie('refreshToken', refreshToken, { expires });
  }),
}));
jest.mock('./RefreshTokenBridge', () => ({
  storeRefreshTokenBridge: jest.fn(),
}));
jest.mock('./OpenIDRefreshFlight', () => ({
  acquireOpenIDRefreshFlight: jest.fn(),
  completeOpenIDRefreshFlight: jest.fn(),
  createOpenIDRefreshFlightKey: jest.fn(),
  failOpenIDRefreshFlight: jest.fn(),
  waitForOpenIDRefreshFlight: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const openIdClient = require('openid-client');
const { isEnabled, buildOpenIDRefreshParams, setRefreshTokenCookie } = require('@librechat/api');
const { getOpenIdConfig } = require('~/strategies/openidStrategy');
const { storeRefreshTokenBridge } = require('./RefreshTokenBridge');
const {
  acquireOpenIDRefreshFlight,
  completeOpenIDRefreshFlight,
  createOpenIDRefreshFlightKey,
  failOpenIDRefreshFlight,
  waitForOpenIDRefreshFlight,
} = require('./OpenIDRefreshFlight');
const {
  createOpenIDSessionTokenProvider,
  refreshOpenIDSession,
  __internals,
} = require('./OpenIDSessionRefresh');

const SECRET = 'test-secret';

const makeJwt = (exp) => jwt.sign({ sub: 'user-123', exp }, SECRET);

const buildReq = (sessionTokens, sessionId = 'session-A') => ({
  sessionID: sessionId,
  session: Object.assign(
    {
      save: jest.fn((cb) => cb(null)),
    },
    sessionTokens === undefined ? {} : { openidTokens: sessionTokens },
  ),
});

/** Minimal writable Express response stub for cookie-sync assertions. */
const buildRes = ({ headersSent = false } = {}) => ({
  headersSent,
  cookie: jest.fn(),
});

const makeOpenIdUser = (overrides = {}) => ({
  id: 'local-id-1',
  openidId: 'oidc-sub-123',
  provider: 'openid',
  ...overrides,
});

describe('OpenIDSessionRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __internals.inFlightRefreshes.clear();
    isEnabled.mockReturnValue(true);
    getOpenIdConfig.mockReturnValue({ issuer: 'https://issuer.example.com' });
    openIdClient.refreshTokenGrant.mockReset();
    createOpenIDRefreshFlightKey.mockImplementation(
      ({ req, refreshToken }) => refreshToken && `flight:${req?.sessionID}:${refreshToken}`,
    );
    acquireOpenIDRefreshFlight.mockResolvedValue({ acquired: true, ownerId: 'owner-1' });
    completeOpenIDRefreshFlight.mockResolvedValue({});
    failOpenIDRefreshFlight.mockResolvedValue({});
    waitForOpenIDRefreshFlight.mockResolvedValue(null);
  });

  describe('createOpenIDSessionTokenProvider closure no-op cases', () => {
    it('throws when tokenPreference is missing', () => {
      expect(() =>
        createOpenIDSessionTokenProvider({
          req: buildReq({ accessToken: makeJwt(Date.now() / 1000 + 600) }),
          user: makeOpenIdUser(),
        }),
      ).toThrow(/tokenPreference/);
    });

    it('throws when tokenPreference is invalid', () => {
      expect(() =>
        createOpenIDSessionTokenProvider({
          req: buildReq({ accessToken: makeJwt(Date.now() / 1000 + 600) }),
          user: makeOpenIdUser(),
          tokenPreference: 'bogus',
        }),
      ).toThrow(/tokenPreference/);
    });

    it('returns null when OPENID_REUSE_TOKENS is disabled', async () => {
      isEnabled.mockReturnValue(false);
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq({ accessToken: makeJwt(Date.now() / 1000 + 600) }),
        user: makeOpenIdUser(),
        tokenPreference: 'access_token',
      });
      await expect(provider()).resolves.toBeNull();
      expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
    });

    it('returns null when user is non-OpenID', async () => {
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq({ accessToken: makeJwt(Date.now() / 1000 + 600) }),
        user: { id: 'local-1', provider: 'local' },
        tokenPreference: 'access_token',
      });
      await expect(provider()).resolves.toBeNull();
      expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
    });

    it('returns null when user is missing entirely', async () => {
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq({ accessToken: makeJwt(Date.now() / 1000 + 600) }),
        user: undefined,
        tokenPreference: 'access_token',
      });
      await expect(provider()).resolves.toBeNull();
    });

    it('returns null when req.session.openidTokens is missing', async () => {
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq(undefined),
        user: makeOpenIdUser(),
        tokenPreference: 'access_token',
      });
      await expect(provider()).resolves.toBeNull();
      expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
    });

    it('returns null when req is missing entirely', async () => {
      const provider = createOpenIDSessionTokenProvider({
        req: undefined,
        user: makeOpenIdUser(),
        tokenPreference: 'access_token',
      });
      await expect(provider()).resolves.toBeNull();
    });
  });

  describe('refreshOpenIDSession live-token reuse', () => {
    it('returns live tokens without calling IdP when access_token still valid past skew', async () => {
      const farFutureExp = Math.floor(Date.now() / 1000) + 600;
      const sessionTokens = {
        accessToken: makeJwt(farFutureExp),
        idToken: makeJwt(farFutureExp),
        refreshToken: 'rt-1',
      };
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
      expect(result).toEqual({
        access_token: sessionTokens.accessToken,
        id_token: sessionTokens.idToken,
        refresh_token: 'rt-1',
        expires_at: farFutureExp,
      });
    });

    /**
     * The bug fixed by Codex Finding 1a: id_token can outlive access_token.
     * Old behavior would declare "live" because id_token is fresh, sending an
     * expired access_token to the OBO IdP. New behavior must trigger a refresh.
     */
    it('refreshes when access_token is expired even if id_token is still fresh', async () => {
      const accessExp = Math.floor(Date.now() / 1000) - 30;
      const idExp = Math.floor(Date.now() / 1000) + 3600;
      const sessionTokens = {
        accessToken: makeJwt(accessExp),
        idToken: makeJwt(idExp),
        refreshToken: 'rt-asym',
      };
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-asym-2',
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);
      expect(result.access_token).not.toBe(sessionTokens.accessToken);
    });

    it('falls through to refresh when access_token expires within the skew buffer', async () => {
      const veryNearExp = Math.floor(Date.now() / 1000) + 10; // < 30s buffer
      const sessionTokens = {
        accessToken: makeJwt(veryNearExp),
        idToken: makeJwt(veryNearExp),
        refreshToken: 'rt-2',
      };
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-3',
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);
      expect(buildOpenIDRefreshParams).toHaveBeenCalled();
      expect(result.refresh_token).toBe('rt-3');
      expect(req.session.openidTokens.refreshToken).toBe('rt-3');
      expect(req.session.save).toHaveBeenCalled();
    });
  });

  describe('refreshOpenIDSession refresh path', () => {
    it('refreshes when access_token is expired and persists session', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-old',
      };
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-new',
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);
      expect(req.session.save).toHaveBeenCalledTimes(1);
      expect(typeof result.access_token).toBe('string');
      expect(req.session.openidTokens).toEqual(
        expect.objectContaining({
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
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(refreshedExp),
        // id_token and refresh_token both omitted
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      expect(result.id_token).toBe(priorIdToken);
      expect(result.refresh_token).toBe('rt-keep');
      expect(req.session.openidTokens.idToken).toBe(priorIdToken);
      expect(req.session.openidTokens.refreshToken).toBe('rt-keep');
    });

    /**
     * The bug fixed by Codex Finding 1b: when IdP rotates only access_token,
     * derive expires_at from the IdP's tokenset.expires_in (authoritative for
     * the new access_token) rather than the prior id_token's exp claim. The
     * latter would cause `isOpenIDTokenValid` to reject a fresh credential.
     */
    it('uses tokenset.expires_in (not prior id_token exp) for expires_at after rotation-omits-id-token refresh', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-rot',
      };
      // IdP omits id_token; expires_in is the only authoritative expiry source
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(Math.floor(Date.now() / 1000) + 3600),
        // id_token omitted
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);
      const beforeSec = Math.floor(Date.now() / 1000);

      const result = await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      // expires_at should be ~now + 3600, NOT the stale prior id_token exp
      expect(result.expires_at).toBeGreaterThanOrEqual(beforeSec + 3590);
      expect(result.expires_at).toBeLessThanOrEqual(beforeSec + 3610);
    });

    it('returns null when session lacks a refresh_token (cannot refresh)', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        // no refreshToken
      };
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

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

      await expect(
        refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token'),
      ).rejects.toThrow('invalid_grant');
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

      await expect(
        refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token'),
      ).rejects.toThrow(/no access_token/i);
    });
  });

  describe('rotated refresh-token cookie sync', () => {
    const buildExpiredSession = (refreshToken) => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      return {
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken,
      };
    };

    it('writes the rotated refresh token to the cookie when res is writable', async () => {
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-rotated',
        expires_in: 3600,
      });
      const req = buildReq(buildExpiredSession('rt-old'));
      const res = buildRes({ headersSent: false });

      await refreshOpenIDSession(req, res, makeOpenIdUser(), 'access_token');

      expect(setRefreshTokenCookie).toHaveBeenCalledTimes(1);
      expect(setRefreshTokenCookie).toHaveBeenCalledWith(res, 'rt-rotated', expect.any(Date));
      expect(storeRefreshTokenBridge).not.toHaveBeenCalled();
    });

    it('does not write the cookie when the IdP does not rotate the refresh token', async () => {
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        // refresh_token omitted → preserved as 'rt-stable'
        expires_in: 3600,
      });
      const req = buildReq(buildExpiredSession('rt-stable'));
      const res = buildRes({ headersSent: false });

      await refreshOpenIDSession(req, res, makeOpenIdUser(), 'access_token');

      expect(setRefreshTokenCookie).not.toHaveBeenCalled();
    });

    it('stores a recovery bridge when response headers are already sent (streaming path)', async () => {
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-rotated',
        expires_in: 3600,
      });
      const req = buildReq(buildExpiredSession('rt-old'));
      const res = buildRes({ headersSent: true });
      const user = makeOpenIdUser({
        tenantId: 'tenant-1',
        openidIssuer: 'https://issuer.example.com',
      });

      await refreshOpenIDSession(req, res, user, 'access_token');

      expect(setRefreshTokenCookie).not.toHaveBeenCalled();
      expect(storeRefreshTokenBridge).toHaveBeenCalledWith({
        oldRefreshToken: 'rt-old',
        newRefreshToken: 'rt-rotated',
        userId: 'local-id-1',
        tenantId: 'tenant-1',
        openidIssuer: 'https://issuer.example.com',
      });
      /** Session copy remains authoritative even when the cookie can't be set. */
      expect(req.session.openidTokens.refreshToken).toBe('rt-rotated');
    });

    it('does not throw when no res is provided', async () => {
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-rotated',
        expires_in: 3600,
      });
      const req = buildReq(buildExpiredSession('rt-old'));

      await expect(
        refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token'),
      ).resolves.toBeDefined();
      expect(setRefreshTokenCookie).not.toHaveBeenCalled();
      expect(storeRefreshTokenBridge).not.toHaveBeenCalled();
    });

    it('does not fail the refresh when bridge storage fails after headers are sent', async () => {
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-rotated',
        expires_in: 3600,
      });
      storeRefreshTokenBridge.mockRejectedValueOnce(new Error('encrypt failed'));
      const req = buildReq(buildExpiredSession('rt-old'));
      const res = buildRes({ headersSent: true });

      await expect(
        refreshOpenIDSession(req, res, makeOpenIdUser(), 'access_token'),
      ).resolves.toBeDefined();

      expect(req.session.openidTokens.refreshToken).toBe('rt-rotated');
    });
  });

  describe('single-flight coalescing', () => {
    it('shares one refreshTokenGrant call across concurrent waiters in the SAME session', async () => {
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

      const req = buildReq(sessionTokens, 'session-shared');
      const user = makeOpenIdUser();

      const p1 = refreshOpenIDSession(req, undefined, user, 'access_token');
      const p2 = refreshOpenIDSession(req, undefined, user, 'access_token');
      await Promise.resolve();

      // Both calls land before the IdP responds
      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);

      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      resolveGrant({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-rotated',
        expires_in: 3600,
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(r2);
      expect(__internals.inFlightRefreshes.size).toBe(0);
    });

    /**
     * Codex Finding 3: distinct sessions for the same OpenID subject must NOT
     * share an in-flight refresh, otherwise refresh-token rotation breaks the
     * non-winning session silently. Per-sessionID keying isolates them.
     */
    it('does NOT share an in-flight refresh across DIFFERENT sessions for the same user', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const reqA = buildReq(
        {
          accessToken: makeJwt(expiredExp),
          idToken: makeJwt(expiredExp),
          refreshToken: 'rt-A',
        },
        'session-A',
      );
      const reqB = buildReq(
        {
          accessToken: makeJwt(expiredExp),
          idToken: makeJwt(expiredExp),
          refreshToken: 'rt-B',
        },
        'session-B',
      );
      let resolveA;
      let resolveB;
      const promiseA = new Promise((resolve) => {
        resolveA = resolve;
      });
      const promiseB = new Promise((resolve) => {
        resolveB = resolve;
      });
      openIdClient.refreshTokenGrant.mockReturnValueOnce(promiseA).mockReturnValueOnce(promiseB);

      const user = makeOpenIdUser();
      const pA = refreshOpenIDSession(reqA, undefined, user, 'access_token');
      const pB = refreshOpenIDSession(reqB, undefined, user, 'access_token');
      await Promise.resolve();

      // Two refreshes started, one per session
      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(2);

      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      resolveA({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-A-rotated',
        expires_in: 3600,
      });
      resolveB({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-B-rotated',
        expires_in: 3600,
      });

      const [rA, rB] = await Promise.all([pA, pB]);
      expect(rA).not.toBe(rB);
      expect(reqA.session.openidTokens.refreshToken).toBe('rt-A-rotated');
      expect(reqB.session.openidTokens.refreshToken).toBe('rt-B-rotated');
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

      await expect(refreshOpenIDSession(req, undefined, user, 'access_token')).rejects.toThrow(
        'transient',
      );
      expect(__internals.inFlightRefreshes.size).toBe(0);

      // Second attempt: succeed
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-recovered',
        expires_in: 3600,
      });
      const result = await refreshOpenIDSession(req, undefined, user, 'access_token');
      expect(result.refresh_token).toBe('rt-recovered');
    });

    it('hydrates a joining request that shares the session id but carries a distinct req', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const makeExpiredSession = (refreshToken) => ({
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken,
      });
      /** Two concurrent HTTP requests from the same browser session. */
      const leaderReq = buildReq(makeExpiredSession('rt-stale'), 'session-joined');
      const joinerReq = buildReq(makeExpiredSession('rt-stale'), 'session-joined');
      const user = makeOpenIdUser();

      let resolveGrant;
      const grantPromise = new Promise((resolve) => {
        resolveGrant = resolve;
      });
      openIdClient.refreshTokenGrant.mockReturnValueOnce(grantPromise);

      const leaderPromise = refreshOpenIDSession(leaderReq, undefined, user, 'access_token');
      const joinerPromise = refreshOpenIDSession(joinerReq, undefined, user, 'access_token');
      await Promise.resolve();

      // Only the leader hit the IdP; the joiner coalesced onto it.
      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);

      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      resolveGrant({
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-rotated',
        expires_in: 3600,
      });

      const [leaderTokens, joinerTokens] = await Promise.all([leaderPromise, joinerPromise]);

      expect(leaderTokens.refresh_token).toBe('rt-rotated');
      expect(joinerTokens.refresh_token).toBe('rt-rotated');
      // The joiner's OWN session is hydrated so a later OBO call won't replay rt-stale.
      expect(joinerReq.session.openidTokens.refreshToken).toBe('rt-rotated');
      expect(joinerReq.session.save).toHaveBeenCalled();
    });

    it('hydrates a joining request when the refresh token stays stable', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const makeExpiredSession = () => ({
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-stable',
        accessTokenExpiresAt: expiredExp,
      });
      const leaderReq = buildReq(makeExpiredSession(), 'session-stable-joined');
      const joinerReq = buildReq(makeExpiredSession(), 'session-stable-joined');
      const user = makeOpenIdUser();

      let resolveGrant;
      const grantPromise = new Promise((resolve) => {
        resolveGrant = resolve;
      });
      openIdClient.refreshTokenGrant.mockReturnValueOnce(grantPromise);

      const leaderPromise = refreshOpenIDSession(leaderReq, undefined, user, 'access_token');
      const joinerPromise = refreshOpenIDSession(joinerReq, undefined, user, 'access_token');
      await Promise.resolve();

      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);

      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      const refreshedAccessToken = makeJwt(refreshedExp);
      const refreshedIdToken = makeJwt(refreshedExp);
      resolveGrant({
        access_token: refreshedAccessToken,
        id_token: refreshedIdToken,
        refresh_token: 'rt-stable',
        expires_in: 3600,
      });

      const [leaderTokens, joinerTokens] = await Promise.all([leaderPromise, joinerPromise]);

      expect(leaderTokens.refresh_token).toBe('rt-stable');
      expect(joinerTokens.refresh_token).toBe('rt-stable');
      expect(joinerReq.session.openidTokens.accessToken).toBe(refreshedAccessToken);
      expect(joinerReq.session.openidTokens.idToken).toBe(refreshedIdToken);
      expect(joinerReq.session.openidTokens.refreshToken).toBe('rt-stable');
      expect(joinerReq.session.openidTokens.accessTokenExpiresAt).toBe(joinerTokens.expires_at);
      expect(joinerReq.session.openidTokens.accessTokenExpiresAt).toBeGreaterThan(expiredExp);
      expect(joinerReq.session.save).toHaveBeenCalled();
    });

    it('joins a shared Mongo refresh flight when the local process has no in-flight entry', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const makeExpiredSession = () => ({
        accessToken: makeJwt(expiredExp),
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-cross-worker',
      });
      const leaderReq = buildReq(makeExpiredSession(), 'session-cross-worker');
      const joinerReq = buildReq(makeExpiredSession(), 'session-cross-worker');
      const user = makeOpenIdUser();

      let resolveGrant;
      const grantPromise = new Promise((resolve) => {
        resolveGrant = resolve;
      });
      openIdClient.refreshTokenGrant.mockReturnValueOnce(grantPromise);
      acquireOpenIDRefreshFlight
        .mockResolvedValueOnce({ acquired: true, ownerId: 'owner-leader' })
        .mockResolvedValueOnce({ acquired: false, ownerId: 'owner-joiner' });

      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      const sharedTokens = {
        access_token: makeJwt(refreshedExp),
        id_token: makeJwt(refreshedExp),
        refresh_token: 'rt-cross-worker-rotated',
        expires_at: refreshedExp,
      };
      waitForOpenIDRefreshFlight.mockResolvedValueOnce(sharedTokens);

      const leaderPromise = refreshOpenIDSession(leaderReq, undefined, user, 'access_token');
      await Promise.resolve();
      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);

      /**
       * Simulate a second worker: it does not see this process-local Map, but
       * it does see the Mongo flight for the same browser session/token.
       */
      __internals.inFlightRefreshes.clear();
      const joinerTokens = await refreshOpenIDSession(joinerReq, undefined, user, 'access_token');

      expect(waitForOpenIDRefreshFlight).toHaveBeenCalledWith({
        key: 'flight:session-cross-worker:rt-cross-worker',
      });
      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);
      expect(joinerTokens).toBe(sharedTokens);
      expect(joinerReq.session.openidTokens.refreshToken).toBe('rt-cross-worker-rotated');
      expect(joinerReq.session.save).toHaveBeenCalled();

      resolveGrant({
        access_token: sharedTokens.access_token,
        id_token: sharedTokens.id_token,
        refresh_token: sharedTokens.refresh_token,
        expires_in: 3600,
      });

      await expect(leaderPromise).resolves.toEqual(
        expect.objectContaining({
          access_token: sharedTokens.access_token,
          id_token: sharedTokens.id_token,
          refresh_token: sharedTokens.refresh_token,
          expires_at: expect.any(Number),
        }),
      );
      expect(completeOpenIDRefreshFlight).toHaveBeenCalledWith({
        key: 'flight:session-cross-worker:rt-cross-worker',
        ownerId: 'owner-leader',
        tokens: expect.objectContaining({
          access_token: sharedTokens.access_token,
          id_token: sharedTokens.id_token,
          refresh_token: sharedTokens.refresh_token,
          expires_at: expect.any(Number),
        }),
      });
    });
  });

  describe('createOpenIDSessionTokenProvider closure delegation', () => {
    it('returns the live OIDCTokens shape from a valid session', async () => {
      const farFutureExp = Math.floor(Date.now() / 1000) + 600;
      const sessionTokens = {
        accessToken: makeJwt(farFutureExp),
        idToken: makeJwt(farFutureExp),
        refreshToken: 'rt-1',
      };
      const provider = createOpenIDSessionTokenProvider({
        req: buildReq(sessionTokens),
        user: makeOpenIdUser(),
        tokenPreference: 'access_token',
      });

      const result = await provider();
      expect(result).toEqual({
        access_token: sessionTokens.accessToken,
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
        tokenPreference: 'access_token',
      });

      await expect(provider()).rejects.toThrow('invalid_grant');
    });
  });

  /**
   * Codex Finding 4: opaque (non-JWT) access tokens make `decodeJwtExp` return
   * null, which would force every OBO call to refresh even when the previous
   * refresh response advertised a still-valid `expires_in`. The fix persists
   * `accessTokenExpiresAt` (unix seconds) on each refresh and uses it as a
   * fallback for the freshness check + `expires_at` derivation.
   */
  describe('opaque access token support (accessTokenExpiresAt fallback)', () => {
    it('reuses live opaque access_token when accessTokenExpiresAt is in the future', async () => {
      const farFutureExp = Math.floor(Date.now() / 1000) + 600;
      const sessionTokens = {
        accessToken: 'opaque-blob-not-a-jwt',
        idToken: makeJwt(farFutureExp),
        refreshToken: 'rt-opaque',
        accessTokenExpiresAt: farFutureExp,
      };
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      expect(openIdClient.refreshTokenGrant).not.toHaveBeenCalled();
      expect(result).toEqual({
        access_token: 'opaque-blob-not-a-jwt',
        id_token: sessionTokens.idToken,
        refresh_token: 'rt-opaque',
        expires_at: farFutureExp,
      });
    });

    it('refreshes opaque access_token when accessTokenExpiresAt has passed', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      const sessionTokens = {
        accessToken: 'opaque-stale',
        idToken: makeJwt(refreshedExp), // id_token still valid
        refreshToken: 'rt-opaque-stale',
        accessTokenExpiresAt: expiredExp,
      };
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: 'opaque-fresh',
        // IdP omits id_token (Auth0 rotation off / MS personal); we use expires_in
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);

      const result = await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);
      expect(result.access_token).toBe('opaque-fresh');
    });

    it('refreshes opaque access_token when no JWT exp and no accessTokenExpiresAt are present', async () => {
      const refreshedExp = Math.floor(Date.now() / 1000) + 3600;
      const sessionTokens = {
        accessToken: 'opaque-no-expiry',
        idToken: makeJwt(refreshedExp),
        refreshToken: 'rt-no-exp',
        // accessTokenExpiresAt deliberately omitted
      };
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: 'opaque-fresh',
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);

      await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      expect(openIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);
    });

    it('persists accessTokenExpiresAt to req.session.openidTokens after a refresh with expires_in', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: 'opaque-stale',
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-persist',
      };
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: 'opaque-fresh',
        expires_in: 3600,
      });
      const req = buildReq(sessionTokens);
      const beforeSec = Math.floor(Date.now() / 1000);

      await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      const persistedExp = req.session.openidTokens.accessTokenExpiresAt;
      expect(typeof persistedExp).toBe('number');
      expect(persistedExp).toBeGreaterThanOrEqual(beforeSec + 3590);
      expect(persistedExp).toBeLessThanOrEqual(beforeSec + 3610);
    });

    it('drops a stale accessTokenExpiresAt when the new tokenset has neither expires_in nor a JWT access_token', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const sessionTokens = {
        accessToken: 'opaque-old',
        idToken: makeJwt(expiredExp),
        refreshToken: 'rt-drop',
        accessTokenExpiresAt: expiredExp, // stale carry-over
      };
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: 'opaque-fresh-no-meta',
        // no expires_in, no JWT access_token, no id_token
      });
      const req = buildReq(sessionTokens);

      await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      expect(req.session.openidTokens).not.toHaveProperty('accessTokenExpiresAt');
    });

    it('getAccessTokenExp prefers JWT exp over the persisted accessTokenExpiresAt', () => {
      const jwtExp = Math.floor(Date.now() / 1000) + 600;
      const persistedExp = Math.floor(Date.now() / 1000) - 60; // stale
      const result = __internals.getAccessTokenExp({
        accessToken: makeJwt(jwtExp),
        accessTokenExpiresAt: persistedExp,
      });
      expect(result).toBe(jwtExp);
    });

    it('getAccessTokenExp returns null when neither a decodable JWT nor a persisted expiry is present', () => {
      const result = __internals.getAccessTokenExp({
        accessToken: 'opaque',
      });
      expect(result).toBeNull();
    });

    /**
     * Codex Finding 6: id_token TTL is governed by IdP session policy and is
     * often longer than access-token TTL. Trusting it as access-token expiry
     * would mark an opaque access token reusable past its real lifetime,
     * sending an expired credential to the OBO IdP. The fallback chain must
     * be expires_in → JWT access_token exp → unset (NOT id_token exp).
     */
    it('does NOT fall back to id_token exp for accessTokenExpiresAt when expires_in is missing', async () => {
      const longLivedIdTokenExp = Math.floor(Date.now() / 1000) + 86400; // 24h
      const sessionTokens = {
        accessToken: 'opaque-old',
        idToken: makeJwt(Math.floor(Date.now() / 1000) - 60),
        refreshToken: 'rt-no-fallback',
      };
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: 'opaque-fresh', // opaque, NOT a JWT
        id_token: makeJwt(longLivedIdTokenExp), // long-lived id_token
        // no expires_in
      });
      const req = buildReq(sessionTokens);

      await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      // The long-lived id_token exp must NOT have been borrowed for the access token.
      expect(req.session.openidTokens).not.toHaveProperty('accessTokenExpiresAt');
    });

    it('falls back to JWT access_token exp for accessTokenExpiresAt when expires_in is missing', async () => {
      const accessExp = Math.floor(Date.now() / 1000) + 1800; // 30min
      const sessionTokens = {
        accessToken: 'opaque-old',
        idToken: makeJwt(Math.floor(Date.now() / 1000) - 60),
        refreshToken: 'rt-jwt-access',
      };
      openIdClient.refreshTokenGrant.mockResolvedValueOnce({
        access_token: makeJwt(accessExp), // JWT access token
        id_token: makeJwt(Math.floor(Date.now() / 1000) + 86400), // long-lived; should NOT win
        // no expires_in
      });
      const req = buildReq(sessionTokens);

      await refreshOpenIDSession(req, undefined, makeOpenIdUser(), 'access_token');

      // accessTokenExpiresAt comes from the access token's own JWT exp, not the id_token.
      expect(req.session.openidTokens.accessTokenExpiresAt).toBe(accessExp);
    });
  });
});
