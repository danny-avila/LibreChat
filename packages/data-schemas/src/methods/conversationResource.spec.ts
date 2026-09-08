import mongoose from 'mongoose';
import { EModelEndpoint } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IConversation, IMessage } from '~/types';
import { createConversationResourceMethods } from './conversationResource';
import { runAsSystem, tenantStorage } from '~/config/tenantContext';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const TENANT_A = 'tenant-aaaaaaaaaaaaaaaaaaaa';
const TENANT_B = 'tenant-bbbbbbbbbbbbbbbbbbbb';
const OWNER = 'resource-owner';
const OTHER_OWNER = 'other-owner';
const SAME_CONVERSATION_ID = 'conversation-shared-across-tenants';
const SAME_MESSAGE_ID = 'message-shared-across-tenants';

let mongoServer: MongoMemoryServer;
let Conversation: mongoose.Model<IConversation>;
let Message: mongoose.Model<IMessage>;
let methods: ReturnType<typeof createConversationResourceMethods>;

function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ tenantId }, fn);
}

function asLegacy<T>(fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({}, fn);
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
    await Message.create({ text: values.messageId, sender: 'user', ...values });
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  Conversation = mongoose.models.Conversation as mongoose.Model<IConversation>;
  Message = mongoose.models.Message as mongoose.Model<IMessage>;
  methods = createConversationResourceMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    mongoose.models.ToolCall.deleteMany({}),
    mongoose.models.SharedLink.deleteMany({}),
  ]);
});

