jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
  AdminAuditActions: {
    BALANCE_VIEW: 'BALANCE_VIEW',
    BALANCE_ADJUST: 'BALANCE_ADJUST',
    BALANCE_SET: 'BALANCE_SET',
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
      emailVerified: { type: Boolean, default: false },
    },
    { timestamps: true },
  );
  const balanceSchema = new m.Schema({
    user: { type: m.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    tokenCredits: { type: Number, default: 0 },
    autoRefillEnabled: { type: Boolean, default: false },
    refillIntervalValue: { type: Number, default: 30 },
    refillIntervalUnit: {
      type: String,
      enum: ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'],
      default: 'days',
    },
    lastRefill: { type: Date, default: Date.now },
    refillAmount: { type: Number, default: 0 },
  });
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
    Balance: m.models.Balance || m.model('Balance', balanceSchema),
    AdminAuditLog: m.models.AdminAuditLog || m.model('AdminAuditLog', auditSchema),
  };
});

// Short-circuit `~/models` so we don't pull the heavy createMethods chain
// (which requires the real @librechat/data-schemas) when middleware/index.js
// transitively requires it.
jest.mock('~/models', () => ({}));

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
let User, Balance, AdminAuditLog;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  ({ User, Balance, AdminAuditLog } = require('~/db/models'));

  app = express();
  app.use(express.json());
  const balanceRouter = require('./balance');
  app.use('/api/admin/balance', balanceRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Balance.deleteMany({});
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

// No-op shim: fresh-auth was removed from the admin chain. Existing test
// call sites that pass this to `.set('x-fresh-auth-token', ...)` still work
// because the route no longer reads that header.
function freshTokenFor(_adminId) {
  return '';
}

// Wait for the audit row that's written on `res.on('finish')` to land.
async function flushAudit() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe('GET /api/admin/balance/users/:userId', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get(`/api/admin/balance/users/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    const u = await createUser({ role: SystemRoles.USER });
    setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
    const res = await request(app).get(`/api/admin/balance/users/${u._id}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid userId', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/balance/users/not-an-objectid');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_USER_ID');
  });

  it('returns 404 NO_BALANCE when no balance row exists', async () => {
    await createAdmin();
    const target = await createUser();
    const res = await request(app).get(`/api/admin/balance/users/${target._id}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_BALANCE');
  });

  it('returns the balance plus autoRefill block', async () => {
    await createAdmin();
    const target = await createUser();
    await Balance.create({
      user: target._id,
      tokenCredits: 50000,
      autoRefillEnabled: true,
      refillIntervalValue: 7,
      refillIntervalUnit: 'days',
      refillAmount: 1000,
    });
    const res = await request(app).get(`/api/admin/balance/users/${target._id}`);
    expect(res.status).toBe(200);
    expect(res.body.tokenCredits).toBe(50000);
    expect(res.body.autoRefill).toMatchObject({
      enabled: true,
      intervalValue: 7,
      intervalUnit: 'days',
      amount: 1000,
    });
  });
});

describe('POST /api/admin/balance/users/:userId/adjust', () => {
  it('returns 403 when not admin', async () => {
    const u = await createUser({ role: SystemRoles.USER });
    setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
    const res = await request(app)
      .post(`/api/admin/balance/users/${u._id}/adjust`)
      .send({ delta: 100, reason: 'test' });
    expect(res.status).toBe(403);
  });

  it('returns 400 INVALID_DELTA when delta is non-numeric', async () => {
    await createAdmin();
    const target = await createUser();
    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/adjust`)
      .send({ delta: 'lots', reason: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_DELTA');
  });

  it('returns 400 INVALID_REASON when reason is missing', async () => {
    await createAdmin();
    const target = await createUser();
    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/adjust`)
      .send({ delta: 100 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REASON');
  });

  it('returns 404 USER_NOT_FOUND when user does not exist', async () => {
    await createAdmin();
    const fake = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/admin/balance/users/${fake}/adjust`)
      .send({ delta: 100, reason: 'test' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('small positive delta works without fresh auth and writes audit row', async () => {
    const admin = await createAdmin();
    const target = await createUser();
    await Balance.create({ user: target._id, tokenCredits: 1000 });

    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/adjust`)
      .send({ delta: 500, reason: 'Top up' });
    expect(res.status).toBe(200);
    expect(res.body.tokenCredits).toBe(1500);
    expect(res.body.before).toBe(1000);

    await flushAudit();
    const rows = await AdminAuditLog.find({ actorId: admin._id }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('BALANCE_ADJUST');
    expect(rows[0].targetType).toBe('balance');
    expect(rows[0].targetId).toBe(target._id.toString());
    expect(rows[0].before).toEqual({ tokenCredits: 1000 });
    expect(rows[0].after).toEqual({ tokenCredits: 1500 });
    expect(rows[0].meta).toEqual({ delta: 500 });
    expect(rows[0].reason).toBe('Top up');
    expect(rows[0].status).toBe('success');
  });

  it('upserts a balance row on positive delta when none exists', async () => {
    await createAdmin();
    const target = await createUser();
    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/adjust`)
      .send({ delta: 750, reason: 'Initial credit' });
    expect(res.status).toBe(200);
    expect(res.body.tokenCredits).toBe(750);
    expect(res.body.before).toBe(0);
  });

  it('negative delta succeeds', async () => {
    const admin = await createAdmin();
    const target = await createUser();
    await Balance.create({ user: target._id, tokenCredits: 1000 });
    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/adjust`)
      .set('x-fresh-auth-token', freshTokenFor(admin._id))
      .send({ delta: -300, reason: 'Refund' });
    expect(res.status).toBe(200);
    expect(res.body.tokenCredits).toBe(700);
    expect(res.body.before).toBe(1000);
  });

  it('large positive delta (>10M) succeeds', async () => {
    const admin = await createAdmin();
    const target = await createUser();
    await Balance.create({ user: target._id, tokenCredits: 1000 });
    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/adjust`)
      .set('x-fresh-auth-token', freshTokenFor(admin._id))
      .send({ delta: 20_000_000, reason: 'Big top-up' });
    expect(res.status).toBe(200);
    expect(res.body.tokenCredits).toBe(20_001_000);
  });

  it('underflow returns 400 INSUFFICIENT_BALANCE', async () => {
    const admin = await createAdmin();
    const target = await createUser();
    await Balance.create({ user: target._id, tokenCredits: 100 });
    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/adjust`)
      .set('x-fresh-auth-token', freshTokenFor(admin._id))
      .send({ delta: -500, reason: 'Refund' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');

    // The balance must remain unchanged.
    const after = await Balance.findOne({ user: target._id }).lean();
    expect(after.tokenCredits).toBe(100);

    // Audit row written even on failure.
    await flushAudit();
    const rows = await AdminAuditLog.find({ actorId: admin._id, action: 'BALANCE_ADJUST' }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('failure');
    expect(rows[0].meta).toEqual({ delta: -500 });
  });
});

describe('POST /api/admin/balance/users/:userId/set', () => {
  it('returns 403 when not admin', async () => {
    const u = await createUser({ role: SystemRoles.USER });
    setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
    const res = await request(app)
      .post(`/api/admin/balance/users/${u._id}/set`)
      .send({ tokenCredits: 100, reason: 'test' });
    expect(res.status).toBe(403);
  });

  it('rejects negative tokenCredits', async () => {
    await createAdmin();
    const target = await createUser();
    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/set`)
      .send({ tokenCredits: -1, reason: 'reset' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN_CREDITS');
  });

  it('rejects non-integer tokenCredits', async () => {
    await createAdmin();
    const target = await createUser();
    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/set`)
      .send({ tokenCredits: 12.5, reason: 'reset' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN_CREDITS');
  });

  it('returns 400 INVALID_REASON when reason missing', async () => {
    await createAdmin();
    const target = await createUser();
    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/set`)
      .send({ tokenCredits: 1000 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REASON');
  });

  it('returns 404 USER_NOT_FOUND when user does not exist', async () => {
    const admin = await createAdmin();
    const fake = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/admin/balance/users/${fake}/set`)
      .set('x-fresh-auth-token', freshTokenFor(admin._id))
      .send({ tokenCredits: 1000, reason: 'reset' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('sets the balance with proper fresh-auth token (upsert)', async () => {
    const admin = await createAdmin();
    const target = await createUser();

    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/set`)
      .set('x-fresh-auth-token', freshTokenFor(admin._id))
      .send({ tokenCredits: 7777, reason: 'manual reset' });
    expect(res.status).toBe(200);
    expect(res.body.tokenCredits).toBe(7777);
    expect(res.body.before).toBe(0);

    const stored = await Balance.findOne({ user: target._id }).lean();
    expect(stored.tokenCredits).toBe(7777);

    await flushAudit();
    const rows = await AdminAuditLog.find({ actorId: admin._id, action: 'BALANCE_SET' }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].before).toEqual({ tokenCredits: 0 });
    expect(rows[0].after).toEqual({ tokenCredits: 7777 });
    expect(rows[0].meta).toEqual({ requested: 7777 });
    expect(rows[0].reason).toBe('manual reset');
    expect(rows[0].status).toBe('success');
  });

  it('overwrites an existing balance', async () => {
    const admin = await createAdmin();
    const target = await createUser();
    await Balance.create({ user: target._id, tokenCredits: 9999 });

    const res = await request(app)
      .post(`/api/admin/balance/users/${target._id}/set`)
      .set('x-fresh-auth-token', freshTokenFor(admin._id))
      .send({ tokenCredits: 100, reason: 'reset' });
    expect(res.status).toBe(200);
    expect(res.body.tokenCredits).toBe(100);
    expect(res.body.before).toBe(9999);
  });
});
