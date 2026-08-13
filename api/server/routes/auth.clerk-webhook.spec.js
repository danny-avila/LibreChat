const cookieParser = require('cookie-parser');
const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
const passport = require('passport');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { Webhook } = require('standardwebhooks');
const { AUTH_USER_DOC_BY_ID_PREFIX, CacheKeys } = require('librechat-data-provider');

const mockVerifyToken = jest.fn();

jest.mock('@clerk/backend', () => ({
  ...jest.requireActual('@clerk/backend'),
  verifyToken: (...args) => mockVerifyToken(...args),
}));

const {
  createModels,
  ensureClerkIndexes,
  hashToken,
  runAsSystem,
} = require('@librechat/data-schemas');
const { preAuthTenantMiddleware } = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');
const middleware = require('~/server/middleware');
const jwtLogin = require('~/strategies/jwtStrategy');
const mountClerkWebhook = require('./mountClerkWebhook');

createModels(mongoose);
const methods = require('~/models');
const authRoute = require('./auth');
const clerkWebhookRoute = require('./clerk');
const mountAuthRoute = require('./mountAuth');

const SIGNING_SECRET = `whsec_${Buffer.from('clerk-webhook-closure-fixture-key').toString(
  'base64',
)}`;
const clerkEnvironment = {
  CLERK_PUBLISHABLE_KEY: 'pk_test_closure',
  CLERK_SECRET_KEY: 'sk_test_closure',
  CLERK_JWT_KEY: 'closure-public-key',
  CLERK_AUTHORIZED_PARTIES: 'https://chat.example.com',
  CLERK_WEBHOOK_SIGNING_SECRET: SIGNING_SECRET,
  DOMAIN_CLIENT: 'https://chat.example.com',
  DOMAIN_SERVER: 'https://api.example.com',
  JWT_SECRET: 'clerk-webhook-access-secret',
  JWT_REFRESH_SECRET: 'clerk-webhook-refresh-secret',
  SESSION_COOKIE_SECURE: 'true',
  SESSION_EXPIRY: '1000 * 60 * 15',
};

describe.each(['index.js', 'experimental.js'])('%s Clerk webhook mount', (entrypoint) => {
  const source = fs.readFileSync(path.join(__dirname, '..', entrypoint), 'utf8');

  it('mounts the exact raw webhook route before either global body parser', () => {
    const mountCall = 'mountClerkWebhook(app, routes);';
    const mountIndex = source.indexOf(mountCall);
    const jsonParserIndex = source.indexOf("app.use(express.json({ limit: '3mb' }));");
    const urlencodedParserIndex = source.indexOf(
      "app.use(express.urlencoded({ extended: true, limit: '3mb' }));",
    );

    expect(mountIndex).toBeGreaterThan(-1);
    expect(jsonParserIndex).toBeGreaterThan(-1);
    expect(urlencodedParserIndex).toBeGreaterThan(-1);
    expect(mountIndex).toBeLessThan(jsonParserIndex);
    expect(mountIndex).toBeLessThan(urlencodedParserIndex);
    expect(source).toContain("const mountClerkWebhook = require('./routes/mountClerkWebhook');");
    expect(source.split(mountCall)).toHaveLength(2);
  });
});

function createApp() {
  const app = express();
  mountClerkWebhook(app, { clerk: clerkWebhookRoute });
  app.use(express.json());
  app.use(cookieParser());
  app.use(passport.initialize());
  mountAuthRoute(app, { auth: authRoute }, preAuthTenantMiddleware);
  app.get('/api/clerk-protected-probe', middleware.requireJwtAuth, (req, res) =>
    res.status(200).json({
      id: req.user._id.toString(),
      provider: req.user.provider,
      tenantId: req.user.tenantId,
    }),
  );
  app.use((_request, response) => response.status(404).json({ message: 'Endpoint not found' }));
  return app;
}

