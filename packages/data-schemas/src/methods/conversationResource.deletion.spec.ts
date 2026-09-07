import mongoose from 'mongoose';
import { EModelEndpoint } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IConversation, IMessage } from '~/types';
import { createConversationMethods, type ConversationMethods } from './conversation';
import { runAsSystem, tenantStorage } from '~/config/tenantContext';
import { createMessageMethods } from './message';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const TENANT_A = 'tenant-aaaaaaaaaaaaaaaaaaaa';
const TENANT_B = 'tenant-bbbbbbbbbbbbbbbbbbbb';
const OWNER = 'deletion-owner';
const ROOT_ID = 'same-root-id';
const CHILD_ID = 'same-child-id';

type QueueCallback = NonNullable<
  Parameters<typeof createConversationMethods>[1]
>['deleteAgentQueuedTurns'];
type ConversationTagDocument = {
  user: string;
  tag: string;
  count: number;
  position: number;
};

let mongoServer: MongoMemoryServer;
let Conversation: mongoose.Model<IConversation>;
let Message: mongoose.Model<IMessage>;
let ConversationTag: mongoose.Model<ConversationTagDocument>;
let methods: ConversationMethods;
let deleteAgentQueuedTurns: jest.MockedFunction<NonNullable<QueueCallback>>;

function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ tenantId }, fn);
}

function asLegacy<T>(fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({}, fn);
}

async function seedBoundary(tenantId: string | null, label: string): Promise<void> {
  const run = tenantId == null ? asLegacy : asTenant.bind(null, tenantId);
  await run(async () => {
    await Conversation.create([
      {
        conversationId: ROOT_ID,
        user: OWNER,
        title: `${label} root`,
        endpoint: EModelEndpoint.openAI,
        tags: [`${label}-root-tag`],
      },
      {
        conversationId: CHILD_ID,
        user: OWNER,
        title: `${label} child`,
        endpoint: EModelEndpoint.openAI,
        tags: [`${label}-child-tag`],
        subagentThread: {
          rootConversationId: ROOT_ID,
          parentConversationId: ROOT_ID,
          parentMessageId: 'root-message',
          parentToolCallId: 'tool-call',
          subagentType: 'agent',
          subagentKind: 'agent',
          depth: 1,
        },
      },
    ]);
    await Message.create([
      {
        messageId: 'same-root-message',
        conversationId: ROOT_ID,
        user: OWNER,
        sender: 'user',
        text: `${label} root message`,
      },
      {
        messageId: 'same-child-message',
        conversationId: CHILD_ID,
        user: OWNER,
        sender: 'assistant',
        text: `${label} child message`,
      },
    ]);
    await ConversationTag.create([
      { user: OWNER, tag: `${label}-root-tag`, count: 1, position: 0 },
      { user: OWNER, tag: `${label}-child-tag`, count: 1, position: 1 },
    ]);
  });
}

async function countBoundary(
  tenantId: string | null,
): Promise<{ conversations: number; messages: number }> {
  return runAsSystem(async () => {
    const tenantFilter = tenantId == null ? { tenantId: { $exists: false } } : { tenantId };
    const [conversations, messages] = await Promise.all([
      Conversation.countDocuments({ user: OWNER, ...tenantFilter }),
      Message.countDocuments({ user: OWNER, ...tenantFilter }),
    ]);
    return { conversations, messages };
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  Conversation = mongoose.models.Conversation as mongoose.Model<IConversation>;
  Message = mongoose.models.Message as mongoose.Model<IMessage>;
  ConversationTag = mongoose.models.ConversationTag as mongoose.Model<ConversationTagDocument>;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    ConversationTag.deleteMany({}),
  ]);
  deleteAgentQueuedTurns = jest.fn(
    async (
      _user: Parameters<NonNullable<QueueCallback>>[0],
      _conversations: Parameters<NonNullable<QueueCallback>>[1],
    ) => undefined,
  );
  const messageMethods = createMessageMethods(mongoose);
  methods = createConversationMethods(mongoose, {
    getMessages: messageMethods.getMessages,
    deleteMessages: messageMethods.deleteMessages,
    deleteAgentQueuedTurns,
  });
  await Promise.all([
    seedBoundary(TENANT_A, 'a'),
    seedBoundary(TENANT_B, 'b'),
    seedBoundary(null, 'legacy'),
  ]);
});

