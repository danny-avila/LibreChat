jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
  AdminAuditActions: {
    USER_LIST: 'USER_LIST',
    USER_VIEW: 'USER_VIEW',
    USER_BAN: 'USER_BAN',
    USER_UNBAN: 'USER_UNBAN',
    USER_ROLE_CHANGE: 'USER_ROLE_CHANGE',
    USER_DELETE: 'USER_DELETE',
    USER_RESET_PASSWORD: 'USER_RESET_PASSWORD',
    USER_INVITE: 'USER_INVITE',
    REAUTH: 'REAUTH',
  },
}));

// In-memory cache for limiter and ban store.
const mockCache = new Map();
const mockBanStore = new Map();

jest.mock('~/cache/getLogStores', () =>
  jest.fn((namespace) => {
    if (namespace === 'ban') {
      return {
        get: jest.fn(async (k) => mockBanStore.get(k)),
        set: jest.fn(async (k, v) => mockBanStore.set(k, v)),
        delete: jest.fn(async (k) => mockBanStore.delete(k)),
        clear: jest.fn(async () => mockBanStore.clear()),
        opts: { ttl: 60 * 60 * 1000 },
      };
    }
    return {
      get: jest.fn(async (k) => mockCache.get(k)),
      set: jest.fn(async (k, v) => mockCache.set(k, v)),
      delete: jest.fn(async (k) => mockCache.delete(k)),
      clear: jest.fn(async () => mockCache.clear()),
      opts: { ttl: 0 },
    };
  }),
);

// Self-contained mongoose models in place of `~/db/models`.
jest.mock('~/db/models', () => {
  const m = require('mongoose');
  const userSchema = new m.Schema(
    {
      email: { type: String, required: true, lowercase: true, index: true },
      name: String,
      username: { type: String, lowercase: true },
      role: { type: String, default: 'USER' },
      provider: { type: String, default: 'local' },
      password: { type: String, select: false },
      emailVerified: { type: Boolean, default: false },
      backupCodes: { type: [m.Schema.Types.Mixed], select: false },
      totpSecret: { type: String, select: false },
      refreshToken: { type: [m.Schema.Types.Mixed] },
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
  const balanceSchema = new m.Schema({
    user: { type: m.Schema.Types.ObjectId, required: true, index: true },
    tokenCredits: { type: Number, default: 0 },
    autoRefillEnabled: { type: Boolean, default: false },
    refillIntervalValue: { type: Number, default: 30 },
    refillIntervalUnit: { type: String, default: 'days' },
    refillAmount: { type: Number, default: 0 },
    lastRefill: { type: Date, default: Date.now },
  });
  const subSchema = new m.Schema(
    {
      userId: { type: m.Schema.Types.ObjectId, required: true, index: true },
      appUserId: String,
      entitlementId: String,
      isPro: { type: Boolean, default: false },
      currentPlan: String,
      productId: String,
      store: String,
      expiresAt: Date,
      quota: {
        period: String,
        usedMessages: Number,
        limit: Number,
      },
      manualOverride: m.Schema.Types.Mixed,
      lastSyncedAt: Date,
    },
    { timestamps: true },
  );
  const generic = (name) => {
    const schema = new m.Schema({}, { strict: false });
    return m.models[name] || m.model(name, schema, name.toLowerCase());
  };
  const messageSchema = new m.Schema({ user: String, text: String }, { strict: false });
  const conversationSchema = new m.Schema({ user: String, title: String }, { strict: false });
  return {
    User: m.models.User || m.model('User', userSchema),
    AdminAuditLog: m.models.AdminAuditLog || m.model('AdminAuditLog', auditSchema),
    Balance: m.models.Balance || m.model('Balance', balanceSchema),
    SubscriptionProfile: m.models.SubscriptionProfile || m.model('SubscriptionProfile', subSchema),
    Message: m.models.Message || m.model('Message', messageSchema),
    Conversation: m.models.Conversation || m.model('Conversation', conversationSchema),
    Agent: generic('Agent'),
    Assistant: generic('Assistant'),
    ConversationTag: generic('ConversationTag'),
    File: generic('File'),
    Key: generic('Key'),
    MemoryEntry: generic('MemoryEntry'),
    PluginAuth: generic('PluginAuth'),
    Prompt: generic('Prompt'),
    PromptGroup: generic('PromptGroup'),
    Preset: generic('Preset'),
    Session: generic('Session'),
    SharedLink: generic('SharedLink'),
    ToolCall: generic('ToolCall'),
    Token: generic('Token'),
    Transaction: generic('Transaction'),
  };
});

// Replace `~/models` to provide createToken / deleteTokens / deleteAllUserSessions.
const mockTokenStore = [];
const mockSessionStore = [];
jest.mock('~/models', () => ({
  createToken: jest.fn(async (doc) => {
    mockTokenStore.push(doc);
    return doc;
  }),
  deleteTokens: jest.fn(async (filter) => {
    if (!filter) {
      mockTokenStore.length = 0;
      return;
    }
    const initial = mockTokenStore.length;
    for (let i = mockTokenStore.length - 1; i >= 0; i--) {
      if (filter.userId && String(mockTokenStore[i].userId) === String(filter.userId)) {
        mockTokenStore.splice(i, 1);
      } else if (filter.token && mockTokenStore[i].token === filter.token) {
        mockTokenStore.splice(i, 1);
      }
    }
    return { deletedCount: initial - mockTokenStore.length };
  }),
  deleteAllUserSessions: jest.fn(async ({ userId }) => {
    const initial = mockSessionStore.length;
    for (let i = mockSessionStore.length - 1; i >= 0; i--) {
      if (String(mockSessionStore[i].userId) === String(userId)) {
        mockSessionStore.splice(i, 1);
      }
    }
    return { deletedCount: initial - mockSessionStore.length };
  }),
}));

// Mock invite token creator.
jest.mock('~/models/inviteUser', () => ({
  createInvite: jest.fn(async () => 'invite-token-test'),
}));

// Mock email helper.
const mockSendEmail = jest.fn(async () => ({ ok: true }));
jest.mock('~/server/utils', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
  removePorts: (req) => req.ip,
}));

