const cookieParser = require('cookie-parser');
const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const os = require('os');
const path = require('path');
const passport = require('passport');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { AUTH_USER_DOC_BY_ID_PREFIX, CacheKeys } = require('librechat-data-provider');

const mockVerifyToken = jest.fn();
const mockClerkProfileFetch = jest.fn();

const configFixturePath = path.join(
  os.tmpdir(),
  `librechat-clerk-auth-closure-${process.pid}.yaml`,
);
fs.writeFileSync(
  configFixturePath,
  ['version: 1.3.13', 'balance:', '  enabled: true', '  startBalance: 12345', ''].join('\n'),
);

jest.mock('@clerk/backend', () => ({
  ...jest.requireActual('@clerk/backend'),
  verifyToken: (...args) => mockVerifyToken(...args),
}));

const environment = {
  ALLOW_SOCIAL_REGISTRATION: 'true',
  AUTH_USER_CACHE_MODE: 'on',
  BAN_VIOLATIONS: 'false',
  CLERK_AUTHORIZED_PARTIES: 'https://chat.example.com',
  CLERK_JWT_KEY: 'clerk-login-closure-public-key',
  CLERK_PUBLISHABLE_KEY: 'pk_test_clerk_login_closure',
  CLERK_SECRET_KEY: 'sk_test_clerk_login_closure',
  CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_clerk_login_closure',
  CONFIG_PATH: configFixturePath,
  DOMAIN_CLIENT: 'https://chat.example.com',
  DOMAIN_SERVER: 'https://api.example.com',
  JWT_REFRESH_SECRET: 'clerk-login-closure-refresh-secret',
  JWT_SECRET: 'clerk-login-closure-access-secret',
  LOGIN_MAX: '1000',
  LOGIN_WINDOW: '5',
  NODE_ENV: 'test',
  REFRESH_TOKEN_EXPIRY: '1000 * 60 * 60',
  SESSION_COOKIE_SECURE: 'true',
  SESSION_EXPIRY: '1000 * 60 * 15',
};
const savedEnvironment = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);
Object.assign(process.env, environment);
const savedFetch = globalThis.fetch;
globalThis.fetch = (...args) => mockClerkProfileFetch(...args);

const { createModels, ensureClerkIndexes, runAsSystem } = require('@librechat/data-schemas');
const { preAuthTenantMiddleware } = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');
const middleware = require('~/server/middleware');
const { clearAppConfigCache } = require('~/server/services/Config');
const jwtLogin = require('~/strategies/jwtStrategy');

createModels(mongoose);
const methods = require('~/models');
const { generateTOTP } = require('~/server/services/twoFactorService');
const authRoute = require('./auth');
const mountAuthRoute = require('./mountAuth');

afterAll(() => {
  fs.rmSync(configFixturePath, { force: true });
  globalThis.fetch = savedFetch;
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(passport.initialize());
  app.use((req, res, next) => {
    if (req.get('X-Clerk-Test-Fail-Cookie') !== 'once') {
      return next();
    }
    const setCookie = res.cookie.bind(res);
    let shouldFail = true;
    res.cookie = (...args) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('injected pre-flush cookie assembly failure');
      }
      return setCookie(...args);
    };
    return next();
  });
  mountAuthRoute(app, { auth: authRoute }, preAuthTenantMiddleware);
  app.get('/api/clerk-protected-probe', middleware.requireJwtAuth, (req, res) =>
    res.status(200).json({
      id: req.user._id.toString(),
      provider: req.user.provider,
      tenantId: req.user.tenantId,
    }),
  );
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
  return app;
}

function verifiedClaims({ clerkId, clerkSessionId, clerkTokenId, lifetimeSeconds = 600 }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    azp: 'https://chat.example.com',
    exp: issuedAt + lifetimeSeconds,
    iat: issuedAt,
    iss: 'https://clerk.example.com',
    jti: clerkTokenId,
    sid: clerkSessionId,
    sts: 'active',
    sub: clerkId,
  };
}

function verifiedProfile({ clerkId, email, name = 'Clerk User', username = 'clerk-user' }) {
  const [firstName, ...lastName] = name.split(' ');
  return {
    email_addresses: [
      {
        email_address: email,
        id: 'email_primary',
        verification: { status: 'verified' },
      },
    ],
    first_name: firstName,
    id: clerkId,
    image_url: 'https://images.example.com/avatar.png',
    last_name: lastName.join(' '),
    primary_email_address_id: 'email_primary',
    username,
  };
}

