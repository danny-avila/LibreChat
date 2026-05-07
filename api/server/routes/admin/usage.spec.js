jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
  AdminAuditActions: {
    USAGE_VIEW: 'USAGE_VIEW',
    TRANSACTION_VIEW: 'TRANSACTION_VIEW',
  },
}));

// Mock the cache used by limiterCache and ban cache.
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

// Self-contained mongoose models matching the production schemas closely.
jest.mock('~/db/models', () => {
  const m = require('mongoose');
  const userSchema = new m.Schema(
    {
      email: { type: String, required: true },
      name: String,
      role: String,
      provider: { type: String, default: 'local' },
      emailVerified: { type: Boolean, default: false },
    },
    { timestamps: true },
  );
  const transactionSchema = new m.Schema(
    {
      user: { type: m.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      conversationId: { type: String, index: true },
      tokenType: { type: String, enum: ['prompt', 'completion', 'credits'], required: true },
      model: String,
      context: String,
      rate: Number,
      rawAmount: Number,
      tokenValue: Number,
      inputTokens: Number,
      writeTokens: Number,
      readTokens: Number,
    },
    { timestamps: true },
  );
  const messageSchema = new m.Schema(
    {
      messageId: { type: String, required: true, unique: true, index: true },
      conversationId: { type: String, required: true, index: true },
      user: { type: String, required: true, index: true, default: null },
      model: String,
      sender: String,
      text: String,
      tokenCount: Number,
      isCreatedByUser: { type: Boolean, default: false },
    },
    { timestamps: true },
  );
  const subscriptionProfileSchema = new m.Schema(
    {
      userId: { type: m.Schema.Types.ObjectId, required: true },
      appUserId: String,
      entitlementId: String,
      isPro: { type: Boolean, default: false },
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

  return {
    User: m.models.User || m.model('User', userSchema),
    Transaction: m.models.Transaction || m.model('Transaction', transactionSchema),
    Message: m.models.Message || m.model('Message', messageSchema),
    SubscriptionProfile:
      m.models.SubscriptionProfile || m.model('SubscriptionProfile', subscriptionProfileSchema),
    AdminAuditLog: m.models.AdminAuditLog || m.model('AdminAuditLog', auditSchema),
  };
});

// Short-circuit `~/models` so we don't pull the heavy createMethods chain
// (which requires the real @librechat/data-schemas) when middleware/index.js
// transitively requires it.
jest.mock('~/models', () => ({}));

const SystemRoles = { ADMIN: 'ADMIN', USER: 'USER' };
const reqState = { user: null, banned: false };
function setUser(u) {
  reqState.user = u;
}
function setBanned(v) {
  reqState.banned = v;
}

jest.mock('~/server/middleware', () => {
  const actual = jest.requireActual('~/server/middleware');
  return {
    ...actual,
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
  };
});

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let app;
let User, Transaction, Message, SubscriptionProfile, AdminAuditLog;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  ({ User, Transaction, Message, SubscriptionProfile, AdminAuditLog } = require('~/db/models'));

  app = express();
  app.use(express.json());
  const usageRouter = require('./usage');
  app.use('/api/admin/usage', usageRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Transaction.deleteMany({});
  await Message.deleteMany({});
  await SubscriptionProfile.deleteMany({});
  await AdminAuditLog.deleteMany({});
  setUser(null);
  setBanned(false);
  mockCache.clear();
});

async function createUser({ role = SystemRoles.USER } = {}) {
  return User.create({
    email: `${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Test',
    role,
    provider: 'local',
    emailVerified: true,
  });
}

async function createAdmin() {
  const admin = await createUser({ role: SystemRoles.ADMIN });
  setUser({ _id: admin._id, id: admin._id.toString(), email: admin.email, role: admin.role });
  return admin;
}

async function flushAudit() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe('GET /api/admin/usage/users/:userId', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get(`/api/admin/usage/users/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    const u = await createUser({ role: SystemRoles.USER });
    setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
    const res = await request(app).get(`/api/admin/usage/users/${u._id}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid userId', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/usage/users/not-an-objectid');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_USER_ID');
  });

  it('returns 400 on invalid range', async () => {
    await createAdmin();
    const target = await createUser();
    const res = await request(app).get(`/api/admin/usage/users/${target._id}?range=14d`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RANGE');
  });

  it('returns 404 if user does not exist', async () => {
    await createAdmin();
    const fake = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/admin/usage/users/${fake}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('returns timeseries with seeded transactions', async () => {
    await createAdmin();
    const target = await createUser();

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    await Transaction.create([
      {
        user: target._id,
        tokenType: 'prompt',
        model: 'gpt-4',
        rawAmount: -100,
        createdAt: now,
      },
      {
        user: target._id,
        tokenType: 'completion',
        model: 'gpt-4',
        rawAmount: -50,
        createdAt: now,
      },
      {
        user: target._id,
        tokenType: 'prompt',
        model: 'gpt-3.5',
        rawAmount: -200,
        createdAt: yesterday,
      },
      {
        user: target._id,
        tokenType: 'completion',
        model: 'gpt-3.5',
        rawAmount: -75,
        createdAt: yesterday,
      },
    ]);

    const res = await request(app).get(
      `/api/admin/usage/users/${target._id}?range=7d&granularity=day`,
    );
    expect(res.status).toBe(200);
    expect(res.body.granularity).toBe('day');
    expect(Array.isArray(res.body.byDay)).toBe(true);
    expect(Array.isArray(res.body.byModel)).toBe(true);
    expect(res.body.totals.prompt).toBe(300);
    expect(res.body.totals.completion).toBe(125);

    const gpt4 = res.body.byModel.find((m) => m.model === 'gpt-4');
    expect(gpt4).toBeDefined();
    expect(gpt4.prompt).toBe(100);
    expect(gpt4.completion).toBe(50);
    expect(gpt4.totalTokens).toBe(150);

    await flushAudit();
    const auditRows = await AdminAuditLog.find({ action: 'USAGE_VIEW' }).lean();
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/admin/usage/transactions', () => {
  it('returns 403 for non-admin', async () => {
    const u = await createUser();
    setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
    const res = await request(app).get('/api/admin/usage/transactions');
    expect(res.status).toBe(403);
  });

  it('paginates, filters, and caps limit', async () => {
    await createAdmin();
    const u = await createUser();

    const docs = [];
    for (let i = 0; i < 60; i++) {
      docs.push({
        user: u._id,
        tokenType: i % 2 === 0 ? 'prompt' : 'completion',
        model: 'gpt-4',
        rawAmount: -10,
        createdAt: new Date(Date.now() - i * 60 * 1000),
      });
    }
    await Transaction.insertMany(docs);

    const r1 = await request(app).get('/api/admin/usage/transactions?page=1&limit=10');
    expect(r1.status).toBe(200);
    expect(r1.body.items.length).toBe(10);
    expect(r1.body.total).toBe(60);
    expect(r1.body.page).toBe(1);
    expect(r1.body.limit).toBe(10);

    // limit cap (200)
    const r2 = await request(app).get('/api/admin/usage/transactions?limit=10000');
    expect(r2.status).toBe(200);
    expect(r2.body.limit).toBe(200);

    // tokenType filter
    const r3 = await request(app).get('/api/admin/usage/transactions?tokenType=prompt');
    expect(r3.status).toBe(200);
    for (const item of r3.body.items) {
      expect(item.tokenType).toBe('prompt');
    }

    // userId filter
    const r4 = await request(app).get(`/api/admin/usage/transactions?userId=${u._id}`);
    expect(r4.status).toBe(200);
    expect(r4.body.total).toBe(60);

    // bad userId rejected
    const r5 = await request(app).get('/api/admin/usage/transactions?userId=bad');
    expect(r5.status).toBe(400);

    // bad tokenType rejected
    const r6 = await request(app).get('/api/admin/usage/transactions?tokenType=foo');
    expect(r6.status).toBe(400);

    // bad from rejected
    const r7 = await request(app).get('/api/admin/usage/transactions?from=not-a-date');
    expect(r7.status).toBe(400);
  });
});

describe('GET /api/admin/usage/stats/overview', () => {
  it('returns 403 for non-admin', async () => {
    const u = await createUser();
    setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
    const res = await request(app).get('/api/admin/usage/stats/overview');
    expect(res.status).toBe(403);
  });

  it('returns reasonable overview numbers', async () => {
    await createAdmin();
    const u1 = await createUser();
    const u2 = await createUser();

    await SubscriptionProfile.create({
      userId: u1._id,
      appUserId: u1._id.toString(),
      entitlementId: 'pro',
      isPro: true,
    });

    const now = new Date();
    await Message.insertMany([
      {
        messageId: 'm1',
        conversationId: 'c1',
        user: u1._id.toString(),
        sender: 'user',
        isCreatedByUser: true,
        createdAt: now,
      },
      {
        messageId: 'm2',
        conversationId: 'c1',
        user: u1._id.toString(),
        sender: 'gpt',
        createdAt: now,
      },
      {
        messageId: 'm3',
        conversationId: 'c2',
        user: u2._id.toString(),
        sender: 'user',
        isCreatedByUser: true,
        createdAt: now,
      },
    ]);

    await Transaction.insertMany([
      { user: u1._id, tokenType: 'prompt', model: 'gpt-4', rawAmount: -100, createdAt: now },
      { user: u2._id, tokenType: 'completion', model: 'gpt-4', rawAmount: -50, createdAt: now },
    ]);

    const res = await request(app).get('/api/admin/usage/stats/overview');
    expect(res.status).toBe(200);
    expect(res.body.totalUsers).toBeGreaterThanOrEqual(3);
    expect(res.body.activeUsers30d).toBe(2);
    expect(res.body.activeProUsers).toBe(1);
    expect(res.body.messages30d).toBe(3);
    expect(res.body.tokens30d).toBe(150);
    expect(Array.isArray(res.body.dauTimeseries)).toBe(true);
    expect(res.body.dauTimeseries.length).toBe(30);
    expect(Array.isArray(res.body.messagesByDay)).toBe(true);
    expect(res.body.messagesByDay.length).toBe(30);
  });
});

describe('GET /api/admin/usage/stats/usage', () => {
  it('returns 400 on invalid range', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/usage/stats/usage?range=7d');
    expect(res.status).toBe(400);
  });

  it('returns org-wide token usage by day and by model', async () => {
    await createAdmin();
    const u1 = await createUser();
    const u2 = await createUser();
    const now = new Date();
    await Transaction.insertMany([
      { user: u1._id, tokenType: 'prompt', model: 'gpt-4', rawAmount: -100, createdAt: now },
      { user: u2._id, tokenType: 'completion', model: 'gpt-4', rawAmount: -50, createdAt: now },
      { user: u1._id, tokenType: 'prompt', model: 'gpt-3.5', rawAmount: -25, createdAt: now },
    ]);

    const res = await request(app).get('/api/admin/usage/stats/usage?range=30d');
    expect(res.status).toBe(200);
    expect(res.body.totals.prompt).toBe(125);
    expect(res.body.totals.completion).toBe(50);
    expect(res.body.byModel.length).toBe(2);
  });
});