// Mock checkEmailConfig from @librechat/api.
let mockEmailEnabled = true;
jest.mock('@librechat/api', () => ({
  checkEmailConfig: () => mockEmailEnabled,
  limiterCache: () => undefined,
  isEnabled: () => false,
  isEmailDomainAllowed: () => true,
}));

// Replace requireJwtAuth, checkBan, checkAdmin with shims.
const SystemRoles = { ADMIN: 'ADMIN', USER: 'USER' };
const reqState = { user: null, banned: false };
function setUser(u) {
  reqState.user = u;
}
function setBanned(v) {
  reqState.banned = v;
}

jest.mock('~/server/middleware', () => {
  const auditLogger = require('~/server/middleware/admin/auditLogger');
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
    adminRateLimiter: (_req, _res, next) => next(),
    auditLogger,
  };
});

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let app;
let User;
let AdminAuditLog;
let Balance;
let SubscriptionProfile;
let Message;
let Conversation;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-for-fresh-auth';
  process.env.DOMAIN_CLIENT = 'https://example.test';
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  ({
    User,
    AdminAuditLog,
    Balance,
    SubscriptionProfile,
    Message,
    Conversation,
  } = require('~/db/models'));

  app = express();
  app.use(express.json());
  // Mount the users subrouter directly so we don't depend on the index router
  // (which is owned by a separate wiring step).
  const usersRouter = require('./users');
  app.use('/api/admin/users', usersRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await AdminAuditLog.deleteMany({});
  await Balance.deleteMany({});
  await SubscriptionProfile.deleteMany({});
  await Message.deleteMany({});
  await Conversation.deleteMany({});
  setUser(null);
  setBanned(false);
  mockCache.clear();
  mockBanStore.clear();
  mockTokenStore.length = 0;
  mockSessionStore.length = 0;
  mockSendEmail.mockClear();
  mockEmailEnabled = true;
});