function arrangeClerkIdentity({
  token,
  clerkId,
  clerkSessionId,
  clerkTokenId,
  email,
  lifetimeSeconds,
}) {
  mockVerifyToken.mockResolvedValue(
    verifiedClaims({ clerkId, clerkSessionId, clerkTokenId, lifetimeSeconds }),
  );
  if (email) {
    mockClerkProfileFetch.mockResolvedValue(
      new Response(JSON.stringify(verifiedProfile({ clerkId, email })), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
  }
  return token;
}

async function seedUser({
  clerkId,
  email,
  provider = 'local',
  tenantId,
  twoFactorEnabled = false,
  totpSecret,
}) {
  return runAsSystem(() =>
    mongoose.models.User.create({
      clerkId,
      email,
      emailVerified: true,
      provider,
      tenantId,
      termsAccepted: true,
      totpSecret,
      twoFactorEnabled,
    }),
  );
}

async function seedBalance(userId, tenantId = 'tenant-a') {
  return runAsSystem(() =>
    mongoose.models.Balance.create({
      tenantId,
      tokenCredits: 12345,
      user: userId,
    }),
  );
}

async function readBalance(userId) {
  return runAsSystem(() => mongoose.models.Balance.findOne({ user: userId }).lean());
}

function getAuthCookies(response) {
  const cookies = response.headers['set-cookie'] ?? [];
  return {
    all: cookies,
    refreshToken: cookies.find((cookie) => cookie.startsWith('refreshToken=')),
    tokenProvider: cookies.find((cookie) => cookie.startsWith('token_provider=')),
  };
}

function cookieValue(cookie) {
  return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';')));
}

function getCookieExpiration(cookie) {
  const match = cookie.match(/Expires=([^;]+)/);
  return match ? Date.parse(match[1]) : Number.NaN;
}

function expectCappedAuthCookies(response, absoluteExpiresAt) {
  const cookies = getAuthCookies(response);
  expect(cookies.all).toHaveLength(2);
  for (const cookie of cookies.all) {
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toMatch(/Expires=[^;]+/);
  }
  const exactExpiry = Math.floor(absoluteExpiresAt.getTime() / 1000) * 1000;
  expect(cookies.all.map(getCookieExpiration)).toEqual([exactExpiry, exactExpiry]);
  expect(cookies.tokenProvider).toMatch(/^token_provider=librechat;/);
  return cookies;
}

function expectClearedAuthCookies(response) {
  expect(getAuthCookies(response).all).toEqual([
    'refreshToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'token_provider=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]);
}

function postClerk(app, clerkToken, tenantId = 'tenant-a') {
  const pendingRequest = request(app).post('/api/auth/clerk');
  if (tenantId) {
    pendingRequest.set('X-Tenant-Id', tenantId);
  }
  return pendingRequest.send({ clerkToken });
}

async function readClerkState({ clerkTokenId, clerkSessionId, clerkId }) {
  return runAsSystem(async () => ({
    consumed: await methods.findConsumedTokenClaim('tenant-a', clerkTokenId),
    sessionState: await methods.findSessionState(clerkSessionId),
    userState: await methods.findUserState(clerkId),
    session: await mongoose.models.Session.findOne({ clerkTokenId }).lean(),
    user: await mongoose.models.User.findOne({ clerkId }).select('+clerkDeletedAt').lean(),
  }));
}

async function snapshotAuthCollections() {
  return runAsSystem(async () => ({
    balances: await mongoose.models.Balance.countDocuments({}),
    claims: await mongoose.models.ClerkAuthClaim.countDocuments({}),
    sessions: await mongoose.models.Session.countDocuments({}),
    users: await mongoose.models.User.countDocuments({}),
  }));
}

function expectCollectionDelta(before, after, delta) {
  expect(after).toEqual(
    Object.fromEntries(
      Object.entries(before).map(([collection, count]) => [
        collection,
        count + (delta[collection] ?? 0),
      ]),
    ),
  );
}

async function clearAuthCollections() {
  await runAsSystem(async () => {
    await Promise.all(
      ['Balance', 'ClerkAuthClaim', 'Session', 'User'].map((modelName) =>
        mongoose.models[modelName].deleteMany({}),
      ),
    );
  });
  await Promise.all([clearAppConfigCache(), getLogStores(CacheKeys.AUTH_USER_DOC).clear()]);
}