describe('deleteConvos explicit tenant boundaries', () => {
  it('deletes only tenant A root, child cascade, and messages with queue cleanup scoped to tenant A', async () => {
    const result = await runAsSystem(() =>
      methods.deleteConvos(OWNER, { conversationId: ROOT_ID }, { tenantId: TENANT_A }),
    );

    expect(result.deletedCount).toBe(2);
    expect(result.conversationIds).toEqual([ROOT_ID, CHILD_ID]);
    expect(result.messages.deletedCount).toBe(2);
    await expect(countBoundary(TENANT_A)).resolves.toEqual({ conversations: 0, messages: 0 });
    await expect(countBoundary(TENANT_B)).resolves.toEqual({ conversations: 2, messages: 2 });
    await expect(countBoundary(null)).resolves.toEqual({ conversations: 2, messages: 2 });
    expect(deleteAgentQueuedTurns).toHaveBeenNthCalledWith(1, OWNER, [
      { conversationId: ROOT_ID, tenantId: TENANT_A },
    ]);
    expect(deleteAgentQueuedTurns).toHaveBeenNthCalledWith(2, OWNER, [
      { conversationId: CHILD_ID, tenantId: TENANT_A },
    ]);
  });

  it('treats null as the explicit legacy boundary and preserves tenantful roots, children, and messages', async () => {
    const result = await runAsSystem(() =>
      methods.deleteConvos(OWNER, { conversationId: ROOT_ID }, { tenantId: null }),
    );

    expect(result.deletedCount).toBe(2);
    expect(result.messages.deletedCount).toBe(2);
    await expect(countBoundary(null)).resolves.toEqual({ conversations: 0, messages: 0 });
    await expect(countBoundary(TENANT_A)).resolves.toEqual({ conversations: 2, messages: 2 });
    await expect(countBoundary(TENANT_B)).resolves.toEqual({ conversations: 2, messages: 2 });
    expect(deleteAgentQueuedTurns).toHaveBeenNthCalledWith(1, OWNER, [{ conversationId: ROOT_ID }]);
    expect(deleteAgentQueuedTurns).toHaveBeenNthCalledWith(2, OWNER, [
      { conversationId: CHILD_ID },
    ]);
  });

  it('preserves legacy omitted-boundary behavior by deleting every matching owner root and cascade', async () => {
    const result = await runAsSystem(() =>
      methods.deleteConvos(OWNER, { conversationId: ROOT_ID }),
    );

    expect(result.deletedCount).toBe(6);
    expect(result.messages.deletedCount).toBe(6);
    expect(result.conversationIds).toEqual([
      ROOT_ID,
      ROOT_ID,
      ROOT_ID,
      CHILD_ID,
      CHILD_ID,
      CHILD_ID,
    ]);
    await expect(countBoundary(TENANT_A)).resolves.toEqual({ conversations: 0, messages: 0 });
    await expect(countBoundary(TENANT_B)).resolves.toEqual({ conversations: 0, messages: 0 });
    await expect(countBoundary(null)).resolves.toEqual({ conversations: 0, messages: 0 });
  });

  it('recovers an explicit tenant partial commit without broadening its queue, message, or tag cleanup', async () => {
    await runAsSystem(() =>
      Conversation.deleteOne({ user: OWNER, tenantId: TENANT_A, conversationId: ROOT_ID }),
    );

    const result = await runAsSystem(() =>
      methods.deleteConvos(OWNER, { conversationId: ROOT_ID }, { tenantId: TENANT_A }),
    );
    const tags = await runAsSystem(() =>
      ConversationTag.find({ user: OWNER }).sort({ tag: 1 }).lean(),
    );
    const tagCounts = new Map(tags.map(({ tag, count }) => [tag, count]));

    expect(result.deletedCount).toBe(1);
    expect(result.conversationIds).toEqual([ROOT_ID, CHILD_ID]);
    expect(result.messages.deletedCount).toBe(2);
    await expect(countBoundary(TENANT_A)).resolves.toEqual({ conversations: 0, messages: 0 });
    await expect(countBoundary(TENANT_B)).resolves.toEqual({ conversations: 2, messages: 2 });
    await expect(countBoundary(null)).resolves.toEqual({ conversations: 2, messages: 2 });
    expect(deleteAgentQueuedTurns).toHaveBeenNthCalledWith(1, OWNER, [
      { conversationId: CHILD_ID, tenantId: TENANT_A },
    ]);
    expect(deleteAgentQueuedTurns).toHaveBeenNthCalledWith(2, OWNER, [
      { conversationId: ROOT_ID, tenantId: TENANT_A },
    ]);
    expect(tagCounts.get('a-child-tag')).toBe(0);
    expect(tagCounts.get('a-root-tag')).toBe(1);
    expect(tagCounts.get('b-root-tag')).toBe(1);
    expect(tagCounts.get('b-child-tag')).toBe(1);
    expect(tagCounts.get('legacy-root-tag')).toBe(1);
    expect(tagCounts.get('legacy-child-tag')).toBe(1);
  });
});
