jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
  AdminAuditActions: {
    AUDIT_VIEW: 'AUDIT_VIEW',
    USAGE_VIEW: 'USAGE_VIEW',
    REAUTH: 'REAUTH',
  },
}));

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

jest.mock('~/models', () => ({
  updateUser: jest.fn(),
  findUser: jest.fn(),
  comparePassword: jest.fn(),
}));

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
  const subscriptionProfileSchema = new m.Schema(
    {
      userId: { type: m.Schema.Types.ObjectId, required: true },
      isPro: { type: Boolean, default: false },
      manualOverride: {
        enabled: { type: Boolean, default: false },
        mode: String,
        source: String,
        updatedAt: Date,
      },
    },
    { timestamps: true },
  );
  const transactionSchema = new m.Schema(
    {
      user: { type: m.Schema.Types.ObjectId, required: true },
      tokenType: String,
      rawAmount: Number,
      inputTokens: Number,
      writeTokens: Number,
      readTokens: Number,
    },
    { timestamps: true },
  );
  const messageSchema = new m.Schema(
    {
      messageId: String,
      conversationId: String,
      user: m.Schema.Types.ObjectId,
      tokenCount: Number,
    },
    { timestamps: true },
  );
  return {
    User: m.models.User || m.model('User', userSchema),
    AdminAuditLog: m.models.AdminAuditLog || m.model('AdminAuditLog', auditSchema),
    SubscriptionProfile:
      m.models.SubscriptionProfile || m.model('SubscriptionProfile', subscriptionProfileSchema),
    Transaction: m.models.Transaction || m.model('Transaction', transactionSchema),
    Message: m.models.Message || m.model('Message', messageSchema),
  };
});

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
let User, AdminAuditLog, SubscriptionProfile, Transaction, Message;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  ({ User, AdminAuditLog, SubscriptionProfile, Transaction, Message } = require('~/db/models'));

  app = express();
  app.use(express.json());
  const overviewRouter = require('./overview');
  app.use('/api/admin/overview', overviewRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await AdminAuditLog.deleteMany({});
  await SubscriptionProfile.deleteMany({});
  await Transaction.deleteMany({});
  await Message.deleteMany({});
  setUser(null);
  setBanned(false);
  mockCache.clear();
});

async function createAdmin() {
  const u = await User.create({
    email: `admin-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Admin',
    role: SystemRoles.ADMIN,
    provider: 'local',
    password: 'pw',
    emailVerified: true,
  });
  setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
  return u;
}

async function createNonAdmin() {
  const u = await User.create({
    email: `user-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'User',
    role: SystemRoles.USER,
    provider: 'local',
    password: 'pw',
    emailVerified: true,
  });
  setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
  return u;
}

describe('GET /api/admin/overview', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/admin/overview');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin requests', async () => {
    await createNonAdmin();
    const res = await request(app).get('/api/admin/overview');
    expect(res.status).toBe(403);
  });

  it('returns expected shape', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/overview');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        users: expect.objectContaining({
          total: expect.any(Number),
          newLast7d: expect.any(Number),
          newLast30d: expect.any(Number),
        }),
        subscriptions: expect.objectContaining({
          activePro: expect.any(Number),
          manuallyOverridden: expect.any(Number),
        }),
        messages: expect.objectContaining({
          total30d: expect.any(Number),
          totalAll: expect.any(Number),
        }),
        tokens: expect.objectContaining({
          total30d: expect.any(Number),
        }),
        audit: expect.objectContaining({
          total30d: expect.any(Number),
          failures30d: expect.any(Number),
        }),
      }),
    );
  });

  it('returns accurate counts with seeded data', async () => {
    const admin = await createAdmin();

    // Seed extra users — admin already counts as 1
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    const recent = await User.create({
      email: 'recent@example.com',
      name: 'Recent',
      role: SystemRoles.USER,
      provider: 'local',
      emailVerified: true,
    });
    // Backdate two more users.
    const eightDaysOld = await User.create({
      email: 'eight@example.com',
      name: 'Eight',
      role: SystemRoles.USER,
      provider: 'local',
      emailVerified: true,
    });
    const veryOld = await User.create({
      email: 'old@example.com',
      name: 'Old',
      role: SystemRoles.USER,
      provider: 'local',
      emailVerified: true,
    });
    // Bypass mongoose's timestamp middleware via the raw driver.
    await User.collection.updateOne(
      { _id: eightDaysOld._id },
      { $set: { createdAt: eightDaysAgo } },
    );
    await User.collection.updateOne({ _id: veryOld._id }, { $set: { createdAt: fortyDaysAgo } });

    // Subscriptions: 1 pro, 1 with manual override
    await SubscriptionProfile.create({ userId: recent._id, isPro: true });
    await SubscriptionProfile.create({
      userId: eightDaysOld._id,
      isPro: false,
      manualOverride: { enabled: true, mode: 'grant' },
    });

    // Messages: 2 recent, 1 ancient
    await Message.create({ messageId: 'm1', user: recent._id });
    await Message.create({ messageId: 'm2', user: recent._id });
    const oldMsg = await Message.create({ messageId: 'm3', user: recent._id });
    await Message.collection.updateOne({ _id: oldMsg._id }, { $set: { createdAt: fortyDaysAgo } });

    // Transactions: 100 + 200 in last 30d, 9999 ancient
    await Transaction.create({ user: recent._id, tokenType: 'prompt', rawAmount: 100 });
    await Transaction.create({ user: recent._id, tokenType: 'completion', rawAmount: 200 });
    const ancientTx = await Transaction.create({
      user: recent._id,
      tokenType: 'prompt',
      rawAmount: 9999,
    });
    await Transaction.collection.updateOne(
      { _id: ancientTx._id },
      { $set: { createdAt: fortyDaysAgo } },
    );

    // Audit logs: 2 success, 1 failure in last 30d
    await AdminAuditLog.create({
      actorId: admin._id,
      actorEmail: admin.email,
      action: 'USER_LIST',
      targetType: 'user',
      status: 'success',
    });
    await AdminAuditLog.create({
      actorId: admin._id,
      actorEmail: admin.email,
      action: 'USER_LIST',
      targetType: 'user',
      status: 'success',
    });
    await AdminAuditLog.create({
      actorId: admin._id,
      actorEmail: admin.email,
      action: 'USER_BAN',
      targetType: 'user',
      status: 'failure',
    });

    const res = await request(app).get('/api/admin/overview');
    expect(res.status).toBe(200);
    // total users = admin + recent + eightDaysOld + veryOld = 4
    expect(res.body.users.total).toBe(4);
    // newLast7d = admin + recent (eightDaysOld is 8d, veryOld is 40d)
    expect(res.body.users.newLast7d).toBe(2);
    // newLast30d = admin + recent + eightDaysOld
    expect(res.body.users.newLast30d).toBe(3);

    expect(res.body.subscriptions.activePro).toBe(1);
    expect(res.body.subscriptions.manuallyOverridden).toBe(1);

    expect(res.body.messages.totalAll).toBe(3);
    expect(res.body.messages.total30d).toBe(2);

    expect(res.body.tokens.total30d).toBe(300);

    // Plus the AUDIT_VIEW/USAGE_VIEW row written by this request itself.
    // But the audit middleware writes after `res.on('finish')`, so it
    // shouldn't be in the count returned by the response yet.
    expect(res.body.audit.total30d).toBe(3);
    expect(res.body.audit.failures30d).toBe(1);
  });
});
