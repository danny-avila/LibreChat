jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
  AdminAuditActions: {
    CONVERSATION_VIEW: 'CONVERSATION_VIEW',
    MESSAGES_VIEW_LIST: 'MESSAGES_VIEW_LIST',
    MESSAGES_VIEW_CONTENT: 'MESSAGES_VIEW_CONTENT',
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
  const convoSchema = new m.Schema(
    {
      conversationId: { type: String, required: true, unique: true, index: true },
      title: { type: String, default: 'New Chat' },
      user: { type: String, index: true },
    },
    { timestamps: true },
  );
  const messageSchema = new m.Schema(
    {
      messageId: { type: String, required: true, unique: true, index: true },
      conversationId: { type: String, required: true, index: true },
      user: { type: String, required: true, index: true, default: null },
      model: String,
      endpoint: String,
      sender: String,
      text: String,
      tokenCount: Number,
      isCreatedByUser: { type: Boolean, default: false },
      parentMessageId: String,
      content: m.Schema.Types.Mixed,
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
    Conversation: m.models.Conversation || m.model('Conversation', convoSchema),
    Message: m.models.Message || m.model('Message', messageSchema),
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
let User, Conversation, Message, AdminAuditLog;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  ({ User, Conversation, Message, AdminAuditLog } = require('~/db/models'));

  app = express();
  app.use(express.json());
  const messagesRouter = require('./messages');
  app.use('/api/admin/messages', messagesRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Conversation.deleteMany({});
  await Message.deleteMany({});
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
  // Allow several microtask turns and a tick for the post-finish writer.
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setImmediate(r));
  }
  await new Promise((r) => setTimeout(r, 20));
}

async function seedConvo(user, conversationId = `convo-${Math.random().toString(36).slice(2)}`) {
  await Conversation.create({
    conversationId,
    title: 'Hello',
    user: user._id.toString(),
  });
  return conversationId;
}

async function seedMessage(user, conversationId, opts = {}) {
  const id = opts.messageId || `msg-${Math.random().toString(36).slice(2)}`;
  return Message.create({
    messageId: id,
    conversationId,
    user: user._id.toString(),
    sender: opts.sender || 'gpt',
    text: opts.text ?? 'hello world',
    isCreatedByUser: !!opts.isCreatedByUser,
  });
}

describe('GET /api/admin/messages/users/:userId/conversations', () => {
  it('returns 401 unauthenticated', async () => {
    const res = await request(app).get(
      `/api/admin/messages/users/${new mongoose.Types.ObjectId()}/conversations`,
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 non-admin', async () => {
    const u = await createUser();
    setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
    const res = await request(app).get(`/api/admin/messages/users/${u._id}/conversations`);
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid userId', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/messages/users/notanid/conversations');
    expect(res.status).toBe(400);
  });

  it('paginates and only returns conversations for the given user', async () => {
    await createAdmin();
    const u1 = await createUser();
    const u2 = await createUser();

    const c1 = await seedConvo(u1);
    const c2 = await seedConvo(u1);
    await seedConvo(u2);

    await seedMessage(u1, c1);
    await seedMessage(u1, c1);
    await seedMessage(u1, c2);

    const res = await request(app).get(
      `/api/admin/messages/users/${u1._id}/conversations?page=1&limit=10`,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.length).toBe(2);
    for (const item of res.body.items) {
      expect(item.conversationId).toBeDefined();
      expect(typeof item.messageCount).toBe('number');
      expect(item.text).toBeUndefined();
    }
    const c1Item = res.body.items.find((x) => x.conversationId === c1);
    expect(c1Item.messageCount).toBe(2);
  });
});

describe('GET /api/admin/messages/users/:userId/conversations/:conversationId', () => {
  it('returns 404 for cross-user mismatch', async () => {
    await createAdmin();
    const u1 = await createUser();
    const u2 = await createUser();
    const c = await seedConvo(u1);
    await seedMessage(u1, c);

    const res = await request(app).get(`/api/admin/messages/users/${u2._id}/conversations/${c}`);
    expect(res.status).toBe(404);
  });

  it('returns conversation metadata and counts (no message bodies)', async () => {
    await createAdmin();
    const u = await createUser();
    const c = await seedConvo(u);
    await seedMessage(u, c, { text: 'hi' });
    await seedMessage(u, c, { text: 'world' });

    const res = await request(app).get(`/api/admin/messages/users/${u._id}/conversations/${c}`);
    expect(res.status).toBe(200);
    expect(res.body.conversationId).toBe(c);
    expect(res.body.messageCount).toBe(2);
    expect(res.body.text).toBeUndefined();
  });
});

describe('GET /api/admin/messages/users/:userId/conversations/:conversationId/messages', () => {
  it('without includeContent: returns no text and writes MESSAGES_VIEW_LIST audit row', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const c = await seedConvo(u);
    await seedMessage(u, c, { text: 'secret-1' });
    await seedMessage(u, c, { text: 'secret-2' });

    const res = await request(app).get(
      `/api/admin/messages/users/${u._id}/conversations/${c}/messages`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
    for (const item of res.body.items) {
      expect(item.text).toBeUndefined();
      expect(item.content).toBeUndefined();
    }

    await flushAudit();
    const rows = await AdminAuditLog.find({ actorId: admin._id }).lean();
    const listRows = rows.filter((r) => r.action === 'MESSAGES_VIEW_LIST');
    expect(listRows.length).toBe(1);
    expect(listRows[0].meta?.includeContent).toBe(false);
    expect(listRows[0].meta?.messageCount).toBe(2);
    expect(listRows[0].meta?.conversationId).toBe(c);
  });

  it('with includeContent=true: returns text and writes MESSAGES_VIEW_CONTENT row (single)', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const c = await seedConvo(u);
    await seedMessage(u, c, { text: 'secret-1' });
    await seedMessage(u, c, { text: 'secret-2' });

    const res = await request(app).get(
      `/api/admin/messages/users/${u._id}/conversations/${c}/messages?includeContent=true`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
    expect(res.body.items[0].text).toBeDefined();

    await flushAudit();
    const rows = await AdminAuditLog.find({ actorId: admin._id }).lean();
    const contentRows = rows.filter((r) => r.action === 'MESSAGES_VIEW_CONTENT');
    expect(contentRows.length).toBe(1);
    expect(contentRows[0].meta?.includeContent).toBe(true);
    expect(contentRows[0].meta?.messageCount).toBe(2);
  });

  it('caps limit at 200', async () => {
    await createAdmin();
    const u = await createUser();
    const c = await seedConvo(u);
    // Seed only a couple but verify response.limit is clamped.
    await seedMessage(u, c);
    const res = await request(app).get(
      `/api/admin/messages/users/${u._id}/conversations/${c}/messages?limit=10000`,
    );
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
  });

  it('cross-user mismatch returns 404', async () => {
    await createAdmin();
    const u1 = await createUser();
    const u2 = await createUser();
    const c = await seedConvo(u1);
    await seedMessage(u1, c);

    const res = await request(app).get(
      `/api/admin/messages/users/${u2._id}/conversations/${c}/messages`,
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/messages/messages/:messageId', () => {
  it('returns 401 unauthenticated', async () => {
    const res = await request(app).get('/api/admin/messages/messages/some-id');
    expect(res.status).toBe(401);
  });

  it('returns 403 non-admin', async () => {
    const u = await createUser();
    setUser({ _id: u._id, id: u._id.toString(), email: u.email, role: u.role });
    const res = await request(app).get('/api/admin/messages/messages/some-id');
    expect(res.status).toBe(403);
  });

  it('returns the message and writes MESSAGES_VIEW_CONTENT audit row', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const c = await seedConvo(u);
    const msg = await seedMessage(u, c, { text: 'top-secret' });

    const res = await request(app).get(`/api/admin/messages/messages/${msg.messageId}`);
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('top-secret');

    await flushAudit();
    const rows = await AdminAuditLog.find({ actorId: admin._id }).lean();
    const contentRows = rows.filter((r) => r.action === 'MESSAGES_VIEW_CONTENT');
    expect(contentRows.length).toBe(1);
    expect(contentRows[0].targetId).toBe(msg.messageId);
    expect(contentRows[0].meta?.messageId).toBe(msg.messageId);
    expect(contentRows[0].meta?.conversationId).toBe(c);
  });

  it('returns 404 for missing messageId', async () => {
    await createAdmin();
    const res = await request(app).get('/api/admin/messages/messages/no-such-msg');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid messageId format', async () => {
    await createAdmin();
    const res = await request(app).get(
      '/api/admin/messages/messages/' + encodeURIComponent('bad id with spaces'),
    );
    expect(res.status).toBe(400);
  });
});
