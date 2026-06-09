process.env.TENANT_ISOLATION_STRICT = 'true';
process.env.ALLOW_SHARED_LINKS = 'true';
process.env.ALLOW_SHARED_LINKS_PUBLIC = 'false';

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { EModelEndpoint } = require('librechat-data-provider');
const { tenantStorage, createModels, runAsSystem } = require('@librechat/data-schemas');

const TENANT_A = 'tenant-share-a';
const TENANT_B = 'tenant-share-b';
const USER_A = 'user-share-a';
const USER_B = 'user-share-b';

let mockCurrentUser;

jest.mock('~/server/middleware/requireJwtAuth', () => {
  const { tenantStorage } = require('@librechat/data-schemas');
  return (req, res, next) => {
    if (!mockCurrentUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = mockCurrentUser;
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    return tenantStorage.run({ tenantId }, () => next());
  };
});

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createMethods } = require('@librechat/data-schemas');
  return createMethods(mongoose, {});
});

let app;
let mongoServer;
let Conversation;
let Message;
let db;

async function seedSharedConversation(tenantId, userId) {
  const conversationId = uuidv4();
  const messageId = uuidv4();

  await tenantStorage.run({ tenantId }, async () => {
    await Conversation.create({
      conversationId,
      user: userId,
      title: `Shared ${tenantId}`,
      endpoint: EModelEndpoint.openAI,
    });
    await Message.create({
      messageId,
      conversationId,
      user: userId,
      isCreatedByUser: true,
      text: 'Hello from tenant',
    });
  });

  let shareId;
  await tenantStorage.run({ tenantId }, async () => {
    const created = await db.createSharedLink(userId, conversationId);
    shareId = created.shareId;
  });

  return { conversationId, shareId };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  Object.assign(mongoose.models, models);
  Conversation = mongoose.models.Conversation;
  Message = mongoose.models.Message;
  db = require('~/models');

  app = express();
  app.use(express.json());
  app.use('/api/share', require('./share'));
});

beforeEach(async () => {
  await runAsSystem(async () => {
    await Message.deleteMany({});
    await Conversation.deleteMany({});
    if (mongoose.models.SharedLink) {
      await mongoose.models.SharedLink.deleteMany({});
    }
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  delete process.env.TENANT_ISOLATION_STRICT;
  delete process.env.ALLOW_SHARED_LINKS;
  delete process.env.ALLOW_SHARED_LINKS_PUBLIC;
});

describe('GET /api/share/:shareId tenant isolation', () => {
  it('allows access when the authenticated user belongs to the share tenant', async () => {
    const { shareId } = await seedSharedConversation(TENANT_A, USER_A);

    mockCurrentUser = { id: USER_A, tenantId: TENANT_A };

    const res = await request(app).get(`/api/share/${shareId}`);

    expect(res.status).toBe(200);
    expect(res.body.shareId).toBe(shareId);
    expect(res.body.messages).toHaveLength(1);
  });

  it('returns 403 when a cross-tenant user accesses a shared conversation link', async () => {
    const { shareId } = await seedSharedConversation(TENANT_A, USER_A);

    mockCurrentUser = { id: USER_B, tenantId: TENANT_B };

    const res = await request(app).get(`/api/share/${shareId}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Forbidden');
  });
});