async function settle() {
  // Audit rows are written on `res.on('finish', ...)`, which fires asynchronously.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

async function createTestUser(overrides = {}) {
  const u = await User.create({
    email: overrides.email || `${Math.random().toString(36).slice(2)}@example.com`,
    name: overrides.name || 'Test User',
    username: overrides.username,
    role: overrides.role || SystemRoles.USER,
    provider: overrides.provider || 'local',
    password: overrides.password || 'CorrectHorse1!',
    emailVerified: overrides.emailVerified !== undefined ? overrides.emailVerified : true,
  });
  return u;
}

function setAdminUser(user) {
  setUser({
    _id: user._id,
    id: user._id.toString(),
    email: user.email,
    role: SystemRoles.ADMIN,
  });
}

// Fresh-auth was removed from the admin chain. The function is preserved as
// a no-op shim so existing test call sites (`.set(freshAuthHeader(...))`)
// keep compiling without churn.
function freshAuthHeader(_userId) {
  return {};
}

describe('GET /api/admin/users', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    const u = await createTestUser({ role: SystemRoles.USER });
    setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: SystemRoles.USER });
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(403);
  });

  it('lists users with default pagination', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN, email: 'a@x.com' });
    await createTestUser({ email: 'b@x.com' });
    await createTestUser({ email: 'c@x.com' });
    setAdminUser(admin);

    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(25);
  });

  it('strips password and other sensitive fields from the list', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    await createTestUser({ password: 'sekret123!' });
    setAdminUser(admin);

    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(200);
    for (const u of res.body.items) {
      expect(u.password).toBeUndefined();
      expect(u.totpSecret).toBeUndefined();
      expect(u.backupCodes).toBeUndefined();
      expect(u.refreshToken).toBeUndefined();
    }
  });

  it('caps limit at 100 server-side', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    setAdminUser(admin);
    const res = await request(app).get('/api/admin/users').query({ limit: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  it('rejects invalid sort fields', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    setAdminUser(admin);
    const res = await request(app).get('/api/admin/users').query({ sort: 'password' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_SORT');
  });

  it('escapes regex metacharacters in q so a malformed pattern does not crash', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    setAdminUser(admin);
    const res = await request(app).get('/api/admin/users').query({ q: 'a)b' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('filters by role', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    await createTestUser({ role: SystemRoles.USER });
    await createTestUser({ role: SystemRoles.USER });
    setAdminUser(admin);

    const res = await request(app).get('/api/admin/users').query({ role: 'USER' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });
});

describe('GET /api/admin/users/:id', () => {
  it('returns 400 on invalid ObjectId', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    setAdminUser(admin);
    const res = await request(app).get('/api/admin/users/not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ID');
  });

  it('returns 404 when user not found', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    setAdminUser(admin);
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/admin/users/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it('returns user with subscription and balance summaries', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    const target = await createTestUser({ email: 't@x.com' });
    await Balance.create({ user: target._id, tokenCredits: 1234 });
    await SubscriptionProfile.create({
      userId: target._id,
      appUserId: 'app-' + target._id,
      entitlementId: 'pro',
      isPro: true,
      quota: { period: '2026-05', usedMessages: 5, limit: 100 },
    });
    setAdminUser(admin);

    const res = await request(app).get(`/api/admin/users/${target._id}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('t@x.com');
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.balance.tokenCredits).toBe(1234);
    expect(res.body.subscription.isPro).toBe(true);
    expect(res.body.subscription.quota.usedMessages).toBe(5);
  });
});

describe('POST /api/admin/users/:id/ban', () => {
  it('returns 400 when reason is missing', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    const target = await createTestUser();
    setAdminUser(admin);
    const res = await request(app)
      .post(`/api/admin/users/${target._id}/ban`)
      .set(freshAuthHeader(admin._id))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REASON_REQUIRED');
  });

  it('bans user and writes audit row with before/after', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    const target = await createTestUser({ email: 'bad@x.com' });
    setAdminUser(admin);

    const res = await request(app)
      .post(`/api/admin/users/${target._id}/ban`)
      .set(freshAuthHeader(admin._id))
      .send({ reason: 'spamming the site' });
    expect(res.status).toBe(200);
    expect(res.body.user.banned).toBe(true);
    expect(res.body.user.password).toBeUndefined();

    expect(mockBanStore.has(target._id.toString())).toBe(true);

    await settle();
    const rows = await AdminAuditLog.find({ action: 'USER_BAN' }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('success');
    expect(rows[0].targetId).toBe(target._id.toString());
    expect(rows[0].before).toMatchObject({ banned: false });
    expect(rows[0].after).toMatchObject({ banned: true });
    expect(rows[0].reason).toBe('spamming the site');
  });
});

describe('PATCH /api/admin/users/:id/role', () => {
  it('rejects when admin attempts to change own role', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    setAdminUser(admin);
    const res = await request(app)
      .patch(`/api/admin/users/${admin._id}/role`)
      .set(freshAuthHeader(admin._id))
      .send({ role: 'USER', reason: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_ROLE_CHANGE');
  });

  it('rejects demoting the last remaining admin', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    const otherAdmin = await createTestUser({ role: SystemRoles.ADMIN });
    setAdminUser(admin);

    // Use a fresh actor that is *not* the only admin's email - keep two admins,
    // demote one. That should succeed. Then the remaining admin demoting should fail.
    let res = await request(app)
      .patch(`/api/admin/users/${otherAdmin._id}/role`)
      .set(freshAuthHeader(admin._id))
      .send({ role: 'USER', reason: 'cleanup' });
    expect(res.status).toBe(200);

    // Now there's only one admin left. Try to demote `admin` via a *different*
    // actor (super-actor pattern: pretend a second admin exists in the request).
    // We can't reuse `admin` due to SELF_ROLE_CHANGE, so impersonate a fresh actor.
    const impersonator = await createTestUser({ role: SystemRoles.ADMIN, email: 'imp@x.com' });
    setAdminUser(impersonator);

    res = await request(app)
      .patch(`/api/admin/users/${admin._id}/role`)
      .set(freshAuthHeader(impersonator._id))
      .send({ role: 'USER', reason: 'test' });
    // Now there are 2 admins again because we just made `impersonator`. Demote
    // `admin` succeeds. Then try one more time to demote `impersonator` (the
    // remaining last admin) using an actor who's now USER... not possible.
    expect(res.status).toBe(200);

    // Last admin = impersonator. Use admin (now USER) — checkAdmin will block.
    setAdminUser(impersonator);
    // Attempt by impersonator to demote themselves → SELF_ROLE_CHANGE (covered above).
    // Use a fresh strategy: create yet another admin and try to demote impersonator,
    // then there's only impersonator left — demoting from another actor should hit
    // LAST_ADMIN check.
    const tempAdmin = await createTestUser({ role: SystemRoles.ADMIN, email: 'tmp@x.com' });
    setAdminUser(tempAdmin);
    // Demote impersonator (now there are 2: tempAdmin + impersonator) — succeeds.
    res = await request(app)
      .patch(`/api/admin/users/${impersonator._id}/role`)
      .set(freshAuthHeader(tempAdmin._id))
      .send({ role: 'USER', reason: 'test' });
    expect(res.status).toBe(200);

    // Now only tempAdmin is admin. Try to demote tempAdmin via … another fresh admin? But
    // that violates "last admin" only if we count <= 1. Adding a new admin defeats the
    // purpose. Instead, use a USER-role actor which will fail at checkAdmin (403).
    // To actually exercise LAST_ADMIN, we need an admin-actor different from the target.
    // Create another admin, then demote tempAdmin → that creates 2 admins again and
    // succeeds. So instead: call the service directly via the route as tempAdmin trying
    // to demote tempAdmin (SELF_ROLE_CHANGE) — already covered. Cover LAST_ADMIN by
    // using an alt actor whose existence does NOT count as admin (set up a USER actor
    // and bypass checkAdmin via direct service call would defeat the purpose). Use a
    // direct service-level test instead.

    const usersService = require('~/server/services/admin/users');
    await expect(
      usersService.changeUserRole(tempAdmin._id.toString(), {
        role: 'USER',
        actorId: new mongoose.Types.ObjectId().toString(),
      }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
  });

  it('changes role successfully', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    const target = await createTestUser({ role: SystemRoles.USER });
    setAdminUser(admin);

    const res = await request(app)
      .patch(`/api/admin/users/${target._id}/role`)
      .set(freshAuthHeader(admin._id))
      .send({ role: 'ADMIN', reason: 'promotion' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');

    await settle();
    const rows = await AdminAuditLog.find({ action: 'USER_ROLE_CHANGE' }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].before.role).toBe('USER');
    expect(rows[0].after.role).toBe('ADMIN');
  });
});

describe('POST /api/admin/users/:id/reset-password', () => {
  it('returns 503 when email is not configured', async () => {
    mockEmailEnabled = false;
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    const target = await createTestUser();
    setAdminUser(admin);

    const res = await request(app)
      .post(`/api/admin/users/${target._id}/reset-password`)
      .set(freshAuthHeader(admin._id))
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('EMAIL_NOT_CONFIGURED');
  });

  it('returns 200 when email is configured', async () => {
    mockEmailEnabled = true;
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    const target = await createTestUser();
    setAdminUser(admin);

    const res = await request(app)
      .post(`/api/admin/users/${target._id}/reset-password`)
      .set(freshAuthHeader(admin._id))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/admin/users/invite', () => {
  it('blocks an already-banned email', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    const banned = await createTestUser({ email: 'bad@x.com' });
    mockBanStore.set(banned._id.toString(), { type: 'concurrent' });
    setAdminUser(admin);

    const res = await request(app).post('/api/admin/users/invite').send({ email: 'bad@x.com' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_BANNED');
  });

  it('rejects when email already exists (not banned)', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    await createTestUser({ email: 'ok@x.com' });
    setAdminUser(admin);

    const res = await request(app).post('/api/admin/users/invite').send({ email: 'ok@x.com' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_EXISTS');
  });

  it('invites a new user successfully', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    setAdminUser(admin);
    const res = await request(app)
      .post('/api/admin/users/invite')
      .send({ email: 'new@x.com', name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('rejects on confirmEmail mismatch', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    const target = await createTestUser({ email: 'a@x.com' });
    setAdminUser(admin);

    const res = await request(app)
      .delete(`/api/admin/users/${target._id}`)
      .set(freshAuthHeader(admin._id))
      .send({ confirmEmail: 'wrong@x.com', reason: 'cleanup' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_MISMATCH');
  });

  it('rejects deleting self', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    setAdminUser(admin);
    const res = await request(app)
      .delete(`/api/admin/users/${admin._id}`)
      .set(freshAuthHeader(admin._id))
      .send({ confirmEmail: admin.email, reason: 'self' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_DELETE');
  });

  it('rejects deleting the last admin', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    setAdminUser(admin);

    // Try to delete admin via the service (since checkAdmin requires admin actor).
    const usersService = require('~/server/services/admin/users');
    await expect(
      usersService.deleteUser(admin._id.toString(), {
        confirmEmail: admin.email,
        actorId: new mongoose.Types.ObjectId().toString(),
      }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
  });

  it('deletes user and cascades messages/conversations', async () => {
    const admin = await createTestUser({ role: SystemRoles.ADMIN });
    const target = await createTestUser({ email: 'goodbye@x.com' });
    const tid = target._id.toString();

    await Message.create({ user: tid, text: 'hello' });
    await Message.create({ user: tid, text: 'world' });
    await Conversation.create({ user: tid, title: 'chat' });
    setAdminUser(admin);

    const res = await request(app)
      .delete(`/api/admin/users/${target._id}`)
      .set(freshAuthHeader(admin._id))
      .send({ confirmEmail: 'goodbye@x.com', reason: 'cleanup' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    expect(await User.countDocuments({ _id: target._id })).toBe(0);
    expect(await Message.countDocuments({ user: tid })).toBe(0);
    expect(await Conversation.countDocuments({ user: tid })).toBe(0);
  });
});