function signedWebhookRequest(app, event, messageId = new mongoose.Types.ObjectId().toString()) {
  const body = JSON.stringify(event);
  const timestamp = new Date();
  const signature = new Webhook(SIGNING_SECRET).sign(messageId, timestamp, body);
  return request(app)
    .post('/api/auth/clerk/webhook')
    .set('Content-Type', 'application/json')
    .set('svix-id', messageId)
    .set('svix-signature', signature)
    .set('svix-timestamp', String(timestamp.getTime() / 1000))
    .send(body);
}

function futureDate(minutes = 60) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function arrangeClerkToken({ clerkId, clerkSessionId, clerkTokenId, lifetimeSeconds = 600 }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  mockVerifyToken.mockResolvedValue({
    azp: 'https://chat.example.com',
    exp: issuedAt + lifetimeSeconds,
    iat: issuedAt,
    iss: 'https://clerk.example.com',
    jti: clerkTokenId,
    sid: clerkSessionId,
    sts: 'active',
    sub: clerkId,
  });
}

function postClerk(app, clerkToken) {
  return request(app).post('/api/auth/clerk').set('X-Tenant-Id', 'tenant-a').send({ clerkToken });
}

async function seedUser({ email, clerkId, tenantId, provider = 'local' }) {
  return mongoose.models.User.create({
    email,
    emailVerified: true,
    provider,
    clerkId,
    tenantId,
    termsAccepted: true,
  });
}

async function seedClerkSession({
  user,
  tenantId,
  clerkSessionId,
  clerkTokenId,
  clerkUserId,
  refreshToken,
}) {
  const expiration = futureDate();
  return mongoose.models.Session.create({
    user: user._id,
    tenantId,
    authProvider: 'clerk',
    clerkSessionId,
    clerkTokenId,
    clerkUserId,
    absoluteExpiresAt: expiration,
    expiration,
    refreshTokenHash: refreshToken ? await hashToken(refreshToken) : `hash-${clerkTokenId}`,
  });
}

async function seedConsumedClaim({ tenantScope, clerkTokenId, clerkSessionId, clerkUserId }) {
  return methods.insertConsumedTokenClaim({
    tenantScope,
    clerkTokenId,
    sourceClerkSessionId: clerkSessionId,
    sourceClerkUserId: clerkUserId,
    expiration: futureDate(),
  });
}

