process.env.TENANT_ISOLATION_STRICT = 'true';

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { EModelEndpoint } = require('librechat-data-provider');
const { tenantStorage, createModels, runAsSystem } = require('@librechat/data-schemas');

const TENANT_A = 'tenant-convos-a';
const TENANT_B = 'tenant-convos-b';
const USER_A = 'user-tenant-a';
const USER_B = 'user-tenant-b';

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

async function seedConversation(tenantId, userId, title) {
  const conversationId = uuidv4();
  await tenantStorage.run({ tenantId }, async () => {
    await Conversation.create({
      conversationId,
      user: userId,
      title,
      endpoint: EModelEndpoint.openAI,
    });
  });
  return { conversationId, title };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  Object.assign(mongoose.models, models);
  Conversation = mongoose.models.Conversation;

  app = express();
  app.use(express.json());
  app.use('/api/convos', require('./convos'));
});

beforeEach(async () => {
  await runAsSystem(async () => {
    await Conversation.deleteMany({});
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  delete process.env.TENANT_ISOLATION_STRICT;
});

describe('GET /api/convos tenant isolation', () => {
  it('returns only conversations belonging to the caller tenant', async () => {
    const convoA = await seedConversation(TENANT_A, USER_A, 'Tenant A Chat');
    const convoB = await seedConversation(TENANT_B, USER_B, 'Tenant B Chat');

    mockCurrentUser = { id: USER_A, tenantId: TENANT_A };

    const res = await request(app).get('/api/convos');

    expect(res.status).toBe(200);
    expect(res.body.conversations).toHaveLength(1);
    expect(res.body.conversations[0].conversationId).toBe(convoA.conversationId);
    expect(res.body.conversations[0].title).toBe('Tenant A Chat');
    expect(res.body.conversations.some((c) => c.conversationId === convoB.conversationId)).toBe(
      false,
    );
  });

  it('returns 404 when requesting a conversation from another tenant', async () => {
    const convoB = await seedConversation(TENANT_B, USER_B, 'Tenant B Only');

    mockCurrentUser = { id: USER_A, tenantId: TENANT_A };

    const res = await request(app).get(`/api/convos/${convoB.conversationId}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/convos user isolation', () => {
  it('returns only conversations belonging to the caller user within the same tenant', async () => {
    const ownConvo = await seedConversation(TENANT_A, USER_A, 'My Chat');
    await seedConversation(TENANT_A, USER_B, 'Other User Chat');

    mockCurrentUser = { id: USER_A, tenantId: TENANT_A };

    const res = await request(app).get('/api/convos');

    expect(res.status).toBe(200);
    expect(res.body.conversations).toHaveLength(1);
    expect(res.body.conversations[0].conversationId).toBe(ownConvo.conversationId);
    expect(res.body.conversations[0].title).toBe('My Chat');
  });

  it('returns 404 when requesting another user conversation in the same tenant', async () => {
    const otherConvo = await seedConversation(TENANT_A, USER_B, 'Other User Only');

    mockCurrentUser = { id: USER_A, tenantId: TENANT_A };

    const res = await request(app).get(`/api/convos/${otherConvo.conversationId}`);

    expect(res.status).toBe(404);
  });
});