describe.each(['index.js', 'experimental.js'])('%s Clerk login mount', (entrypoint) => {
  const source = fs.readFileSync(path.join(__dirname, '..', entrypoint), 'utf8');

  it('uses the shared auth mount that is exercised by the HTTP closure', () => {
    expect(source).toContain("const mountAuthRoute = require('./routes/mountAuth');");
    expect(source).toContain('mountAuthRoute(app, routes, preAuthTenantMiddleware);');
  });

  it('carries a strict tenant header through the real middleware to the real Clerk route', async () => {
    mockVerifyToken.mockRejectedValue(new Error(`${entrypoint} contract-faithful Clerk rejection`));
    const topologyApp = express();
    topologyApp.use(express.json());
    mountAuthRoute(topologyApp, { auth: authRoute }, preAuthTenantMiddleware);

    const response = await request(topologyApp)
      .post('/api/auth/clerk')
      .set('X-Tenant-Id', `tenant-${entrypoint}`)
      .send({ clerkToken: `rejected-${entrypoint}` });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'CLERK_TOKEN_INVALID' });
  });
});

describe('Clerk login and local 2FA closure', () => {
  jest.setTimeout(60_000);

  let replSet;
  let app;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), {
      dbName: `clerk_login_closure_${Date.now()}`,
    });
    await ensureClerkIndexes(mongoose.connection);
    passport.use('jwt', jwtLogin());
    app = createApp();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockVerifyToken.mockRejectedValue(new Error('contract-faithful Clerk rejection'));
    mockClerkProfileFetch.mockRejectedValue(new Error('unexpected Clerk profile request'));
    process.env.ALLOW_SOCIAL_REGISTRATION = 'true';
    await clearAuthCollections();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
  });

  it('rejects an invalid Clerk token before producing state or cookies', async () => {
    const before = await snapshotAuthCollections();

    const response = await request(app)
      .post('/api/auth/clerk')
      .set('X-Tenant-Id', 'tenant-a')
      .send({ clerkToken: 'rejected-clerk-token' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'CLERK_TOKEN_INVALID' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await snapshotAuthCollections()).toEqual(before);
  });

  it('creates one correlated capped Session and authenticates its bearer token', async () => {
    const clerkId = 'user_exact_subject';
    const clerkSessionId = 'sess_exact_subject';
    const clerkTokenId = 'jti_exact_subject';
    const user = await seedUser({
      clerkId,
      email: 'exact@example.com',
      provider: 'local',
      tenantId: 'tenant-a',
    });
    const clerkToken = arrangeClerkIdentity({
      token: 'exact-subject-token',
      clerkId,
      clerkSessionId,
      clerkTokenId,
    });
    const before = await snapshotAuthCollections();

    const response = await postClerk(app, clerkToken);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['token', 'user']);
    expect(response.body.user).toMatchObject({
      email: 'exact@example.com',
      provider: 'local',
      tenantId: 'tenant-a',
    });
    expect(response.body.user).not.toHaveProperty('clerkId');
    expect(response.body.user).not.toHaveProperty('refreshToken');
    const state = await readClerkState({ clerkId, clerkSessionId, clerkTokenId });
    const cookies = expectCappedAuthCookies(response, state.session.absoluteExpiresAt);
    expect(state.consumed).toMatchObject({
      kind: 'consumed_token',
      sourceClerkSessionId: clerkSessionId,
      sourceClerkUserId: clerkId,
      tenantScope: 'tenant-a',
    });
    expect(state.sessionState).toMatchObject({ state: 'active' });
    expect(state.userState).toMatchObject({ state: 'active' });
    expect(state.session).toMatchObject({
      authProvider: 'clerk',
      clerkSessionId,
      clerkTokenId,
      clerkUserId: clerkId,
      tenantId: 'tenant-a',
    });
    expect(state.session.user.toString()).toBe(user._id.toString());
    expect(state.session.expiration.getTime()).toBe(state.session.absoluteExpiresAt.getTime());
    expect(await readBalance(user._id)).toMatchObject({
      tenantId: 'tenant-a',
      tokenCredits: 12345,
    });
    expectCollectionDelta(before, await snapshotAuthCollections(), {
      balances: 1,
      claims: 3,
      sessions: 1,
    });

    const accessClaims = jwt.verify(response.body.token, process.env.JWT_SECRET);
    const refreshClaims = jwt.verify(
      cookieValue(cookies.refreshToken),
      process.env.JWT_REFRESH_SECRET,
    );
    expect(accessClaims).toMatchObject({
      email: 'exact@example.com',
      id: user._id.toString(),
      provider: 'local',
      tenantId: 'tenant-a',
    });
    expect(accessClaims.exp).toBe(Math.floor(state.session.absoluteExpiresAt.getTime() / 1000));
    expect(refreshClaims.exp).toBe(Math.floor(state.session.absoluteExpiresAt.getTime() / 1000));

    const probe = await request(app)
      .get('/api/clerk-protected-probe')
      .set('Authorization', `Bearer ${response.body.token}`)
      .set('Cookie', ['token_provider=librechat']);
    expect(probe.status).toBe(200);
    expect(probe.body).toEqual({
      id: user._id.toString(),
      provider: 'local',
      tenantId: 'tenant-a',
    });
  });

  it('creates a new Clerk user through the real identity and balance seams', async () => {
    const clerkId = 'user_new';
    const clerkSessionId = 'sess_new';
    const clerkTokenId = 'jti_new';
    const clerkToken = arrangeClerkIdentity({
      token: 'new-user-token',
      clerkId,
      clerkSessionId,
      clerkTokenId,
      email: 'new-user@example.com',
    });
    const before = await snapshotAuthCollections();

    const response = await postClerk(app, clerkToken);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      email: 'new-user@example.com',
      provider: 'clerk',
      tenantId: 'tenant-a',
    });
    expect(response.body.user).not.toHaveProperty('clerkId');
    const state = await readClerkState({ clerkId, clerkSessionId, clerkTokenId });
    expectCappedAuthCookies(response, state.session.absoluteExpiresAt);
    expect(state.user).toMatchObject({
      clerkId,
      email: 'new-user@example.com',
      provider: 'clerk',
      tenantId: 'tenant-a',
    });
    expect(state.session.user.toString()).toBe(state.user._id.toString());
    expect(await readBalance(state.user._id)).toMatchObject({
      tenantId: 'tenant-a',
      tokenCredits: 12345,
    });
    expectCollectionDelta(before, await snapshotAuthCollections(), {
      balances: 1,
      claims: 3,
      sessions: 1,
      users: 1,
    });
    expect(mockClerkProfileFetch).toHaveBeenCalledWith(
      `https://api.clerk.com/v1/users/${clerkId}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${environment.CLERK_SECRET_KEY}`,
        }),
        method: 'GET',
      }),
    );
  });

  it('links a verified email without changing the local provider and invalidates its auth cache', async () => {
    const clerkId = 'user_email_link';
    const clerkSessionId = 'sess_email_link';
    const clerkTokenId = 'jti_email_link';
    const user = await seedUser({
      email: 'linked@example.com',
      provider: 'local',
      tenantId: 'tenant-a',
    });
    const cache = getLogStores(CacheKeys.AUTH_USER_DOC);
    const indexKey = `${AUTH_USER_DOC_BY_ID_PREFIX}:${user._id}`;
    const documentKey = `auth-user-doc:tenant-a:${user._id}`;
    await cache.set(indexKey, [documentKey]);
    await cache.set(documentKey, { stale: true });
    const clerkToken = arrangeClerkIdentity({
      token: 'email-link-token',
      clerkId,
      clerkSessionId,
      clerkTokenId,
      email: 'linked@example.com',
    });
    const before = await snapshotAuthCollections();

    const response = await postClerk(app, clerkToken);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ provider: 'local', twoFactorEnabled: false });
    const state = await readClerkState({ clerkId, clerkSessionId, clerkTokenId });
    expectCappedAuthCookies(response, state.session.absoluteExpiresAt);
    const linkedUser = await runAsSystem(() =>
      mongoose.models.User.findById(user._id).select('+clerkDeletedAt').lean(),
    );
    expect(linkedUser).toMatchObject({ clerkId, provider: 'local' });
    expect(await cache.get(indexKey)).toBeUndefined();
    expect(await cache.get(documentKey)).toBeUndefined();
    expect(await runAsSystem(() => mongoose.models.User.countDocuments({}))).toBe(1);
    expectCollectionDelta(before, await snapshotAuthCollections(), {
      balances: 1,
      claims: 3,
      sessions: 1,
    });
  });

  it('returns an exact conflict without mutating when the verified email is already linked', async () => {
    await seedUser({
      clerkId: 'different_clerk_subject',
      email: 'collision@example.com',
      tenantId: 'tenant-a',
    });
    const before = await snapshotAuthCollections();
    const clerkToken = arrangeClerkIdentity({
      token: 'conflict-token',
      clerkId: 'conflicting_subject',
      clerkSessionId: 'sess_conflict',
      clerkTokenId: 'jti_conflict',
      email: 'collision@example.com',
    });

    const response = await postClerk(app, clerkToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: 'CLERK_IDENTITY_CONFLICT' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await snapshotAuthCollections()).toEqual(before);
  });

  it('rejects registration policy before creating user, balance, claim, Session, or cookie state', async () => {
    process.env.ALLOW_SOCIAL_REGISTRATION = 'false';
    const before = await snapshotAuthCollections();
    const clerkToken = arrangeClerkIdentity({
      token: 'policy-token',
      clerkId: 'user_policy_denied',
      clerkSessionId: 'sess_policy_denied',
      clerkTokenId: 'jti_policy_denied',
      email: 'policy-denied@example.com',
    });

    const response = await postClerk(app, clerkToken);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'CLERK_LOGIN_FORBIDDEN' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await snapshotAuthCollections()).toEqual(before);
  });

  it('keeps a consumed token fenced after direct replay and Session deletion', async () => {
    const clerkId = 'user_durable_replay';
    const clerkSessionId = 'sess_durable_replay';
    const clerkTokenId = 'jti_durable_replay';
    await seedUser({
      clerkId,
      email: 'replay@example.com',
      tenantId: 'tenant-a',
    });
    const clerkToken = arrangeClerkIdentity({
      token: 'durable-replay-token',
      clerkId,
      clerkSessionId,
      clerkTokenId,
    });
    const before = await snapshotAuthCollections();

    const first = await postClerk(app, clerkToken);
    expect(first.status).toBe(200);
    const afterFirst = await snapshotAuthCollections();
    expectCollectionDelta(before, afterFirst, { balances: 1, claims: 3, sessions: 1 });

    const directReplay = await postClerk(app, clerkToken);
    expect(directReplay.status).toBe(409);
    expect(directReplay.body).toEqual({ code: 'CLERK_TOKEN_REPLAYED' });
    expect(directReplay.headers['set-cookie']).toBeUndefined();
    expect(await snapshotAuthCollections()).toEqual(afterFirst);

    await runAsSystem(() => mongoose.models.Session.deleteMany({ clerkTokenId }));
    const afterDeletion = await snapshotAuthCollections();
    const durableReplay = await postClerk(app, clerkToken);
    expect(durableReplay.status).toBe(409);
    expect(durableReplay.body).toEqual({ code: 'CLERK_TOKEN_REPLAYED' });
    expect(durableReplay.headers['set-cookie']).toBeUndefined();
    expect(await snapshotAuthCollections()).toEqual(afterDeletion);
    expect(await methods.findConsumedTokenClaim('tenant-a', clerkTokenId)).not.toBeNull();
  });

  it('binds the local 2FA capability to its tenant and consumes it exactly once', async () => {
    const clerkId = 'user_two_factor';
    const clerkSessionId = 'sess_two_factor';
    const clerkTokenId = 'jti_two_factor';
    const totpSecret = 'JBSWY3DPEHPK3PXP';
    const user = await seedUser({
      clerkId,
      email: 'two-factor@example.com',
      tenantId: 'tenant-a',
      totpSecret,
      twoFactorEnabled: true,
    });
    const seededBalance = await seedBalance(user._id);
    const before = await snapshotAuthCollections();
    const clerkToken = arrangeClerkIdentity({
      token: 'two-factor-token',
      clerkId,
      clerkSessionId,
      clerkTokenId,
    });

    const pending = await postClerk(app, clerkToken);

    expect(pending.status).toBe(200);
    expect(pending.body).toEqual({ twoFAPending: true, tempToken: expect.any(String) });
    expect(pending.headers['set-cookie']).toBeUndefined();
    expect(await snapshotAuthCollections()).toEqual(before);
    const capability = jwt.verify(pending.body.tempToken, process.env.JWT_SECRET);
    expect(capability).toMatchObject({
      absoluteExpiresAt: expect.anything(),
      authProvider: 'clerk',
      clerkSessionId,
      clerkTokenId,
      clerkUserId: clerkId,
      tenantScope: 'tenant-a',
      tokenExpiresAt: expect.anything(),
      twoFAPending: true,
      userId: user._id.toString(),
    });
    expect(JSON.stringify(capability)).not.toContain(clerkToken);

    const code = await generateTOTP(totpSecret);
    const wrongTenant = await request(app)
      .post('/api/auth/2fa/verify-temp')
      .set('X-Tenant-Id', 'tenant-b')
      .send({ tempToken: pending.body.tempToken, token: code });
    expect(wrongTenant.status).toBe(403);
    expect(wrongTenant.body).toEqual({ code: 'CLERK_LOGIN_FORBIDDEN' });
    expect(wrongTenant.headers['set-cookie']).toBeUndefined();
    expect(await snapshotAuthCollections()).toEqual(before);

    const completed = await request(app)
      .post('/api/auth/2fa/verify-temp')
      .set('X-Tenant-Id', 'tenant-a')
      .send({ tempToken: pending.body.tempToken, token: code });
    expect(completed.status).toBe(200);
    expect(Object.keys(completed.body).sort()).toEqual(['token', 'user']);
    expect(completed.body.user).toMatchObject({
      provider: 'local',
      twoFactorEnabled: true,
    });
    const state = await readClerkState({ clerkId, clerkSessionId, clerkTokenId });
    expectCappedAuthCookies(completed, state.session.absoluteExpiresAt);
    expect(state.session).toMatchObject({ clerkTokenId, tenantId: 'tenant-a' });
    expect(state.user).toMatchObject({ provider: 'local', twoFactorEnabled: true });
    expect(await readBalance(user._id)).toMatchObject({
      _id: seededBalance._id,
      tenantId: 'tenant-a',
      tokenCredits: 12345,
    });
    const afterCompleted = await snapshotAuthCollections();
    expectCollectionDelta(before, afterCompleted, { claims: 3, sessions: 1 });

    const replay = await request(app)
      .post('/api/auth/2fa/verify-temp')
      .set('X-Tenant-Id', 'tenant-a')
      .send({ tempToken: pending.body.tempToken, token: code });
    expect(replay.status).toBe(409);
    expect(replay.body).toEqual({ code: 'CLERK_TOKEN_REPLAYED' });
    expect(replay.headers['set-cookie']).toBeUndefined();
    expect(await snapshotAuthCollections()).toEqual(afterCompleted);
  });

  it('compensates only the exact Session after a pre-flush failure and retains the claim', async () => {
    const clerkId = 'user_preflush_failure';
    const clerkSessionId = 'sess_preflush_failure';
    const clerkTokenId = 'jti_preflush_failure';
    const clerkToken = arrangeClerkIdentity({
      token: 'preflush-failure-token',
      clerkId,
      clerkSessionId,
      clerkTokenId,
      email: 'preflush@example.com',
    });
    const before = await snapshotAuthCollections();

    const failed = await request(app)
      .post('/api/auth/clerk')
      .set('X-Tenant-Id', 'tenant-a')
      .set('X-Clerk-Test-Fail-Cookie', 'once')
      .send({ clerkToken });

    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ code: 'CLERK_LOGIN_FAILED' });
    expectClearedAuthCookies(failed);
    const failedState = await readClerkState({ clerkId, clerkSessionId, clerkTokenId });
    expect(failedState.user).toMatchObject({ clerkId, provider: 'clerk' });
    expect(failedState.consumed).not.toBeNull();
    expect(failedState.session).toBeNull();
    expect(await readBalance(failedState.user._id)).toMatchObject({
      tenantId: 'tenant-a',
      tokenCredits: 12345,
    });
    const afterFailure = await snapshotAuthCollections();
    expectCollectionDelta(before, afterFailure, { balances: 1, claims: 3, users: 1 });

    const freshTokenId = 'jti_preflush_recovery';
    arrangeClerkIdentity({
      token: 'preflush-recovery-token',
      clerkId,
      clerkSessionId,
      clerkTokenId: freshTokenId,
    });
    const recovered = await postClerk(app, 'preflush-recovery-token');
    expect(recovered.status).toBe(200);
    const recoveredState = await readClerkState({
      clerkId,
      clerkSessionId,
      clerkTokenId: freshTokenId,
    });
    expectCappedAuthCookies(recovered, recoveredState.session.absoluteExpiresAt);
    expect(await runAsSystem(() => mongoose.models.User.countDocuments({}))).toBe(1);
    expect(await methods.findConsumedTokenClaim('tenant-a', clerkTokenId)).not.toBeNull();
    expect(await methods.findConsumedTokenClaim('tenant-a', freshTokenId)).not.toBeNull();
    expectCollectionDelta(afterFailure, await snapshotAuthCollections(), {
      claims: 1,
      sessions: 1,
    });
  });
});