describe('conversation resource methods', () => {
  it.each(['assistants', 'azureAssistants'])(
    'loads imported history only for a visible owned %s conversation',
    async (endpoint) => {
      await seedConversation(TENANT_A, {
        conversationId: SAME_CONVERSATION_ID,
        user: OWNER,
        endpoint,
      });
      await seedConversation(TENANT_B, {
        conversationId: SAME_CONVERSATION_ID,
        user: OWNER,
        endpoint,
      });
      await seedMessage(TENANT_A, {
        conversationId: SAME_CONVERSATION_ID,
        messageId: 'imported',
        user: OWNER,
        isUserSubmitted: true,
        text: 'Owned history',
      });
      await seedMessage(TENANT_B, {
        conversationId: SAME_CONVERSATION_ID,
        messageId: 'foreign',
        user: OWNER,
        isUserSubmitted: true,
        text: 'Other tenant',
      });
      const history = await methods.getImportedAssistantMessages(
        OWNER,
        TENANT_A,
        SAME_CONVERSATION_ID,
        endpoint,
      );
      expect(history).toHaveLength(1);
      expect(history?.[0]).toMatchObject({
        messageId: 'imported',
        isUserSubmitted: true,
        text: 'Owned history',
      });
      expect(
        await methods.getImportedAssistantMessages(
          OTHER_OWNER,
          TENANT_A,
          SAME_CONVERSATION_ID,
          endpoint,
        ),
      ).toBeNull();
      expect(
        await methods.getImportedAssistantMessages(OWNER, TENANT_A, SAME_CONVERSATION_ID, 'openAI'),
      ).toBeNull();
      await asTenant(TENANT_A, async () => {
        await Conversation.updateOne(
          { user: OWNER, conversationId: SAME_CONVERSATION_ID },
          { $set: { isTemporary: true } },
        );
      });
      expect(
        await methods.getImportedAssistantMessages(OWNER, TENANT_A, SAME_CONVERSATION_ID, endpoint),
      ).toBeNull();
    },
  );

  it('scopes identical conversation and message ids to the active tenant and owner', async () => {
    await seedConversation(TENANT_A, { conversationId: SAME_CONVERSATION_ID, user: OWNER });
    await seedConversation(TENANT_B, {
      conversationId: SAME_CONVERSATION_ID,
      user: OWNER,
      title: 'other tenant',
    });
    await seedConversation(TENANT_A, {
      conversationId: 'foreign-owner-conversation',
      user: OTHER_OWNER,
    });
    await seedMessage(TENANT_A, {
      messageId: SAME_MESSAGE_ID,
      conversationId: SAME_CONVERSATION_ID,
      user: OWNER,
      text: 'tenant a message',
    });
    await seedMessage(TENANT_B, {
      messageId: SAME_MESSAGE_ID,
      conversationId: SAME_CONVERSATION_ID,
      user: OWNER,
      text: 'tenant b message',
    });

    const aConversation = await asTenant(TENANT_A, () =>
      methods.getConversationResource(OWNER, TENANT_A, SAME_CONVERSATION_ID),
    );
    const bConversation = await asTenant(TENANT_B, () =>
      methods.getConversationResource(OWNER, TENANT_B, SAME_CONVERSATION_ID),
    );
    const foreignOwner = await asTenant(TENANT_A, () =>
      methods.getConversationResource(OWNER, TENANT_A, 'foreign-owner-conversation'),
    );
    const aMessages = await asTenant(TENANT_A, () =>
      methods.listConversationMessageResources(OWNER, TENANT_A, SAME_CONVERSATION_ID, {
        limit: 20,
      }),
    );
    const bMessages = await asTenant(TENANT_B, () =>
      methods.listConversationMessageResources(OWNER, TENANT_B, SAME_CONVERSATION_ID, {
        limit: 20,
      }),
    );

    expect(aConversation?.title).toBe(SAME_CONVERSATION_ID);
    expect(bConversation?.title).toBe('other tenant');
    expect(foreignOwner).toBeNull();
    expect(aMessages).toHaveLength(1);
    expect(aMessages?.[0]?.text).toBe('tenant a message');
    expect(bMessages).toHaveLength(1);
    expect(bMessages?.[0]?.text).toBe('tenant b message');
  });

  it('uses explicit tenant parameters even when no tenant filter is ambient', async () => {
    const conversationId = 'tenant-parameter-scope';
    await seedConversation(TENANT_A, { conversationId, user: OWNER, title: 'tenant conversation' });
    await asLegacy(async () => {
      await Conversation.create({
        conversationId,
        user: OWNER,
        title: 'legacy conversation',
        endpoint: EModelEndpoint.openAI,
      });
      await Message.create({
        messageId: SAME_MESSAGE_ID,
        conversationId,
        user: OWNER,
        sender: 'user',
        text: 'legacy message',
      });
    });
    await seedMessage(TENANT_A, {
      messageId: SAME_MESSAGE_ID,
      conversationId,
      user: OWNER,
      text: 'tenant message',
    });

    const tenantConversation = await runAsSystem(() =>
      methods.getConversationResource(OWNER, TENANT_A, conversationId),
    );
    const legacyConversation = await runAsSystem(() =>
      methods.getConversationResource(OWNER, undefined, conversationId),
    );
    const tenantMessages = await runAsSystem(() =>
      methods.listConversationMessageResources(OWNER, TENANT_A, conversationId, { limit: 20 }),
    );
    const legacyMessages = await runAsSystem(() =>
      methods.listConversationMessageResources(OWNER, undefined, conversationId, { limit: 20 }),
    );

    expect(tenantConversation?.title).toBe('tenant conversation');
    expect(legacyConversation?.title).toBe('legacy conversation');
    expect(tenantMessages?.map(({ text }) => text)).toEqual(['tenant message']);
    expect(legacyMessages?.map(({ text }) => text)).toEqual(['legacy message']);
  });

  it('lists only ordinary and saved-agent conversations that remain browser-visible', async () => {
    const now = new Date('2026-09-06T01:00:00.000Z');
    await seedConversation(TENANT_A, {
      conversationId: 'ordinary',
      user: OWNER,
      updatedAt: now,
      createdAt: now,
    });
    await seedConversation(TENANT_A, {
      conversationId: 'saved-agent',
      user: OWNER,
      agent_id: 'agent-current',
      updatedAt: now,
      createdAt: now,
    });
    await seedConversation(TENANT_A, {
      conversationId: 'internal-subagent',
      user: OWNER,
      updatedAt: now,
      createdAt: now,
      subagentThread: {
        rootConversationId: 'ordinary',
        parentConversationId: 'ordinary',
        parentMessageId: 'root',
        parentToolCallId: 'call',
        subagentType: 'agent',
        subagentKind: 'agent',
        depth: 1,
      },
    });
    await seedConversation(TENANT_A, {
      conversationId: 'temporary',
      user: OWNER,
      updatedAt: now,
      createdAt: now,
      isTemporary: true,
    });
    await seedConversation(TENANT_A, {
      conversationId: 'expired',
      user: OWNER,
      updatedAt: now,
      createdAt: now,
      expiredAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const page = await asTenant(TENANT_A, () =>
      methods.listConversationResources(OWNER, TENANT_A, { limit: 20 }),
    );

    expect(page.map(({ conversationId }) => conversationId).sort()).toEqual([
      'ordinary',
      'saved-agent',
    ]);
    await expect(
      asTenant(TENANT_A, () =>
        methods.getConversationResource(OWNER, TENANT_A, 'internal-subagent'),
      ),
    ).resolves.toBeNull();
    await expect(
      asTenant(TENANT_A, () => methods.getConversationResource(OWNER, TENANT_A, 'temporary')),
    ).resolves.toBeNull();
    await expect(
      asTenant(TENANT_A, () => methods.getConversationResource(OWNER, TENANT_A, 'expired')),
    ).resolves.toBeNull();
  });

  it('filters the current agent, tags, and archive state together', async () => {
    const now = new Date('2026-09-06T02:00:00.000Z');
    await Promise.all([
      seedConversation(TENANT_A, {
        conversationId: 'matching',
        user: OWNER,
        agent_id: 'agent-a',
        tags: ['blue', 'red'],
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
        conversationId: 'wrong-agent',
        user: OWNER,
        agent_id: 'agent-b',
        tags: ['blue'],
        createdAt: now,
        updatedAt: now,
      }),
      seedConversation(TENANT_A, {
        conversationId: 'wrong-tag',
        user: OWNER,
        agent_id: 'agent-a',
        tags: ['green'],
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const active = await asTenant(TENANT_A, () =>
      methods.listConversationResources(OWNER, TENANT_A, {
        limit: 20,
        agent_id: 'agent-a',
        tags: ['blue'],
        isArchived: false,
      }),
    );
    const archived = await asTenant(TENANT_A, () =>
      methods.listConversationResources(OWNER, TENANT_A, {
        limit: 20,
        agent_id: 'agent-a',
        tags: ['blue'],
        isArchived: true,
      }),
    );

    expect(active.map(({ conversationId }) => conversationId)).toEqual(['matching']);
    expect(archived.map(({ conversationId }) => conversationId)).toEqual(['archived']);
  });

  it('returns newest conversations first and paginates equal timestamps without foreign or hidden rows', async () => {
    const older = new Date('2026-09-06T03:00:00.000Z');
    const stamp = new Date('2026-09-06T03:01:00.000Z');
    const newer = new Date('2026-09-06T03:02:00.000Z');
    await Promise.all(
      ['one', 'two', 'three', 'four'].map((conversationId) =>
        seedConversation(TENANT_A, {
          conversationId,
          user: OWNER,
          createdAt: stamp,
          updatedAt: stamp,
        }),
      ),
    );
    await seedConversation(TENANT_A, {
      conversationId: 'newest',
      user: OWNER,
      createdAt: newer,
      updatedAt: newer,
    });
    await seedConversation(TENANT_A, {
      conversationId: 'oldest',
      user: OWNER,
      createdAt: older,
      updatedAt: older,
    });
    await seedConversation(TENANT_B, {
      conversationId: 'foreign-tenant',
      user: OWNER,
      createdAt: newer,
      updatedAt: newer,
    });
    await seedConversation(TENANT_A, {
      conversationId: 'hidden-subagent',
      user: OWNER,
      createdAt: newer,
      updatedAt: newer,
      subagentThread: {
        rootConversationId: 'one',
        parentConversationId: 'one',
        parentMessageId: 'root',
        parentToolCallId: 'call',
        subagentType: 'agent',
        subagentKind: 'agent',
        depth: 1,
      },
    });

    const first = await asTenant(TENANT_A, () =>
      methods.listConversationResources(OWNER, TENANT_A, { limit: 2 }),
    );
    const firstPage = first.slice(0, 2);
    const boundary = firstPage[1]!;
    const second = await asTenant(TENANT_A, () =>
      methods.listConversationResources(OWNER, TENANT_A, {
        limit: 2,
        boundary: { date: boundary.updatedAt!.toISOString(), id: boundary._id.toString() },
      }),
    );
    const ids = [...firstPage, ...second.slice(0, 2)].map(({ conversationId }) => conversationId);
    const equalTimestampRows = await runAsSystem(() =>
      Conversation.find({
        user: OWNER,
        tenantId: TENANT_A,
        conversationId: { $in: ['one', 'two', 'three', 'four'] },
      })
        .sort({ _id: -1 })
        .lean(),
    );

    expect(first).toHaveLength(3);
    expect(firstPage.map(({ conversationId }) => conversationId)).toEqual([
      'newest',
      equalTimestampRows[0]!.conversationId,
    ]);
    expect(second.slice(0, 2).map(({ conversationId }) => conversationId)).toEqual(
      equalTimestampRows.slice(1, 3).map(({ conversationId }) => conversationId),
    );
    expect(new Set(ids).size).toBe(4);
    expect(ids).not.toContain('foreign-tenant');
    expect(ids).not.toContain('hidden-subagent');
  });

  it('returns oldest messages first, preserves multibranch parent ids, and hides inaccessible roots', async () => {
    const conversationId = 'message-tree';
    const stamp = new Date('2026-09-06T04:00:00.000Z');
    const oldest = new Date('2026-09-06T03:59:00.000Z');
    const newest = new Date('2026-09-06T04:01:00.000Z');
    await seedConversation(TENANT_A, {
      conversationId,
      user: OWNER,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await seedConversation(TENANT_A, { conversationId: 'other-root', user: OTHER_OWNER });
    await seedConversation(TENANT_A, {
      conversationId: 'hidden-subagent-root',
      user: OWNER,
      subagentThread: {
        rootConversationId: conversationId,
        parentConversationId: conversationId,
        parentMessageId: 'root',
        parentToolCallId: 'call',
        subagentType: 'agent',
        subagentKind: 'agent',
        depth: 1,
      },
    });
    await seedConversation(TENANT_A, {
      conversationId: 'hidden-temporary-root',
      user: OWNER,
      isTemporary: true,
    });
    await seedConversation(TENANT_A, {
      conversationId: 'hidden-expired-root',
      user: OWNER,
      expiredAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    await Promise.all([
      seedMessage(TENANT_A, {
        messageId: 'oldest',
        conversationId,
        user: OWNER,
        createdAt: oldest,
        parentMessageId: '00000000-0000-0000-0000-000000000000',
      }),
      seedMessage(TENANT_A, {
        messageId: 'root',
        conversationId,
        user: OWNER,
        createdAt: stamp,
        parentMessageId: 'oldest',
      }),
      seedMessage(TENANT_A, {
        messageId: 'branch-a',
        conversationId,
        user: OWNER,
        createdAt: stamp,
        parentMessageId: 'root',
      }),
      seedMessage(TENANT_A, {
        messageId: 'branch-b',
        conversationId,
        user: OWNER,
        createdAt: stamp,
        parentMessageId: 'root',
      }),
      seedMessage(TENANT_A, {
        messageId: 'newest',
        conversationId,
        user: OWNER,
        createdAt: newest,
        parentMessageId: 'branch-a',
      }),
      seedMessage(TENANT_A, {
        messageId: 'foreign-message',
        conversationId: 'other-root',
        user: OTHER_OWNER,
        createdAt: stamp,
      }),
      seedMessage(TENANT_A, {
        messageId: 'subagent-message',
        conversationId: 'hidden-subagent-root',
        user: OWNER,
      }),
      seedMessage(TENANT_A, {
        messageId: 'temporary-message',
        conversationId: 'hidden-temporary-root',
        user: OWNER,
      }),
      seedMessage(TENANT_A, {
        messageId: 'expired-message',
        conversationId: 'hidden-expired-root',
        user: OWNER,
      }),
    ]);

    const all = await asTenant(TENANT_A, () =>
      methods.listConversationMessageResources(OWNER, TENANT_A, conversationId, { limit: 20 }),
    );
    const first = await asTenant(TENANT_A, () =>
      methods.listConversationMessageResources(OWNER, TENANT_A, conversationId, { limit: 2 }),
    );
    const boundary = first![1]!;
    const next = await asTenant(TENANT_A, () =>
      methods.listConversationMessageResources(OWNER, TENANT_A, conversationId, {
        limit: 2,
        boundary: { date: boundary.createdAt!.toISOString(), id: boundary._id.toString() },
      }),
    );
    const foreign = await asTenant(TENANT_A, () =>
      methods.listConversationMessageResources(OWNER, TENANT_A, 'other-root', { limit: 20 }),
    );
    const hiddenRoots = await Promise.all(
      ['hidden-subagent-root', 'hidden-temporary-root', 'hidden-expired-root'].map(
        (hiddenConversationId) =>
          asTenant(TENANT_A, () =>
            methods.listConversationMessageResources(OWNER, TENANT_A, hiddenConversationId, {
              limit: 20,
            }),
          ),
      ),
    );
    const expectedOrder = await runAsSystem(() =>
      Message.find({ user: OWNER, tenantId: TENANT_A, conversationId })
        .sort({ createdAt: 1, _id: 1 })
        .lean(),
    );

    expect(all).not.toBeNull();
    expect(all?.map(({ messageId }) => messageId)).toEqual(
      expectedOrder.map(({ messageId }) => messageId),
    );
    expect(all?.find(({ messageId }) => messageId === 'branch-a')?.parentMessageId).toBe('root');
    expect(all?.find(({ messageId }) => messageId === 'branch-b')?.parentMessageId).toBe('root');
    expect(first).toHaveLength(3);
    expect(
      new Set(
        [...(first ?? []).slice(0, 2), ...(next ?? []).slice(0, 2)].map(
          ({ messageId }) => messageId,
        ),
      ).size,
    ).toBe(4);
    expect(foreign).toBeNull();
    expect(hiddenRoots).toEqual([null, null, null]);
  });

  it('authorizes retry only for dependent deletion remnants in the exact owner and tenant scope', async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const conversationId = 'dependent-cleanup-retry';
    await asTenant(TENANT_A, async () => {
      await mongoose.models.ToolCall.create({
        user: owner,
        conversationId,
        messageId: 'message-a',
        toolId: 'tool-a',
      });
    });
    await asTenant(TENANT_B, async () => {
      await mongoose.models.SharedLink.create({
        user: owner,
        conversationId,
        shareId: 'foreign-tenant-share',
      });
    });

    await expect(
      runAsSystem(() =>
        methods.getConversationResourceDeletionState(owner, TENANT_A, conversationId),
      ),
    ).resolves.toBe('recoverable');
    await expect(
      runAsSystem(() =>
        methods.getConversationResourceDeletionState(owner, TENANT_B, conversationId),
      ),
    ).resolves.toBe('recoverable');
    await expect(
      runAsSystem(() =>
        methods.getConversationResourceDeletionState(
          new mongoose.Types.ObjectId().toString(),
          TENANT_A,
          conversationId,
        ),
      ),
    ).resolves.toBe('missing');
    await expect(
      runAsSystem(() =>
        methods.getConversationResourceDeletionState(owner, undefined, conversationId),
      ),
    ).resolves.toBe('missing');
  });
});

describe('required conversation-list index', () => {
  it('provisions once, retries failures, and serves indexed pages with autoIndex disabled', async () => {
    const isolated = new mongoose.Mongoose();
    await isolated.connect(mongoServer.getUri('resource-index'), { autoIndex: false });
    createModels(isolated);
    const Convo = isolated.models.Conversation;
    const local = createConversationResourceMethods(isolated);
    await Convo.collection.insertMany(
      Array.from({ length: 1005 }, (_, index) => ({
        tenantId: TENANT_A,
        user: index < 5 ? OWNER : OTHER_OWNER,
        conversationId: `indexed-${index}`,
        updatedAt: new Date(1700000000000 + index),
      })),
    );
    const build = jest.spyOn(Convo.collection, 'createIndex');
    const find = jest.spyOn(Convo, 'find');
    try {
      build.mockRejectedValueOnce(new Error('DDL unavailable'));
      await expect(local.listConversationResources(OWNER, TENANT_A, { limit: 2 })).rejects.toThrow(
        'DDL unavailable',
      );
      expect(find).not.toHaveBeenCalled();
      const pages = await Promise.all([
        local.listConversationResources(OWNER, TENANT_A, { limit: 2 }),
        local.listConversationResources(OWNER, TENANT_A, { limit: 2 }),
      ]);
      expect(pages[0]).toHaveLength(3);
      const calls = find.mock.calls as unknown as [mongoose.FilterQuery<IConversation>][];
      const explain = (await Convo.find(calls[0][0])
        .sort({ updatedAt: -1, _id: -1 })
        .limit(3)
        .explain('executionStats')) as unknown as {
        executionStats: { totalDocsExamined: number };
        queryPlanner: { winningPlan: unknown };
      };
      expect(explain.executionStats.totalDocsExamined).toBeLessThan(10);
      expect(JSON.stringify(explain.queryPlanner.winningPlan)).toContain(
        'tenantId_1_user_1_updatedAt_-1__id_-1',
      );
      expect(JSON.stringify(explain.queryPlanner.winningPlan)).not.toContain('"stage":"SORT"');
      await local.listConversationResources(OWNER, TENANT_A, { limit: 2 });
      expect(build).toHaveBeenCalledTimes(2);
    } finally {
      build.mockRestore();
      find.mockRestore();
      await isolated.connection.dropDatabase();
      await isolated.disconnect();
    }
  });
});
