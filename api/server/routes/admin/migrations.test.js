const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { EModelEndpoint } = require('librechat-data-provider');
const { tenantStorage, createModels, runAsSystem } = require('@librechat/data-schemas');

const PLATFORM_ADMIN_ID = new mongoose.Types.ObjectId().toString();

let mockCurrentUser;

jest.mock('~/server/middleware/requireJwtAuth', () => {
  return (req, res, next) => {
    if (!mockCurrentUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = mockCurrentUser;
    return next();
  };
});

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: () => (_req, _res, next) => next(),
  superAdminContextMiddleware: (_req, _res, next) => next(),
  requirePlatformAdmin: () => (_req, _res, next) => next(),
}));

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createMethods } = require('@librechat/data-schemas');
  return createMethods(mongoose, {});
});

let app;
let mongoServer;
let User;
let Conversation;

async function createUser(email, tenantId) {
  return runAsSystem(() =>
    User.create({
      name: email.split('@')[0],
      email,
      provider: 'local',
      role: 'USER',
      tenantId,
    }),
  );
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  Object.assign(mongoose.models, models);
  User = mongoose.models.User;
  Conversation = mongoose.models.Conversation;

  app = express();
  app.use(express.json());
  app.use('/api/admin/migrations', require('./migrations'));
});

beforeEach(async () => {
  await runAsSystem(async () => {
    await User.deleteMany({});
    await Conversation.deleteMany({});
  });
  mockCurrentUser = {
    _id: PLATFORM_ADMIN_ID,
    id: PLATFORM_ADMIN_ID,
    role: 'ADMIN',
  };
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('POST /api/admin/migrations/preview', () => {
  it('returns per-scope counts for the source user', async () => {
    const source = await createUser('source@example.com', 'tenant-a');
    const target = await createUser('target@example.com', 'tenant-a');

    await runAsSystem(() =>
      Conversation.create({
        conversationId: uuidv4(),
        user: String(source._id),
        tenantId: 'tenant-a',
        endpoint: EModelEndpoint.openAI,
      }),
    );

    const res = await request(app)
      .post('/api/admin/migrations/preview')
      .send({
        sourceUserId: String(source._id),
        targetUserId: String(target._id),
        scopes: ['conversation'],
      });

    expect(res.status).toBe(200);
    expect(res.body.counts.conversation).toBe(1);
    expect(res.body.crossTenant).toBe(false);
  });
});

describe('POST /api/admin/migrations', () => {
  it('migrates conversations and empties the source user', async () => {
    const source = await createUser('move-source@example.com', 'tenant-a');
    const target = await createUser('move-target@example.com', 'tenant-a');
    const convoId = uuidv4();

    await runAsSystem(() =>
      Conversation.create({
        conversationId: convoId,
        user: String(source._id),
        tenantId: 'tenant-a',
        endpoint: EModelEndpoint.openAI,
      }),
    );

    const res = await request(app)
      .post('/api/admin/migrations')
      .send({
        sourceUserId: String(source._id),
        targetUserId: String(target._id),
        scopes: ['conversation'],
      });

    expect(res.status).toBe(200);
    expect(res.body.totalModified).toBe(1);

    const moved = await runAsSystem(() => Conversation.findOne({ conversationId: convoId }).lean());
    expect(moved.user).toBe(String(target._id));

    const sourceRemaining = await runAsSystem(() =>
      Conversation.countDocuments({ user: String(source._id) }),
    );
    expect(sourceRemaining).toBe(0);
  });
});
