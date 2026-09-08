import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { EModelEndpoint, ContentTypes } from 'librechat-data-provider';
import { createMethods, createModels, tenantStorage } from '@librechat/data-schemas';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { IConversation, IMessage } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { createConversationManagementHandlers } from './management';

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  };
});

const TENANT_A = 'tenant-aaaaaaaaaaaaaaaaaaaa';
const TENANT_B = 'tenant-bbbbbbbbbbbbbbbbbbbb';
const OWNER = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const SHARED_ID = 'shared-conversation-id';

let mongoServer: MongoMemoryServer;
let Conversation: mongoose.Model<IConversation>;
let Message: mongoose.Model<IMessage>;
let methods: ReturnType<typeof createMethods>;

function expressHandler(
  handler: (req: ServerRequest, res: Response) => Promise<Response>,
): RequestHandler {
  return async (req, res) => {
    await handler(req as ServerRequest, res);
  };
}

function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ tenantId }, fn);
}

function createApp(
  overrides: {
    canRecoverAgentConversationDeletion?: Parameters<
      typeof createConversationManagementHandlers
    >[0]['canRecoverAgentConversationDeletion'];
    getConversationResourceDeletionState?: typeof methods.getConversationResourceDeletionState;
    saveConvo?: typeof methods.saveConvo;
    initializeAssistantClient?: Parameters<
      typeof createConversationManagementHandlers
    >[0]['initializeAssistantClient'];
    deleteConversations?: Parameters<
      typeof createConversationManagementHandlers
    >[0]['deleteConversations'];
  } = {},
): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const userId = req.header('x-test-user') ?? OWNER;
    const tenantId = req.header('x-test-tenant') ?? TENANT_A;
    tenantStorage.run({ tenantId }, () => {
      (req as ServerRequest).user = { id: userId, tenantId } as ServerRequest['user'];
      next();
    });
  });
  const handlers = createConversationManagementHandlers({
    initializeAssistantClient:
      overrides.initializeAssistantClient ??
      (async () => {
        throw new Error('Provider client is not exercised');
      }),
    canRecoverAgentConversationDeletion:
      overrides.canRecoverAgentConversationDeletion ?? (async () => false),
    getConversationResource: methods.getConversationResource,
    getConversationProviderThreadIds: methods.getConversationProviderThreadIds,
    listConversationResources: methods.listConversationResources,
    listConversationMessageResources: methods.listConversationMessageResources,
    saveConvo: overrides.saveConvo ?? methods.saveConvo,
    updateTagsForConversation: methods.updateTagsForConversation,
    reconcileConversationTagCounts: methods.reconcileConversationTagCounts,
    getConversationResourceDeletionState:
      overrides.getConversationResourceDeletionState ??
      methods.getConversationResourceDeletionState,
    deleteConversations:
      overrides.deleteConversations ??
      (async () => {
        throw new Error('Delete service is outside this handler persistence suite');
      }),
  });
  app.get('/', expressHandler(handlers.list));
  app.get('/:id/messages', expressHandler(handlers.messages));
  app.get('/:id', expressHandler(handlers.get));
  app.patch('/:id', expressHandler(handlers.update));
  app.delete('/:id', expressHandler(handlers.remove));
  return app;
}

async function seedConversation(
  tenantId: string,
  values: Partial<IConversation> & Pick<IConversation, 'conversationId' | 'user'>,
): Promise<void> {
  await asTenant(tenantId, async () => {
    await Conversation.create({
      title: values.conversationId,
      endpoint: EModelEndpoint.openAI,
      isTemporary: false,
      ...values,
    });
  });
}

async function seedMessage(
  tenantId: string,
  values: Partial<IMessage> & Pick<IMessage, 'messageId' | 'conversationId' | 'user'>,
): Promise<void> {
  await asTenant(tenantId, async () => {
    await Message.create({ sender: 'assistant', text: values.messageId, ...values });
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  Conversation = mongoose.models.Conversation as mongoose.Model<IConversation>;
  Message = mongoose.models.Message as mongoose.Model<IMessage>;
  methods = createMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    mongoose.models.ConversationTag.deleteMany({}),
  ]);
});

