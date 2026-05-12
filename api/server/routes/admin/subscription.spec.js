jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
  AdminAuditActions: {
    SUBSCRIPTION_VIEW: 'SUBSCRIPTION_VIEW',
    SUBSCRIPTION_GRANT: 'SUBSCRIPTION_GRANT',
    SUBSCRIPTION_REVOKE: 'SUBSCRIPTION_REVOKE',
    SUBSCRIPTION_CLEAR_OVERRIDE: 'SUBSCRIPTION_CLEAR_OVERRIDE',
    SUBSCRIPTION_REFRESH: 'SUBSCRIPTION_REFRESH',
    REAUTH: 'REAUTH',
  },
}));

// Mock the cache used by limiterCache and ban cache to avoid Redis/Keyv setup.
const mockCache = new Map();
jest.mock('~/cache/getLogStores', () =>
  jest.fn(() => ({
    get: jest.fn(async (k) => mockCache.get(k)),
    set: jest.fn(async (k, v) => mockCache.set(k, v)),
    delete: jest.fn(async (k) => mockCache.delete(k)),
    clear: jest.fn(async () => mockCache.clear()),
    opts: { ttl: 0 },
  })),
);

// Provide self-contained Mongoose models in place of `~/db/models` so we
// don't pull in the full data-schemas bundle (which conflicts with the
// global winston mock at module-load time).
jest.mock('~/db/models', () => {
  const m = require('mongoose');
  const userSchema = new m.Schema(
    {
      email: { type: String, required: true },
      name: String,
      role: String,
      provider: { type: String, default: 'local' },
      password: { type: String, select: false },
      emailVerified: { type: Boolean, default: false },
    },
    { timestamps: true },
  );
  const auditSchema = new m.Schema(
    {
      actorId: { type: m.Schema.Types.ObjectId, required: true },
      actorEmail: { type: String, required: true },
      actorIp: String,
      userAgent: String,
      action: { type: String, required: true },
      targetType: { type: String, required: true },
      targetId: String,
      before: m.Schema.Types.Mixed,
      after: m.Schema.Types.Mixed,
      meta: m.Schema.Types.Mixed,
      reason: String,
      status: { type: String, required: true, default: 'success' },
      errorMessage: String,
    },
    { timestamps: { createdAt: true, updatedAt: false } },
  );
  const subscriptionSchema = new m.Schema(
    {
      userId: { type: m.Schema.Types.ObjectId, required: true, unique: true, index: true },
      appUserId: { type: String, required: true },
      entitlementId: { type: String, required: true },
      isPro: { type: Boolean, required: true, default: false },
      currentPlan: { type: String, default: null },
      productId: { type: String, default: null },
      store: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      managementUrl: { type: String, default: null },
      entitlements: { type: m.Schema.Types.Mixed, default: {} },
      quota: {
        period: { type: String, default: '' },
        usedMessages: { type: Number, default: 0 },
        limit: { type: Number, default: 3 },
      },
      manualOverride: {
        enabled: { type: Boolean, default: false },
        mode: { type: String, default: null },
        source: { type: String, default: null },
        updatedAt: { type: Date, default: null },
      },
      lastSyncedAt: { type: Date, default: null },
    },
    { timestamps: true },
  );
  return {
    User: m.models.User || m.model('User', userSchema),
    AdminAuditLog: m.models.AdminAuditLog || m.model('AdminAuditLog', auditSchema),
    SubscriptionProfile:
      m.models.SubscriptionProfile || m.model('SubscriptionProfile', subscriptionSchema),
  };
});

// Mock RevenueCatService.getSubscriptionProfile so refresh tests don't hit network.
const mockGetSubscriptionProfile = jest.fn();
jest.mock('~/server/services/Billing/RevenueCatService', () => ({
  getSubscriptionProfile: (...args) => mockGetSubscriptionProfile(...args),
}));

// Replace requireJwtAuth, checkBan, checkAdmin with shims controlled by setUser/setBanned.
const SystemRoles = { ADMIN: 'ADMIN', USER: 'USER' };
const reqState = { user: null, banned: false };
function setUser(u) {
  reqState.user = u;
}
function setBanned(v) {
  reqState.banned = v;
}