describe('Clerk webhook-to-session closure', () => {
  jest.setTimeout(60_000);

  let replSet;
  let app;
  const originalEnvironment = Object.fromEntries(
    [...Object.keys(clerkEnvironment), 'AUTH_USER_CACHE_MODE'].map((key) => [
      key,
      process.env[key],
    ]),
  );
  const authUserCache = getLogStores(CacheKeys.AUTH_USER_DOC);

  beforeAll(async () => {
    Object.assign(process.env, clerkEnvironment, { AUTH_USER_CACHE_MODE: 'on' });
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), { dbName: 'clerk-webhook-closure' });
    await ensureClerkIndexes(mongoose.connection);
    passport.use('jwt', jwtLogin());
    app = createApp();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockVerifyToken.mockRejectedValue(new Error('contract-faithful Clerk rejection'));
    await runAsSystem(async () => {
      await Promise.all([
        mongoose.models.Session.deleteMany({}),
        mongoose.models.User.deleteMany({}),
        mongoose.models.ClerkAuthClaim.deleteMany({}),
      ]);
    });
    await authUserCache.clear();
    Object.assign(process.env, clerkEnvironment, { AUTH_USER_CACHE_MODE: 'on' });
  });

  afterAll(async () => {
    await authUserCache.clear();
    await mongoose.disconnect();
    await replSet.stop();
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it.each(['session.ended', 'session.revoked'])(
    'atomically fences %s and deletes every correlated Session across tenants',
    async (type) => {
      let refreshToken;
      await runAsSystem(async () => {
        const firstUser = await seedUser({
          email: 'first@example.com',
          clerkId: 'user_1',
          tenantId: 'tenant-a',
        });
        const secondUser = await seedUser({
          email: 'second@example.com',
          clerkId: 'user_1',
          tenantId: 'tenant-b',
        });
        refreshToken = jwt.sign({ id: firstUser._id.toString() }, process.env.JWT_REFRESH_SECRET, {
          expiresIn: '1h',
        });
        await seedClerkSession({
          user: firstUser,
          tenantId: 'tenant-a',
          clerkSessionId: 'sess_shared',
          clerkTokenId: 'jti_a',
          clerkUserId: 'user_1',
          refreshToken,
        });
        await seedClerkSession({
          user: secondUser,
          tenantId: 'tenant-b',
          clerkSessionId: 'sess_shared',
          clerkTokenId: 'jti_b',
          clerkUserId: 'user_1',
        });
        await seedConsumedClaim({
          tenantScope: 'tenant-a',
          clerkTokenId: 'jti_a',
          clerkSessionId: 'sess_shared',
          clerkUserId: 'user_1',
        });
        await seedConsumedClaim({
          tenantScope: 'tenant-b',
          clerkTokenId: 'jti_b',
          clerkSessionId: 'sess_shared',
          clerkUserId: 'user_1',
        });
      });

      const response = await signedWebhookRequest(app, {
        type,
        data: { id: 'sess_shared' },
      }).set('X-Tenant-Id', 'forged-tenant');

      expect(response.status).toBe(204);
      await runAsSystem(async () => {
        expect(
          await mongoose.models.Session.countDocuments({ clerkSessionId: 'sess_shared' }),
        ).toBe(0);
        expect(
          await mongoose.models.ClerkAuthClaim.findOne({
            kind: 'session_state',
            clerkSessionId: 'sess_shared',
          }).lean(),
        ).toMatchObject({ state: 'revoked' });
        expect(
          await mongoose.models.ClerkAuthClaim.countDocuments({ kind: 'consumed_token' }),
        ).toBe(2);
      });

      const duplicate = await signedWebhookRequest(app, {
        type,
        data: { id: 'sess_shared' },
      });
      expect(duplicate.status).toBe(204);

      const refresh = await request(app)
        .post('/api/auth/refresh?retry=true')
        .set('X-Tenant-Id', 'tenant-a')
        .set('Cookie', [`refreshToken=${refreshToken}`, 'token_provider=librechat']);
      expect(refresh.status).toBe(403);
      expect(refresh.text).toBe('No session found');
    },
  );

  it('denies refresh and repeat exchange while the already-issued bearer expires at its cap', async () => {
    const clerkId = 'user_bounded_bearer';
    const clerkSessionId = 'sess_bounded_bearer';
    const clerkTokenId = 'jti_bounded_bearer';
    const clerkToken = 'bounded-bearer-clerk-token';
    const user = await runAsSystem(() =>
      seedUser({
        email: 'bounded@example.com',
        clerkId,
        tenantId: 'tenant-a',
      }),
    );
    arrangeClerkToken({ clerkId, clerkSessionId, clerkTokenId, lifetimeSeconds: 120 });

    const login = await postClerk(app, clerkToken);

    expect(login.status).toBe(200);
    const accessToken = login.body.token;
    const accessClaims = jwt.verify(accessToken, process.env.JWT_SECRET);
    const absoluteExpiryMs = accessClaims.exp * 1000;
    const authCookies = login.headers['set-cookie'];
    const refreshCookie = authCookies.find((cookie) => cookie.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    const protectedRequest = () =>
      request(app)
        .get('/api/clerk-protected-probe')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', ['token_provider=librechat']);
    const beforeWebhook = await protectedRequest();
    expect(beforeWebhook.status).toBe(200);
    expect(beforeWebhook.body).toEqual({
      id: user._id.toString(),
      provider: 'local',
      tenantId: 'tenant-a',
    });

    const webhook = await signedWebhookRequest(app, {
      type: 'session.revoked',
      data: { id: clerkSessionId },
    });
    expect(webhook.status).toBe(204);
    await runAsSystem(async () => {
      expect(await mongoose.models.Session.countDocuments({ clerkSessionId })).toBe(0);
      expect(
        await mongoose.models.ClerkAuthClaim.findOne({
          kind: 'consumed_token',
          tenantScope: 'tenant-a',
          clerkTokenId,
        }).lean(),
      ).not.toBeNull();
      expect(
        await mongoose.models.ClerkAuthClaim.findOne({
          kind: 'session_state',
          clerkSessionId,
        }).lean(),
      ).toMatchObject({ state: 'revoked' });
    });

    const refresh = await request(app)
      .post('/api/auth/refresh?retry=true')
      .set('X-Tenant-Id', 'tenant-a')
      .set('Cookie', [refreshCookie.split(';')[0], 'token_provider=librechat']);
    expect(refresh.status).toBe(403);
    expect(refresh.text).toBe('No session found');

    const repeatExchange = await postClerk(app, clerkToken);
    expect(repeatExchange.status).toBe(403);
    expect(repeatExchange.body).toEqual({ code: 'CLERK_LOGIN_FORBIDDEN' });
    expect(repeatExchange.headers['set-cookie']).toBeUndefined();
    expect(
      await runAsSystem(() => mongoose.models.Session.countDocuments({ clerkSessionId })),
    ).toBe(0);

    const beforeCap = await protectedRequest();
    expect(beforeCap.status).toBe(200);
    const dateNow = jest.spyOn(Date, 'now').mockReturnValue(absoluteExpiryMs);
    try {
      const atCap = await protectedRequest();
      expect(atCap.status).toBe(401);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('tombstones every exact Clerk binding, fences its sids, and invalidates only affected caches', async () => {
    let firstUser;
    let secondUser;
    let unrelatedUser;
    await runAsSystem(async () => {
      firstUser = await seedUser({
        email: 'first@example.com',
        clerkId: 'user_deleted',
        tenantId: 'tenant-a',
        provider: 'local',
      });
      secondUser = await seedUser({
        email: 'second@example.com',
        clerkId: 'user_deleted',
        tenantId: 'tenant-b',
        provider: 'google',
      });
      unrelatedUser = await seedUser({
        email: 'unrelated@example.com',
        clerkId: 'user_unrelated',
        tenantId: 'tenant-a',
      });
      await seedClerkSession({
        user: firstUser,
        tenantId: 'tenant-a',
        clerkSessionId: 'sess_a',
        clerkTokenId: 'jti_a',
        clerkUserId: 'user_deleted',
      });
      await seedClerkSession({
        user: secondUser,
        tenantId: 'tenant-b',
        clerkSessionId: 'sess_b',
        clerkTokenId: 'jti_b',
        clerkUserId: 'user_deleted',
      });
      await seedConsumedClaim({
        tenantScope: 'tenant-a',
        clerkTokenId: 'jti_a',
        clerkSessionId: 'sess_a',
        clerkUserId: 'user_deleted',
      });
      await seedConsumedClaim({
        tenantScope: 'tenant-b',
        clerkTokenId: 'jti_b',
        clerkSessionId: 'sess_b',
        clerkUserId: 'user_deleted',
      });
    });

    const cacheKeys = [firstUser, secondUser, unrelatedUser].map(
      (user) => `auth-user-doc:test:${user._id.toString()}`,
    );
    for (const [user, cacheKey] of [firstUser, secondUser, unrelatedUser].map((user, index) => [
      user,
      cacheKeys[index],
    ])) {
      await authUserCache.set(cacheKey, { userId: user._id.toString() });
      await authUserCache.set(`${AUTH_USER_DOC_BY_ID_PREFIX}:${user._id.toString()}`, [cacheKey]);
    }

    const response = await signedWebhookRequest(app, {
      type: 'user.deleted',
      data: { id: 'user_deleted' },
    });

    expect(response.status).toBe(204);
    const duplicate = await signedWebhookRequest(app, {
      type: 'user.deleted',
      data: { id: 'user_deleted' },
    });
    expect(duplicate.status).toBe(204);
    await runAsSystem(async () => {
      const tombstoned = await mongoose.models.User.find({ clerkId: 'user_deleted' })
        .select('+clerkDeletedAt')
        .sort({ email: 1 })
        .lean();
      expect(tombstoned).toHaveLength(2);
      expect(tombstoned.map((user) => user.provider).sort()).toEqual(['google', 'local']);
      expect(tombstoned.every((user) => user.clerkDeletedAt instanceof Date)).toBe(true);
      expect(tombstoned.every((user) => user.clerkId === 'user_deleted')).toBe(true);
      expect(await mongoose.models.Session.countDocuments({ clerkUserId: 'user_deleted' })).toBe(0);
      expect(
        await mongoose.models.ClerkAuthClaim.find({
          kind: 'session_state',
          clerkSessionId: { $in: ['sess_a', 'sess_b'] },
        })
          .sort({ clerkSessionId: 1 })
          .lean(),
      ).toEqual([
        expect.objectContaining({ clerkSessionId: 'sess_a', state: 'revoked' }),
        expect.objectContaining({ clerkSessionId: 'sess_b', state: 'revoked' }),
      ]);
      expect(
        await mongoose.models.ClerkAuthClaim.findOne({
          kind: 'user_state',
          clerkUserId: 'user_deleted',
        }).lean(),
      ).toMatchObject({ state: 'deleted' });
      expect(await mongoose.models.ClerkAuthClaim.countDocuments({ kind: 'consumed_token' })).toBe(
        2,
      );
    });
    expect(await authUserCache.get(cacheKeys[0])).toBeUndefined();
    expect(await authUserCache.get(cacheKeys[1])).toBeUndefined();
    expect(await authUserCache.get(cacheKeys[2])).toEqual({
      userId: unrelatedUser._id.toString(),
    });
  });

  it('rejects unavailable, invalid-signature, and non-raw requests before mutation', async () => {
    let seededSession;
    await runAsSystem(async () => {
      const user = await seedUser({
        email: 'first@example.com',
        clerkId: 'user_1',
        tenantId: 'tenant-a',
      });
      seededSession = await seedClerkSession({
        user,
        tenantId: 'tenant-a',
        clerkSessionId: 'sess_1',
        clerkTokenId: 'jti_1',
        clerkUserId: 'user_1',
      });
    });

    const invalidSignature = await request(app)
      .post('/api/auth/clerk/webhook')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_invalid')
      .set('svix-signature', 'v1,invalid')
      .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
      .send(Buffer.from(JSON.stringify({ type: 'session.revoked', data: { id: 'sess_1' } })));
    expect(invalidSignature.status).toBe(400);

    const nonRaw = await request(app)
      .post('/api/auth/clerk/webhook')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ type: 'session.revoked', data: { id: 'sess_1' } }));
    expect(nonRaw.status).toBe(400);

    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    const unavailable = await request(app)
      .post('/api/auth/clerk/webhook')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));
    expect(unavailable.status).toBe(503);

    await runAsSystem(async () => {
      expect(await mongoose.models.Session.exists({ _id: seededSession._id })).not.toBeNull();
      expect(await mongoose.models.ClerkAuthClaim.countDocuments({})).toBe(0);
    });
  });

  it('returns 204 for an unsupported verified event without mutating state', async () => {
    const response = await signedWebhookRequest(app, {
      type: 'organization.created',
      data: { id: 'org_1' },
    });

    expect(response.status).toBe(204);
    await runAsSystem(async () => {
      expect(await mongoose.models.ClerkAuthClaim.countDocuments({})).toBe(0);
      expect(await mongoose.models.Session.countDocuments({})).toBe(0);
      expect(await mongoose.models.User.countDocuments({})).toBe(0);
    });
  });
});
