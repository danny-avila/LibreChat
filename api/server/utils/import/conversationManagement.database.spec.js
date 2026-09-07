const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels, tenantStorage } = require('@librechat/data-schemas');
const { Constants, EModelEndpoint } = require('librechat-data-provider');

jest.mock('~/server/services/Config', () => ({
  getEndpointsConfig: jest.fn().mockResolvedValue({
    openAI: { userProvide: false },
  }),
}));

jest.mock('~/server/controllers/ModelController', () => ({
  getModelsConfig: jest.fn().mockResolvedValue({
    openAI: ['gpt-4o'],
  }),
}));

createModels(mongoose);
const db = require('~/models');
const importConversations = require('./importConversations');

describe('importConversations database compatibility', () => {
  let mongoServer;
  let tempDir;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'librechat-import-database-'));
    await mongoose.connection.dropDatabase();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('persists a tagged branched conversation only for the authenticated owner and tenant', async () => {
    const filepath = path.join(tempDir, 'conversation.json');
    const owner = 'authenticated-user';
    const tenantId = 'tenant-a';
    const sourceConversationId = 'source-conversation';
    const rootMessageId = 'source-root';
    await fs.writeFile(
      filepath,
      JSON.stringify({
        conversationId: sourceConversationId,
        endpoint: EModelEndpoint.openAI,
        title: 'Imported branches',
        recursive: false,
        options: {
          _id: '65f1ad8c90523874d2d409e0',
          __v: 91,
          conversationId: sourceConversationId,
          user: 'source-user',
          tenantId: 'source-tenant',
          endpoint: EModelEndpoint.openAI,
          model: 'gpt-4o',
          tags: ['release-notes'],
        },
        messages: [
          {
            _id: '65f1ad8c90523874d2d409f1',
            __v: 91,
            user: 'source-user',
            tenantId: 'source-tenant',
            messageId: rootMessageId,
            conversationId: sourceConversationId,
            parentMessageId: Constants.NO_PARENT,
            sender: 'User',
            text: 'Compare both answers',
            isCreatedByUser: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            _id: '65f1ad8c90523874d2d409f2',
            __v: 91,
            user: 'source-user',
            tenantId: 'source-tenant',
            messageId: 'source-answer-a',
            conversationId: sourceConversationId,
            parentMessageId: rootMessageId,
            sender: 'Assistant',
            text: 'First branch',
            isCreatedByUser: false,
            createdAt: '2026-01-01T00:00:01.000Z',
          },
          {
            _id: '65f1ad8c90523874d2d409f3',
            __v: 91,
            user: 'source-user',
            tenantId: 'source-tenant',
            messageId: 'source-answer-b',
            conversationId: sourceConversationId,
            parentMessageId: rootMessageId,
            sender: 'Assistant',
            text: 'Second branch',
            isCreatedByUser: false,
            createdAt: '2026-01-01T00:00:02.000Z',
          },
        ],
      }),
      'utf8',
    );

    await tenantStorage.run({ tenantId, userId: owner }, async () => {
      await importConversations({
        filepath,
        requestUserId: owner,
        userRole: 'USER',
        format: 'librechat',
        allowTags: true,
      });
    });

    await expect(fs.stat(filepath)).rejects.toMatchObject({ code: 'ENOENT' });

    const conversations = await tenantStorage.run({ tenantId, userId: owner }, async () =>
      db.listConversationResources(owner, tenantId, { limit: 10 }),
    );
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      title: 'Imported branches',
      tags: ['release-notes'],
    });
    expect(conversations[0].conversationId).not.toBe(sourceConversationId);

    const messages = await tenantStorage.run({ tenantId, userId: owner }, async () =>
      db.listConversationMessageResources(owner, tenantId, conversations[0].conversationId, {
        limit: 10,
      }),
    );
    expect(messages).toHaveLength(3);
    expect(messages.map((message) => message.text)).toEqual([
      'Compare both answers',
      'First branch',
      'Second branch',
    ]);
    expect(messages[1].parentMessageId).toBe(messages[0].messageId);
    expect(messages[2].parentMessageId).toBe(messages[0].messageId);

    const persistedConversation = await tenantStorage.run({ tenantId, userId: owner }, async () =>
      mongoose.models.Conversation.findOne({
        user: owner,
        conversationId: conversations[0].conversationId,
      }).lean(),
    );
    expect(persistedConversation).toMatchObject({ user: owner, tenantId });
    expect(persistedConversation._id.toString()).not.toBe('65f1ad8c90523874d2d409e0');
    expect(persistedConversation.__v).not.toBe(91);

    const persistedMessages = await tenantStorage.run({ tenantId, userId: owner }, async () =>
      mongoose.models.Message.find({
        user: owner,
        conversationId: conversations[0].conversationId,
      })
        .sort({ createdAt: 1 })
        .lean(),
    );
    expect(persistedMessages).toHaveLength(3);
    expect(persistedMessages.every((message) => message.user === owner)).toBe(true);
    expect(persistedMessages.every((message) => message.tenantId === tenantId)).toBe(true);
    expect(persistedMessages.every((message) => message.__v !== 91)).toBe(true);
    const sourceStorageIds = new Set([
      '65f1ad8c90523874d2d409f1',
      '65f1ad8c90523874d2d409f2',
      '65f1ad8c90523874d2d409f3',
    ]);
    const sourceMessageIds = new Set(['source-root', 'source-answer-a', 'source-answer-b']);
    expect(
      persistedMessages.every((message) => !sourceStorageIds.has(message._id.toString())),
    ).toBe(true);
    expect(persistedMessages.every((message) => !sourceMessageIds.has(message.messageId))).toBe(
      true,
    );

    await expect(
      tenantStorage.run({ tenantId: 'tenant-b', userId: owner }, async () =>
        db.listConversationResources(owner, 'tenant-b', { limit: 10 }),
      ),
    ).resolves.toEqual([]);
    await expect(
      tenantStorage.run({ tenantId, userId: 'other-user' }, async () =>
        db.listConversationResources('other-user', tenantId, { limit: 10 }),
      ),
    ).resolves.toEqual([]);
    await expect(
      tenantStorage.run({ tenantId: 'source-tenant', userId: 'source-user' }, async () =>
        db.listConversationResources('source-user', 'source-tenant', { limit: 10 }),
      ),
    ).resolves.toEqual([]);
  });

  it.each([
    ['legacy browser mode', undefined],
    ['strict LibreChat API mode', 'librechat'],
  ])('round-trips an unmodified browser export through %s', async (_mode, format) => {
    const filepath = path.join(tempDir, 'browser-export.json');
    const fixture = path.join(__dirname, '__data__', 'librechat-export.json');
    const owner = 'browser-import-user';
    const tenantId = 'browser-tenant';
    await fs.copyFile(fixture, filepath);

    await tenantStorage.run({ tenantId, userId: owner }, async () => {
      await importConversations({
        filepath,
        requestUserId: owner,
        userRole: 'USER',
        ...(format == null ? {} : { format }),
      });
    });

    await expect(fs.stat(filepath)).rejects.toMatchObject({ code: 'ENOENT' });
    const conversations = await tenantStorage.run({ tenantId, userId: owner }, async () =>
      db.listConversationResources(owner, tenantId, { limit: 10 }),
    );
    expect(conversations).toHaveLength(1);
    expect(conversations[0].title).toBe('Conversation 1. Web Search');

    const messages = await tenantStorage.run({ tenantId, userId: owner }, async () =>
      db.listConversationMessageResources(owner, tenantId, conversations[0].conversationId, {
        limit: 20,
      }),
    );
    expect(messages).toHaveLength(6);
  });
});
