jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
  AdminAuditActions: {
    AUDIT_VIEW: 'AUDIT_VIEW',
    USER_BAN: 'USER_BAN',
    USER_LIST: 'USER_LIST',
    REAUTH: 'REAUTH',
    USAGE_VIEW: 'USAGE_VIEW',
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
  // Stub: prevents loading the real `api/models/index.js`, which calls
  // `createMethods` on the mocked `@librechat/data-schemas` (and crashes).
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
  return {
    User: m.models.User || m.model('User', userSchema),
    AdminAuditLog: m.models.AdminAuditLog || m.model('AdminAuditLog', auditSchema),
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
let User, AdminAuditLog;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  ({ User, AdminAuditLog } = require('~/db/models'));

  app = express();
  app.use(express.json());
  const auditRouter = require('./audit');
  app.use('/api/admin/audit', auditRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await AdminAuditLog.deleteMany({});
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

async function seedAuditRow(overrides = {}) {
  return AdminAuditLog.create({
    actorId: overrides.actorId || new mongoose.Types.ObjectId(),
    actorEmail: overrides.actorEmail || 'a@example.com',
    action: overrides.action || 'USER_LIST',
    targetType: overrides.targetType || 'user',
    targetId: overrides.targetId ?? null,
    status: overrides.status || 'success',
    reason: overrides.reason ?? null,
    createdAt: overrides.createdAt,
    meta: overrides.meta ?? null,
  });
}

describe('GET /api/admin/audit', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/admin/audit');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin requests', async () => {
    await createNonAdmin();
    const res = await request(app).get('/api/admin/audit');
    expect(res.status).toBe(403);
  });

  it('returns paginated list with default sort', async () => {
    await createAdmin();
    for (let i = 0; i < 3; i++) {
      await seedAuditRow({ action: 'USER_LIST' });
    }

    const res = await request(app).get('/api/admin/audit');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('filters by actorId', async () => {
    await createAdmin();
    const actorA = new mongoose.Types.ObjectId();
    const actorB = new mongoose.Types.ObjectId();
    await seedAuditRow({ actorId: actorA, action: 'USER_LIST' });
    await seedAuditRow({ actorId: actorA, action: 'USER_BAN' });
    await seedAuditRow({ actorId: actorB, action: 'USER_LIST' });

    const res = await request(app).get('/api/admin/audit').query({ actorId: actorA.toString() });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    for (const item of res.body.items) {
      expect(String(item.actorId)).toBe(actorA.toString());
    }
  });

  it('rejects invalid actorId', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/audit').query({ actorId: 'not-an-id' });
    expect(res.status).toBe(400);
  });

  it('filters by action', async () => {
    await createAdmin();
    await seedAuditRow({ action: 'USER_LIST' });
    await seedAuditRow({ action: 'USER_BAN' });

    const res = await request(app).get('/api/admin/audit').query({ action: 'USER_BAN' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].action).toBe('USER_BAN');
  });

  it('rejects unknown action', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/audit').query({ action: 'NOT_A_REAL_ACTION' });
    expect(res.status).toBe(400);
  });

  it('filters by targetType', async () => {
    await createAdmin();
    await seedAuditRow({ targetType: 'user' });
    await seedAuditRow({ targetType: 'subscription' });

    const res = await request(app).get('/api/admin/audit').query({ targetType: 'subscription' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].targetType).toBe('subscription');
  });

  it('rejects unknown targetType', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/audit').query({ targetType: 'banana' });
    expect(res.status).toBe(400);
  });

  it('filters by status', async () => {
    await createAdmin();
    await seedAuditRow({ status: 'success' });
    await seedAuditRow({ status: 'failure' });

    const res = await request(app).get('/api/admin/audit').query({ status: 'failure' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].status).toBe('failure');
  });

  it('rejects invalid status', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/audit').query({ status: 'pending' });
    expect(res.status).toBe(400);
  });

  it('filters by date range', async () => {
    await createAdmin();
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    await seedAuditRow({ createdAt: old });
    await seedAuditRow({ createdAt: recent });

    const res = await request(app)
      .get('/api/admin/audit')
      .query({ from: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it('rejects unparseable date', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/audit').query({ from: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  it('paginates results', async () => {
    await createAdmin();
    for (let i = 0; i < 5; i++) {
      await seedAuditRow();
    }
    const res = await request(app).get('/api/admin/audit').query({ page: '2', limit: '2' });
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(2);
    expect(res.body.items.length).toBeLessThanOrEqual(2);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
  });

  it('caps limit at 200', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/audit').query({ limit: '500' });
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
  });

  it('falls back to default sort when sort is not whitelisted', async () => {
    await createAdmin();
    await seedAuditRow();
    const res = await request(app).get('/api/admin/audit').query({ sort: 'actorEmail' });
    expect(res.status).toBe(200);
  });

  it('escapes regex characters in q', async () => {
    await createAdmin();
    await seedAuditRow({ actorEmail: 'plain@example.com', reason: 'plain reason' });
    await seedAuditRow({ actorEmail: 'plain@example.com', reason: 'special.case' });

    const res = await request(app).get('/api/admin/audit').query({ q: '.*' });
    expect(res.status).toBe(200);
    // ".*" treated literally, no row should match (no rows contain literal ".*")
    expect(res.body.total).toBe(0);
  });

  it('matches q against actorEmail, targetId, and reason fields', async () => {
    await createAdmin();
    await seedAuditRow({ actorEmail: 'unique-email@example.com' });
    await seedAuditRow({ targetId: 'unique-target-id-xyz' });
    await seedAuditRow({ reason: 'unique-reason-string' });
    await seedAuditRow({ actorEmail: 'other@example.com' });

    const r1 = await request(app).get('/api/admin/audit').query({ q: 'unique-email' });
    expect(r1.body.total).toBe(1);
    const r2 = await request(app).get('/api/admin/audit').query({ q: 'unique-target-id' });
    expect(r2.body.total).toBe(1);
    const r3 = await request(app).get('/api/admin/audit').query({ q: 'unique-reason' });
    expect(r3.body.total).toBe(1);
  });
});

describe('GET /api/admin/audit/actions', () => {
  it('returns counts grouped by action for last 30 days', async () => {
    await createAdmin();
    await seedAuditRow({ action: 'USER_LIST' });
    await seedAuditRow({ action: 'USER_LIST' });
    await seedAuditRow({ action: 'USER_BAN' });
    // older than 30 days — should be excluded
    await seedAuditRow({
      action: 'USER_LIST',
      createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app).get('/api/admin/audit/actions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const map = Object.fromEntries(res.body.map((r) => [r.action, r.count]));
    expect(map.USER_LIST).toBe(2);
    expect(map.USER_BAN).toBe(1);
  });
});

describe('GET /api/admin/audit/:id', () => {
  it('returns 400 for invalid object id', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/audit/not-an-id');
    expect(res.status).toBe(400);
  });

  it('returns 404 when not found', async () => {
    await createAdmin();
    const id = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/admin/audit/${id}`);
    expect(res.status).toBe(404);
  });

  it('returns the row when found', async () => {
    await createAdmin();
    const row = await seedAuditRow({ action: 'USER_BAN' });
    const res = await request(app).get(`/api/admin/audit/${row._id.toString()}`);
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('USER_BAN');
  });
});

describe('audit router immutability', () => {
  it('does not expose POST', async () => {
    await createAdmin();
    const res = await request(app).post('/api/admin/audit').send({});
    expect(res.status).toBe(404);
  });

  it('does not expose PUT', async () => {
    await createAdmin();
    const id = new mongoose.Types.ObjectId().toString();
    const res = await request(app).put(`/api/admin/audit/${id}`).send({});
    expect(res.status).toBe(404);
  });

  it('does not expose PATCH', async () => {
    await createAdmin();
    const id = new mongoose.Types.ObjectId().toString();
    const res = await request(app).patch(`/api/admin/audit/${id}`).send({});
    expect(res.status).toBe(404);
  });

  it('does not expose DELETE', async () => {
    await createAdmin();
    const id = new mongoose.Types.ObjectId().toString();
    const res = await request(app).delete(`/api/admin/audit/${id}`);
    expect(res.status).toBe(404);
  });
});

describe('audit log integration', () => {
  it('writes an AUDIT_VIEW row when admin lists audit logs', async () => {
    const admin = await createAdmin();
    const res = await request(app).get('/api/admin/audit');
    expect(res.status).toBe(200);

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const rows = await AdminAuditLog.find({ actorId: admin._id, action: 'AUDIT_VIEW' }).lean();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].targetType).toBe('audit');
  });
});