jest.mock('~/server/middleware', () => {
  const auditLogger = jest.requireActual('~/server/middleware/admin/auditLogger');
  // adminRateLimiter is a no-op pass-through in tests so the supertest harness
  // doesn't need a real keyv/redis store.
  const adminRateLimiter = (_req, _res, next) => next();
  return {
    requireJwtAuth: (req, res, next) => {
      if (!reqState.user) return res.status(401).json({ message: 'Unauthorized' });
      req.user = reqState.user;
      next();
    },
    checkBan: (_req, res, next) => {
      if (reqState.banned) return res.status(403).json({ message: 'Banned' });
      next();
    },
    checkAdmin: (req, res, next) => {
      if (req.user?.role !== SystemRoles.ADMIN) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      next();
    },
    checkAdminIpAllowlist: (_req, _res, next) => next(),
    adminRateLimiter,
    auditLogger,
  };
});

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let app;
let User, AdminAuditLog, SubscriptionProfile;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  ({ User, AdminAuditLog, SubscriptionProfile } = require('~/db/models'));

  app = express();
  app.use(express.json());
  const subscriptionRouter = require('./subscription');
  app.use('/api/admin/subscription', subscriptionRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await AdminAuditLog.deleteMany({});
  await SubscriptionProfile.deleteMany({});
  setUser(null);
  setBanned(false);
  mockCache.clear();
  mockGetSubscriptionProfile.mockReset();
});