describe('conversation management handlers with Mongo persistence', () => {
  it.each([
    { initialArchived: false, patch: {} },
    { initialArchived: false, patch: { isArchived: true } },
    { initialArchived: true, patch: { isArchived: true } },
    { initialArchived: true, patch: { isArchived: false } },
  ])(
    'does not write or misclassify expired metadata targets: %j',
    async ({ initialArchived, patch }) => {
      await seedConversation(TENANT_A, {
        conversationId: SHARED_ID,
        user: OWNER,
        expiredAt: new Date(Date.now() + 60000),
        title: 'Before',
        isArchived: initialArchived,
        tags: ['old'],
      });
      const reconcile = jest.spyOn(methods, 'reconcileConversationTagCounts');
      const app = createApp({
        saveConvo: async (...args) => {
          await Conversation.updateOne(
            { user: OWNER, conversationId: SHARED_ID },
            { $set: { expiredAt: new Date(0) } },
          );
          return methods.saveConvo(...args);
        },
      });
      try {
        const response = await request(app)
          .patch(`/${SHARED_ID}`)
          .send({ title: 'After', tags: ['new'], ...patch });
        expect(response.status).toBe(404);
        expect(reconcile).not.toHaveBeenCalled();
        expect(
          await Conversation.findOne({
            user: OWNER,
            tenantId: TENANT_A,
            conversationId: SHARED_ID,
          }).lean(),
        ).toMatchObject({ title: 'Before', tags: ['old'], isArchived: initialArchived });
      } finally {
        reconcile.mockRestore();
      }
    },
  );

  it('returns the committed snapshot when retention expires after a successful write', async () => {
    await seedConversation(TENANT_A, { conversationId: SHARED_ID, user: OWNER });
    const app = createApp({
      saveConvo: async (...args) => {
        const saved = await methods.saveConvo(...args);
        await Conversation.updateOne(
          { user: OWNER, conversationId: SHARED_ID },
          { $set: { expiredAt: new Date(0) } },
        );
        return saved;
      },
    });
    const response = await request(app).patch(`/${SHARED_ID}`).send({ title: 'Committed' });
    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Committed');
  });

  it.each([EModelEndpoint.assistants, EModelEndpoint.azureAssistants])(
    'deletes stored %s threads before local cleanup using stored provider selection',
    async (endpoint) => {
      await seedConversation(TENANT_A, {
        user: OWNER,
        conversationId: SHARED_ID,
        endpoint,
        model: 'stored-model',
      });
      await seedMessage(TENANT_A, {
        user: OWNER,
        conversationId: SHARED_ID,
        messageId: 'provider-message',
        thread_id: 'owned-thread',
      });
      await Promise.all([
        seedMessage(TENANT_A, {
          user: OWNER,
          conversationId: SHARED_ID,
          messageId: 'second-message',
          thread_id: 'second-thread',
        }),
        seedMessage(TENANT_A, {
          user: OWNER,
          conversationId: SHARED_ID,
          messageId: 'duplicate-message',
          thread_id: 'owned-thread',
        }),
        seedMessage(TENANT_A, {
          user: OWNER,
          conversationId: SHARED_ID,
          messageId: 'imported-message',
          thread_id: 'imported-thread',
          isUserSubmitted: true,
        }),
        seedMessage(TENANT_A, {
          user: FOREIGN,
          conversationId: SHARED_ID,
          messageId: 'foreign-owner-message',
          thread_id: 'foreign-thread',
        }),
        seedMessage(TENANT_B, {
          user: OWNER,
          conversationId: SHARED_ID,
          messageId: 'foreign-tenant-message',
          thread_id: 'foreign-tenant-thread',
        }),
      ]);
      const remoteDelete = jest.fn().mockResolvedValue({ deleted: true });
      const initializeAssistantClient = jest
        .fn()
        .mockResolvedValue({ openai: { beta: { threads: { delete: remoteDelete } } } });
      const deleteConversations = jest.fn().mockResolvedValue({ deletedCount: 1 });
      const response = await request(createApp({ initializeAssistantClient, deleteConversations }))
        .delete(`/${SHARED_ID}?model=other-model`)
        .send({ thread_id: 'foreign-thread', model: 'other-model', endpoint: 'other' });
      expect(response.status).toBe(200);
      expect(initializeAssistantClient).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint,
          version: 'v2',
          req: expect.objectContaining({
            body: { model: 'stored-model' },
            query: {},
            user: expect.objectContaining({ id: OWNER, tenantId: TENANT_A }),
          }),
        }),
      );
      expect(remoteDelete.mock.calls.map(([id]) => id).sort()).toEqual([
        'owned-thread',
        'second-thread',
      ]);
      expect(remoteDelete.mock.invocationCallOrder[0]).toBeLessThan(
        deleteConversations.mock.invocationCallOrder[0],
      );
    },
  );

  it('keeps the local root when provider deletion fails and retries through provider 404', async () => {
    await seedConversation(TENANT_A, {
      user: OWNER,
      conversationId: SHARED_ID,
      endpoint: EModelEndpoint.assistants,
    });
    await seedMessage(TENANT_A, {
      user: OWNER,
      conversationId: SHARED_ID,
      messageId: 'provider-message',
      thread_id: 'owned-thread',
    });
    const remoteDelete = jest
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 404 });
    const initializeAssistantClient = jest
      .fn()
      .mockResolvedValue({ openai: { beta: { threads: { delete: remoteDelete } } } });
    const deleteConversations = jest.fn().mockResolvedValue({ deletedCount: 1 });
    const app = createApp({ initializeAssistantClient, deleteConversations });
    expect((await request(app).delete(`/${SHARED_ID}`)).status).toBe(500);
    expect(deleteConversations).not.toHaveBeenCalled();
    expect(
      await Conversation.exists({ user: OWNER, tenantId: TENANT_A, conversationId: SHARED_ID }),
    ).not.toBeNull();
    expect((await request(app).delete(`/${SHARED_ID}`)).status).toBe(200);
    expect(deleteConversations).toHaveBeenCalledTimes(1);
  });

  it('retries local failure after provider deletion through an already-deleted thread', async () => {
    await seedConversation(TENANT_A, {
      user: OWNER,
      conversationId: SHARED_ID,
      endpoint: EModelEndpoint.assistants,
    });
    await seedMessage(TENANT_A, {
      user: OWNER,
      conversationId: SHARED_ID,
      messageId: 'provider-message',
      thread_id: 'owned-thread',
    });
    const remoteDelete = jest
      .fn()
      .mockResolvedValueOnce({ deleted: true })
      .mockRejectedValueOnce({ status: 404 });
    const initializeAssistantClient = jest
      .fn()
      .mockResolvedValue({ openai: { beta: { threads: { delete: remoteDelete } } } });
    const deleteConversations = jest
      .fn()
      .mockRejectedValueOnce(new Error('local unavailable'))
      .mockResolvedValueOnce({ deletedCount: 1 });
    const app = createApp({ initializeAssistantClient, deleteConversations });
    expect((await request(app).delete(`/${SHARED_ID}`)).status).toBe(500);
    expect((await request(app).delete(`/${SHARED_ID}`)).status).toBe(200);
    expect(remoteDelete).toHaveBeenCalledTimes(2);
  });

  it.each(['foreign-owner', 'foreign-tenant', 'hidden', 'ordinary', 'without-thread'])(
    'does not initialize a provider for %s resources',
    async (scenario) => {
      await seedConversation(scenario === 'foreign-tenant' ? TENANT_B : TENANT_A, {
        user: scenario === 'foreign-owner' ? FOREIGN : OWNER,
        conversationId: SHARED_ID,
        endpoint: scenario === 'ordinary' ? EModelEndpoint.openAI : EModelEndpoint.assistants,
        isTemporary: scenario === 'hidden',
      });
      if (scenario !== 'without-thread') {
        await seedMessage(scenario === 'foreign-tenant' ? TENANT_B : TENANT_A, {
          user: scenario === 'foreign-owner' ? FOREIGN : OWNER,
          conversationId: SHARED_ID,
          messageId: 'provider-message',
          thread_id: 'thread',
        });
      }
      const initializeAssistantClient = jest.fn();
      const deleteConversations = jest.fn().mockResolvedValue({ deletedCount: 1 });
      const response = await request(
        createApp({ initializeAssistantClient, deleteConversations }),
      ).delete(`/${SHARED_ID}`);
      expect(response.status).toBe(['ordinary', 'without-thread'].includes(scenario) ? 200 : 404);
      expect(initializeAssistantClient).not.toHaveBeenCalled();
    },
  );

  it('lists ordinary and saved-agent resources while excluding internal and retention-hidden records', async () => {
    const now = new Date('2026-09-06T10:00:00.000Z');
    await Promise.all([
      seedConversation(TENANT_A, {
        conversationId: 'ordinary',
        user: OWNER,
        tags: ['blue'],
        createdAt: now,
        updatedAt: now,
      }),
      seedConversation(TENANT_A, {
        conversationId: 'saved-agent',
        user: OWNER,
        agent_id: 'agent-a',
        tags: ['blue'],
        createdAt: now,
        updatedAt: now,
      }),
      seedConversation(TENANT_A, {
        conversationId: 'archived',
        user: OWNER,
        agent_id: 'agent-a',
        tags: ['blue'],
        isArchived: true,
        createdAt: now,
        updatedAt: now,
      }),
      seedConversation(TENANT_A, {
        conversationId: 'internal',
        user: OWNER,
        createdAt: now,
        updatedAt: now,
        subagentThread: {
          rootConversationId: 'ordinary',
          parentConversationId: 'ordinary',
          parentMessageId: 'root',
          parentToolCallId: 'tool',
          subagentType: 'agent',
          subagentKind: 'agent',
          depth: 1,
        },
      }),
      seedConversation(TENANT_A, {
        conversationId: 'temporary',
        user: OWNER,
        isTemporary: true,
        createdAt: now,
        updatedAt: now,
      }),
      seedConversation(TENANT_A, {
        conversationId: 'expired',
        user: OWNER,
        expiredAt: new Date('2020-01-01T00:00:00.000Z'),
        createdAt: now,
        updatedAt: now,
      }),
    ]);
    const app = createApp();

    const all = await request(app).get('/').query({ agent_id: 'agent-a', tags: 'blue' });
    const active = await request(app)
      .get('/')
      .query({ agent_id: 'agent-a', tags: 'blue', isArchived: 'false' });
    const archived = await request(app)
      .get('/')
      .query({ agent_id: 'agent-a', tags: 'blue', isArchived: 'true' });

    expect(all.status).toBe(200);
    expect(all.body.data.map((row: { id: string }) => row.id).sort()).toEqual([
      'archived',
      'saved-agent',
    ]);
    expect(active.status).toBe(200);
    expect(active.body.data.map((row: { id: string }) => row.id)).toEqual(['saved-agent']);
    expect(archived.status).toBe(200);
    expect(archived.body.data.map((row: { id: string }) => row.id)).toEqual(['archived']);
  });

  it('returns sanitized uploaded and generated references from persisted messages', async () => {
    await seedConversation(TENANT_A, { user: OWNER, conversationId: SHARED_ID });
    await seedMessage(TENANT_A, {
      user: OWNER,
      conversationId: SHARED_ID,
      messageId: 'with-files',
      quotes: ['Referenced excerpt'],
      manualSkills: ['selected-skill'],
      alwaysAppliedSkills: ['automatic-skill'],
      files: [
        {
          file_id: 'upload',
          filename: 'notes.txt',
          user: 'private',
          tenantId: 'private',
          storageKey: 'private',
        },
      ],
      attachments: [
        {
          file_id: 'artifact',
          filepath: '/files/artifact',
          toolCallId: 'tool',
          metadata: { credentials: 'private' },
        },
      ],
    });
    const response = await request(createApp()).get(`/${SHARED_ID}/messages`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: 'with-files',
        quotes: ['Referenced excerpt'],
        manualSkills: ['selected-skill'],
        alwaysAppliedSkills: ['automatic-skill'],
        files: [{ file_id: 'upload', filename: 'notes.txt' }],
        attachments: [
          { file_id: 'artifact', filepath: '/files/artifact', toolCallId: 'tool', metadata: {} },
        ],
      }),
    ]);
  });

  it('returns persisted search citations and public detached-tool receipts', async () => {
    await seedConversation(TENANT_A, { user: OWNER, conversationId: SHARED_ID });
    const settledAt = new Date('2026-01-01T00:00:00Z');
    await seedMessage(TENANT_A, {
      user: OWNER,
      conversationId: SHARED_ID,
      messageId: 'artifacts',
      attachments: [
        {
          type: 'web_search',
          web_search: {
            organic: [{ link: 'https://example.com', title: 'Source', highlights: ['private'] }],
            knowledgeGraph: { private: true },
          },
        },
      ],
      content: [
        {
          type: 'tool_call',
          tool_call: {
            backgroundTask: {
              version: 1,
              taskId: 'task',
              toolName: 'tool',
              status: 'completed',
              settledAt,
              resultClaim: { claimId: 'private' },
              completionWakeup: true,
            },
          },
        },
      ],
    });
    const response = await request(createApp()).get(`/${SHARED_ID}/messages`);
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      attachments: [
        {
          type: 'web_search',
          web_search: { organic: [{ link: 'https://example.com', title: 'Source' }] },
        },
      ],
      content: [
        {
          type: 'tool_call',
          tool_call: {
            backgroundTask: {
              version: 1,
              taskId: 'task',
              toolName: 'tool',
              status: 'completed',
              settledAt: settledAt.toISOString(),
            },
          },
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain('private');
    expect(JSON.stringify(response.body)).not.toContain('completionWakeup');
  });

  it('returns same 404 for foreign and cross-tenant identifiers and strips persistence metadata', async () => {
    await Promise.all([
      seedConversation(TENANT_A, { conversationId: SHARED_ID, user: OWNER, title: 'tenant a' }),
      seedConversation(TENANT_B, { conversationId: SHARED_ID, user: OWNER, title: 'tenant b' }),
      seedConversation(TENANT_A, { conversationId: 'foreign-id', user: FOREIGN }),
    ]);
    const app = createApp();

    const own = await request(app).get(`/${SHARED_ID}`);
    const crossTenant = await request(app).get(`/${SHARED_ID}`).set('x-test-tenant', TENANT_B);
    const foreign = await request(app).get('/foreign-id');

    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ id: SHARED_ID, title: 'tenant a' });
    expect(own.body).not.toHaveProperty('_id');
    expect(own.body).not.toHaveProperty('user');
    expect(own.body).not.toHaveProperty('tenantId');
    expect(crossTenant.status).toBe(200);
    expect(crossTenant.body.title).toBe('tenant b');
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({
      error: { code: 'not_found', message: 'Conversation not found' },
    });
  });

  it('paginates equal timestamps and rejects malformed or filter-mismatched cursors as 400', async () => {
    const stamp = new Date('2026-09-06T11:00:00.000Z');
    await Promise.all(
      ['one', 'two', 'three'].map((conversationId) =>
        seedConversation(TENANT_A, {
          conversationId,
          user: OWNER,
          tags: ['blue'],
          createdAt: stamp,
          updatedAt: stamp,
        }),
      ),
    );
    const app = createApp();

    const first = await request(app).get('/').query({ limit: 2, tags: 'blue' });
    const second = await request(app)
      .get('/')
      .query({ limit: 2, tags: 'blue', cursor: first.body.after });
    const malformed = await request(app).get('/').query({ cursor: 'not-a-cursor' });
    const mismatched = await request(app).get('/').query({ tags: 'red', cursor: first.body.after });

    expect(first.status).toBe(200);
    expect(first.body.has_more).toBe(true);
    expect(second.status).toBe(200);
    expect(
      new Set([...first.body.data, ...second.body.data].map((row: { id: string }) => row.id)).size,
    ).toBe(3);
    expect(malformed.status).toBe(400);
    expect(mismatched.status).toBe(400);
  });

  it('projects representative message content and rejects foreign message access without exposing private fields', async () => {
    await Promise.all([
      seedConversation(TENANT_A, { conversationId: 'messages', user: OWNER }),
      seedConversation(TENANT_A, { conversationId: 'foreign-messages', user: FOREIGN }),
      seedMessage(TENANT_A, {
        messageId: 'message-one',
        conversationId: 'messages',
        user: OWNER,
        content: [{ type: ContentTypes.TEXT, text: 'visible', secret: 'must-not-leak' }],
      }),
      seedMessage(TENANT_A, {
        messageId: 'foreign-message',
        conversationId: 'foreign-messages',
        user: FOREIGN,
      }),
    ]);
    const app = createApp();

    const visible = await request(app).get('/messages/messages');
    const foreign = await request(app).get('/foreign-messages/messages');

    expect(visible.status).toBe(200);
    expect(visible.body.data[0]).toMatchObject({ id: 'message-one', conversationId: 'messages' });
    expect(visible.body.data[0].content).toEqual([{ type: ContentTypes.TEXT, text: 'visible' }]);
    expect(JSON.stringify(visible.body)).not.toContain('must-not-leak');
    expect(JSON.stringify(visible.body)).not.toContain('tenantId');
    expect(foreign.status).toBe(404);
  });

  it('updates title, tags, and archive state through shared services and maps invalid bodies to 400', async () => {
    await seedConversation(TENANT_A, { conversationId: 'patchable', user: OWNER, title: 'before' });
    const app = createApp();

    const updated = await request(app)
      .patch('/patchable')
      .send({ title: '  after  ', tags: ['red', 'red'], isArchived: true });
    const persisted = await asTenant(TENANT_A, () =>
      Conversation.findOne({ user: OWNER, conversationId: 'patchable' }).lean(),
    );
    const tag = await asTenant(TENANT_A, () =>
      mongoose.models.ConversationTag.findOne({ user: OWNER, tag: 'red' }).lean(),
    );
    const invalid = await request(app)
      .patch('/patchable')
      .send({ title: 'nope', tenantId: TENANT_B });
    const foreign = await request(app)
      .patch('/patchable')
      .set('x-test-user', FOREIGN)
      .send({ title: 'forged' });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ title: 'after', tags: ['red'], isArchived: true });
    expect(persisted).toMatchObject({ title: 'after', tags: ['red'], isArchived: true });
    expect(tag).toMatchObject({ count: 1, tenantId: TENANT_A });
    expect(invalid.status).toBe(400);
    expect(foreign.status).toBe(404);
  });

  it('reads committed tag counts after reconciliation fails and the same PATCH is retried', async () => {
    await seedConversation(TENANT_A, { conversationId: 'recover-tags', user: OWNER });
    const app = createApp();
    const write = jest
      .spyOn(mongoose.models.ConversationTag, 'bulkWrite')
      .mockRejectedValueOnce(new Error('transient catalog outage'));
    const first = await request(app)
      .patch('/recover-tags')
      .send({ tags: ['red'] });
    write.mockRestore();
    const retried = await request(app)
      .patch('/recover-tags')
      .send({ tags: ['red'] });
    expect(first.status).toBe(200);
    expect(retried.status).toBe(200);
    const tags = await asTenant(TENANT_A, () => methods.getConversationTags(OWNER));
    expect(tags).toEqual([expect.objectContaining({ tag: 'red', count: 1, tenantId: TENANT_A })]);
  });

  it('returns 500 without tag side effects when saveConvo reports its error sentinel', async () => {
    await seedConversation(TENANT_A, { conversationId: 'failed-patch', user: OWNER });
    const saveConvo = jest.fn().mockResolvedValue({ message: 'Error saving conversation' });
    const app = createApp({ saveConvo });

    const response = await request(app)
      .patch('/failed-patch')
      .send({ tags: ['red'] });
    const tag = await asTenant(TENANT_A, () =>
      mongoose.models.ConversationTag.findOne({ user: OWNER, tag: 'red' }).lean(),
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'internal_error', message: 'Internal server error' },
    });
    expect(tag).toBeNull();
  });

  it('permits an owner-scoped dependent-cleanup retry while unknown identifiers remain 404', async () => {
    const deleteConversations = jest.fn().mockResolvedValue({
      acknowledged: true,
      deletedCount: 0,
      messages: { acknowledged: true, deletedCount: 0 },
      conversationIds: [],
    });
    const getConversationResourceDeletionState = jest.fn(
      async (_owner: string, _tenantId: string | undefined, conversationId: string) =>
        conversationId === 'recoverable' ? ('recoverable' as const) : ('missing' as const),
    );
    const app = createApp({ deleteConversations, getConversationResourceDeletionState });

    const recovered = await request(app).delete('/recoverable');
    const unknown = await request(app).delete('/unknown');

    expect(recovered.status).toBe(200);
    expect(recovered.body).toEqual({ id: 'recoverable', deleted: true });
    expect(deleteConversations).toHaveBeenCalledWith(
      OWNER,
      { conversationId: 'recoverable', tenantId: TENANT_A },
      TENANT_A,
      undefined,
      { allowMissingRoot: true },
    );
    expect(unknown.status).toBe(404);
    expect(deleteConversations).toHaveBeenCalledTimes(1);
  });

  it.each([
    { isTemporary: true },
    { expiredAt: new Date('2020-01-01T00:00:00.000Z') },
    {
      subagentThread: {
        rootConversationId: 'root',
        parentConversationId: 'root',
        parentMessageId: 'message',
        parentToolCallId: 'tool',
        subagentType: 'agent',
        subagentKind: 'agent' as const,
        depth: 1,
      },
    },
  ])('does not use generation recovery for an existing excluded root: %j', async (hidden) => {
    await seedConversation(TENANT_A, {
      conversationId: 'excluded',
      user: OWNER,
      ...hidden,
    });
    const deleteConversations = jest.fn();
    const canRecoverAgentConversationDeletion = jest.fn().mockResolvedValue(true);
    const app = createApp({ deleteConversations, canRecoverAgentConversationDeletion });

    const response = await request(app).delete('/excluded');

    expect(response.status).toBe(404);
    expect(canRecoverAgentConversationDeletion).not.toHaveBeenCalled();
    expect(deleteConversations).not.toHaveBeenCalled();
    expect(
      await asTenant(TENANT_A, () => Conversation.exists({ conversationId: 'excluded' })),
    ).not.toBeNull();
  });

  it('permits a generation-only retry after database resources are already gone', async () => {
    const deleteConversations = jest.fn().mockResolvedValue({
      acknowledged: true,
      deletedCount: 0,
      messages: { acknowledged: true, deletedCount: 0 },
      conversationIds: [],
    });
    const canRecoverAgentConversationDeletion = jest.fn(
      async (_owner: string, conversationId: string) => conversationId === 'active-generation',
    );
    const app = createApp({ deleteConversations, canRecoverAgentConversationDeletion });

    const recovered = await request(app).delete('/active-generation');

    expect(recovered.status).toBe(200);
    expect(canRecoverAgentConversationDeletion).toHaveBeenCalledWith(
      OWNER,
      'active-generation',
      TENANT_A,
      undefined,
    );
    expect(deleteConversations).toHaveBeenCalledTimes(1);
  });
});
