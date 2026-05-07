jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
  AdminAuditActions: {
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
  return {
    User: m.models.User || m.model('User', userSchema),
    AdminAuditLog: m.models.AdminAuditLog || m.model('AdminAuditLog', auditSchema),
  };
});

// Replace the bcrypt-backed comparePassword with a simple deep-equal check.
jest.mock('~/models', () => {
  const { User } = require('~/db/models');
  return {
    findUser: async (filter, fieldsToSelect) => {
      const q = User.findOne(filter);
      if (fieldsToSelect) q.select(fieldsToSelect);
      return q.lean();
    },
    comparePassword: async (user, candidate) => user.password === candidate,
  };
});

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
let User, AdminAuditLog;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  ({ User, AdminAuditLog } = require('~/db/models'));

  app = express();
  app.use(express.json());
  const adminRouter = require('.');
  app.use('/api/admin', adminRouter);
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

async function createUser({ role = SystemRoles.USER, password = 'CorrectHorse1!' } = {}) {
  const u = await User.create({
    email: `${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Test',
    role,
    provider: 'local',
    password,
    emailVerified: true,
  });
  return { user: u, password };
}

describe('POST /api/admin/reauth', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/admin/reauth').send({ password: 'x' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    const { user, password } = await createUser({ role: SystemRoles.USER });
    setUser({ _id: user._id, id: user._id.toString(), email: user.email, role: user.role });
    const res = await request(app).post('/api/admin/reauth').send({ password });
    expect(res.status).toBe(403);
  });

  it('returns 403 when user is banned', async () => {
    const { user, password } = await createUser({ role: SystemRoles.ADMIN });
    setUser({ _id: user._id, id: user._id.toString(), email: user.email, role: user.role });
    setBanned(true);
    const res = await request(app).post('/api/admin/reauth').send({ password });
    expect(res.status).toBe(403);
  });

  it('returns 401 with audit row on wrong password', async () => {
    const { user } = await createUser({ role: SystemRoles.ADMIN });
    setUser({ _id: user._id, id: user._id.toString(), email: user.email, role: user.role });

    const res = await request(app).post('/api/admin/reauth').send({ password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const rows = await AdminAuditLog.find({ actorId: user._id }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('failure');
    expect(rows[0].action).toBe('REAUTH');
    expect(rows[0].targetType).toBe('system');
  });

  it('returns 200 + token with audit row on correct password', async () => {
    const { user, password } = await createUser({ role: SystemRoles.ADMIN });
    setUser({ _id: user._id, id: user._id.toString(), email: user.email, role: user.role });

    const res = await request(app).post('/api/admin/reauth').send({ password });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.includes('.')).toBe(true);
    expect(typeof res.body.expiresAt).toBe('number');
    expect(res.body.expiresAt).toBeGreaterThan(Date.now());

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const rows = await AdminAuditLog.find({ actorId: user._id }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('success');
    expect(rows[0].actorEmail).toBe(user.email);
  });

  it('rate limits after 5 attempts', async () => {
    const { user, password } = await createUser({ role: SystemRoles.ADMIN });
    setUser({ _id: user._id, id: user._id.toString(), email: user.email, role: user.role });

    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/admin/reauth').send({ password: 'wrong' });
      expect([401, 429]).toContain(r.status);
    }
    const res = await request(app).post('/api/admin/reauth').send({ password });
    expect(res.status).toBe(429);
  });
});