async function createUser({ role = SystemRoles.USER, email } = {}) {
  const u = await User.create({
    email: email || `${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Test',
    role,
    provider: 'local',
    emailVerified: true,
  });
  return u;
}

async function createAdmin() {
  const u = await createUser({ role: SystemRoles.ADMIN });
  setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
  return u;
}

// Fresh-auth was removed from the admin chain. No-op shim to keep existing
// `.set(freshAuthHeader(...))` test call sites compiling without churn.
function freshAuthHeader(_adminUser) {
  return {};
}

async function createProfileFor(userId, overrides = {}) {
  return SubscriptionProfile.create({
    userId,
    appUserId: userId.toString(),
    entitlementId: 'codecan_ai_pro',
    isPro: true,
    currentPlan: 'god_mode',
    productId: 'god_mode',
    store: 'manual',
    expiresAt: null,
    managementUrl: null,
    entitlements: {},
    quota: { period: '2026-05', usedMessages: 0, limit: 3 },
    manualOverride: { enabled: false, mode: null, source: null, updatedAt: null },
    lastSyncedAt: new Date(),
    ...overrides,
  });
}

async function flushAudit() {
  // Allow setImmediate-scheduled audit writes to complete.
  for (let i = 0; i < 4; i += 1) {
    await new Promise((r) => setImmediate(r));
  }
}

describe('GET /api/admin/subscription', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/subscription');
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    const u = await createUser({ role: SystemRoles.USER });
    setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
    const res = await request(app).get('/api/admin/subscription');
    expect(res.status).toBe(403);
  });

  it('lists active Pro subscriptions, paginated', async () => {
    await createAdmin();
    const u1 = await createUser({ email: 'one@example.com' });
    const u2 = await createUser({ email: 'two@example.com' });
    const u3 = await createUser({ email: 'three@example.com' });
    await createProfileFor(u1._id, { isPro: true });
    await createProfileFor(u2._id, { isPro: true });
    await createProfileFor(u3._id, { isPro: false }); // Excluded.

    const res = await request(app).get('/api/admin/subscription').query({ page: 1, limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].email).toMatch(/example\.com$/);
  });

  it('caps limit at 100', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/subscription').query({ limit: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  it('whitelists sort and falls back to -updatedAt', async () => {
    await createAdmin();
    const u1 = await createUser();
    await createProfileFor(u1._id);
    const res = await request(app).get('/api/admin/subscription').query({ sort: 'evil; drop;' });
    expect(res.status).toBe(200);
    // Defaulted silently — no error.
    expect(res.body.items.length).toBe(1);
  });

  it('filters by plan, store, and manuallyOverridden', async () => {
    await createAdmin();
    const u1 = await createUser();
    const u2 = await createUser();
    await createProfileFor(u1._id, {
      currentPlan: 'god_mode',
      store: 'manual',
      manualOverride: { enabled: true, mode: 'grant', source: 'x', updatedAt: new Date() },
    });
    await createProfileFor(u2._id, {
      currentPlan: 'pro_monthly',
      store: 'app_store',
      manualOverride: { enabled: false, mode: null, source: null, updatedAt: null },
    });

    const r1 = await request(app).get('/api/admin/subscription').query({ plan: 'god_mode' });
    expect(r1.body.total).toBe(1);

    const r2 = await request(app).get('/api/admin/subscription').query({ store: 'app_store' });
    expect(r2.body.total).toBe(1);

    const r3 = await request(app)
      .get('/api/admin/subscription')
      .query({ manuallyOverridden: 'true' });
    expect(r3.body.total).toBe(1);
    expect(r3.body.items[0].manualOverride.enabled).toBe(true);
  });

  it('searches by email with regex escaping', async () => {
    await createAdmin();
    const u1 = await createUser({ email: 'alice@example.com' });
    const u2 = await createUser({ email: 'bob@example.com' });
    await createProfileFor(u1._id);
    await createProfileFor(u2._id);

    const res = await request(app).get('/api/admin/subscription').query({ q: 'alice' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].email).toBe('alice@example.com');

    // Regex special chars must not throw.
    const res2 = await request(app).get('/api/admin/subscription').query({ q: 'al.+ce' });
    expect(res2.status).toBe(200);
    expect(res2.body.total).toBe(0);
  });
});

describe('GET /api/admin/subscription/users/:userId', () => {
  it('400 on invalid userId', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/subscription/users/not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_USER_ID');
  });

  it('404 with NO_SUBSCRIPTION when no profile', async () => {
    await createAdmin();
    const u = await createUser();
    const res = await request(app).get(`/api/admin/subscription/users/${u._id}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_SUBSCRIPTION');
  });

  it('returns the profile detail when found', async () => {
    await createAdmin();
    const u = await createUser();
    await createProfileFor(u._id);
    const res = await request(app).get(`/api/admin/subscription/users/${u._id}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(u._id.toString());
    expect(res.body.isPro).toBe(true);
    expect(res.body.currentPlan).toBe('god_mode');
  });
});

describe('POST /api/admin/subscription/users/:userId/grant', () => {
  it('400 on invalid userId', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/admin/subscription/users/not-an-id/grant')
      .set(freshAuthHeader(admin))
      .send({ reason: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_USER_ID');
  });

  it('400 when reason is missing', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const res = await request(app)
      .post(`/api/admin/subscription/users/${u._id}/grant`)
      .set(freshAuthHeader(admin))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REASON_REQUIRED');
  });

  it('404 USER_NOT_FOUND when target user does not exist', async () => {
    const admin = await createAdmin();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/admin/subscription/users/${fakeId}/grant`)
      .set(freshAuthHeader(admin))
      .send({ reason: 'fixing' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('grants Pro, sets manualOverride.grant, preserves existing quota, writes audit row', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await createProfileFor(u._id, {
      isPro: false,
      currentPlan: null,
      quota: { period: '2026-05', usedMessages: 7, limit: 3 },
    });

    const res = await request(app)
      .post(`/api/admin/subscription/users/${u._id}/grant`)
      .set(freshAuthHeader(admin))
      .send({ reason: 'apology credit' });

    expect(res.status).toBe(200);
    expect(res.body.isPro).toBe(true);
    expect(res.body.currentPlan).toBe('god_mode');
    expect(res.body.manualOverride.enabled).toBe(true);
    expect(res.body.manualOverride.mode).toBe('grant');
    expect(res.body.manualOverride.source).toBe(`admin-api:${admin._id.toString()}`);
    // Quota preserved.
    expect(res.body.quota.usedMessages).toBe(7);

    await flushAudit();
    const rows = await AdminAuditLog.find({ actorId: admin._id }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('SUBSCRIPTION_GRANT');
    expect(rows[0].targetType).toBe('subscription');
    expect(rows[0].targetId).toBe(u._id.toString());
    expect(rows[0].reason).toBe('apology credit');
    expect(rows[0].status).toBe('success');
    expect(rows[0].before).toBeTruthy();
    expect(rows[0].after).toBeTruthy();
    expect(rows[0].after.manualOverride.mode).toBe('grant');
  });

  it('uses default plan god_mode and accepts custom plan', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const res = await request(app)
      .post(`/api/admin/subscription/users/${u._id}/grant`)
      .set(freshAuthHeader(admin))
      .send({ reason: 'r', plan: 'enterprise' });
    expect(res.status).toBe(200);
    expect(res.body.currentPlan).toBe('enterprise');
    expect(res.body.productId).toBe('enterprise');
  });
});

describe('POST /api/admin/subscription/users/:userId/revoke', () => {
  it('400 missing reason', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const res = await request(app)
      .post(`/api/admin/subscription/users/${u._id}/revoke`)
      .set(freshAuthHeader(admin))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REASON_REQUIRED');
  });

  it('404 USER_NOT_FOUND when target user missing', async () => {
    const admin = await createAdmin();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/admin/subscription/users/${fakeId}/revoke`)
      .set(freshAuthHeader(admin))
      .send({ reason: 'r' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('revokes Pro, sets manualOverride.revoke, preserves quota, writes audit row', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await createProfileFor(u._id, {
      isPro: true,
      quota: { period: '2026-05', usedMessages: 4, limit: 3 },
    });

    const res = await request(app)
      .post(`/api/admin/subscription/users/${u._id}/revoke`)
      .set(freshAuthHeader(admin))
      .send({ reason: 'fraud' });

    expect(res.status).toBe(200);
    expect(res.body.isPro).toBe(false);
    expect(res.body.manualOverride.enabled).toBe(true);
    expect(res.body.manualOverride.mode).toBe('revoke');
    expect(res.body.quota.usedMessages).toBe(4);

    await flushAudit();
    const rows = await AdminAuditLog.find({ actorId: admin._id }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('SUBSCRIPTION_REVOKE');
    expect(rows[0].after.isPro).toBe(false);
  });
});

describe('POST /api/admin/subscription/users/:userId/clear-override', () => {
  it('does NOT require fresh auth', async () => {
    await createAdmin();
    const u = await createUser();
    await createProfileFor(u._id, {
      isPro: true,
      manualOverride: { enabled: true, mode: 'grant', source: 'x', updatedAt: new Date() },
    });
    const res = await request(app)
      .post(`/api/admin/subscription/users/${u._id}/clear-override`)
      .send({ reason: 'reset' });
    expect(res.status).toBe(200);
  });

  it('flips manualOverride.enabled false but does NOT change isPro', async () => {
    await createAdmin();
    const u = await createUser();
    await createProfileFor(u._id, {
      isPro: true,
      manualOverride: { enabled: true, mode: 'grant', source: 'x', updatedAt: new Date() },
    });
    const res = await request(app)
      .post(`/api/admin/subscription/users/${u._id}/clear-override`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.manualOverride.enabled).toBe(false);
    expect(res.body.manualOverride.mode).toBe(null);
    expect(res.body.isPro).toBe(true);
  });

  it('404 NO_SUBSCRIPTION when user has no profile', async () => {
    await createAdmin();
    const u = await createUser();
    const res = await request(app)
      .post(`/api/admin/subscription/users/${u._id}/clear-override`)
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_SUBSCRIPTION');
  });

  it('writes an audit row', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await createProfileFor(u._id, {
      isPro: true,
      manualOverride: { enabled: true, mode: 'grant', source: 'x', updatedAt: new Date() },
    });
    await request(app)
      .post(`/api/admin/subscription/users/${u._id}/clear-override`)
      .send({ reason: 'auto' });
    await flushAudit();
    const rows = await AdminAuditLog.find({ actorId: admin._id }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('SUBSCRIPTION_CLEAR_OVERRIDE');
    expect(rows[0].before.manualOverride.enabled).toBe(true);
    expect(rows[0].after.manualOverride.enabled).toBe(false);
  });
});

describe('POST /api/admin/subscription/users/:userId/refresh', () => {
  it('400 on invalid userId', async () => {
    await createAdmin();
    const res = await request(app).post('/api/admin/subscription/users/not-an-id/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_USER_ID');
  });

  it('404 USER_NOT_FOUND when user missing', async () => {
    await createAdmin();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).post(`/api/admin/subscription/users/${fakeId}/refresh`).send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('calls getSubscriptionProfile with forceRefresh:true and returns the profile', async () => {
    await createAdmin();
    const u = await createUser();

    mockGetSubscriptionProfile.mockResolvedValue({
      userId: u._id.toString(),
      appUserId: u._id.toString(),
      isPro: true,
      currentPlan: 'pro_monthly',
    });

    const res = await request(app).post(`/api/admin/subscription/users/${u._id}/refresh`).send({});

    expect(res.status).toBe(200);
    expect(mockGetSubscriptionProfile).toHaveBeenCalledTimes(1);
    const callArgs = mockGetSubscriptionProfile.mock.calls[0][0];
    expect(callArgs.forceRefresh).toBe(true);
    expect(callArgs.appUserId).toBe(u._id.toString());
    expect(callArgs.userId.toString()).toBe(u._id.toString());
    expect(res.body.currentPlan).toBe('pro_monthly');
  });
});
