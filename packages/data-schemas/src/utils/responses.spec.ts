import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels, tenantStorage } from '..';
import type { AllMethods, IMessage } from '..';

let server: MongoMemoryServer;
let methods: AllMethods;
let Message: mongoose.Model<IMessage>;
const owner = 'visibility-owner';
const conversationId = '527cccb0-2624-4e3c-b754-88b7bcb0ac19';
const responseId = 'resp_visibility';
const scope = <T>(work: () => Promise<T>, tenantId = 'tenant-visible') =>
  tenantStorage.run({ tenantId }, work);

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  createModels(mongoose);
  methods = createMethods(mongoose);
  Message = mongoose.models.Message as mongoose.Model<IMessage>;
});
afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function seedTurn(commitState: 'pending' | 'committed' = 'pending') {
  await mongoose.models.Conversation.create({
    conversationId,
    user: owner,
    title: 'visible',
    endpoint: 'agents',
  });
  return Message.create([
    {
      messageId: 'input-visible',
      conversationId,
      user: owner,
      text: 'pending question',
      sender: 'User',
      isCreatedByUser: true,
      isUserSubmitted: true,
      createdAt: new Date(1000),
      metadata: {
        responsesTurn: { version: 1, responseId },
        responsesInput: { role: 'user' },
      },
    },
    {
      messageId: responseId,
      conversationId,
      user: owner,
      text: 'pending answer',
      sender: 'Agent',
      isCreatedByUser: false,
      isUserSubmitted: false,
      createdAt: new Date(2000),
      metadata: {
        responsesTurn: { version: 1, responseId },
        responsesResponse: { version: 1, commitState, output: [], usage: null },
      },
    },
  ]);
}

it('hides every staged row until the owned output is committed', async () => {
  await scope(async () => {
    await seedTurn();
    expect(await methods.getMessages({ user: owner, conversationId })).toEqual([]);
    expect(await methods.getMessages({ user: owner, messageId: 'input-visible' })).toEqual([]);
    expect(await methods.getMessage({ user: owner, messageId: responseId })).toBeNull();
    await methods.commitStoredResponseTurn({ userId: owner, conversationId, responseId });
    expect(await methods.getMessages({ user: owner, conversationId })).toHaveLength(2);
    expect(await methods.getMessage({ user: owner, messageId: responseId })).not.toBeNull();
  });
});

it('filters before limits and preserves cursors and schema-private projections', async () => {
  await scope(async () => {
    await seedTurn();
    await Message.create(
      [3, 4, 5].map((id) => ({
        messageId: `legacy-${id}`,
        conversationId,
        user: owner,
        text: 'visible',
        sender: 'User',
        createdAt: new Date(id * 1000),
      })),
    );
    await Message.collection.updateMany(
      {},
      {
        $set: {
          contextMeta: { secret: 'private' },
          subagentTranscript: { messagesJson: 'private' },
        },
      },
    );
    const first = await methods.getMessagesByCursor(
      { user: owner, conversationId },
      { limit: 2, sortOrder: 1, select: '-contextMeta' },
    );
    expect(first.messages.map((message) => message.messageId)).toEqual(['legacy-3', 'legacy-4']);
    expect(first.messages[0]).not.toHaveProperty('contextMeta');
    const second = await methods.getMessagesByCursor(
      { user: owner, conversationId },
      { limit: 2, sortOrder: 1, cursor: first.nextCursor },
    );
    expect(second.messages.map((message) => message.messageId)).toEqual(['legacy-5']);
    expect(second.nextCursor).toBeNull();
    const ids = await methods.getMessages({ user: owner }, '_id');
    expect(Object.keys(ids[0])).toEqual(['_id']);
    const ordinary = await methods.getMessages({ user: owner });
    expect(ordinary[0]).not.toHaveProperty('subagentTranscript');
    const internal = await methods.getMessages({ user: owner }, '+subagentTranscript');
    expect(internal[0].subagentTranscript).toEqual({ messagesJson: 'private' });
  });
});

it('does not publish a turn through another tenant or owner with the same response ID', async () => {
  await scope(async () => {
    await seedTurn();
  });
  await scope(async () => {
    await seedTurn('committed');
  }, 'tenant-other');
  await scope(async () => {
    const output = await Message.findOne({ messageId: responseId }).lean();
    await Message.create({
      ...output,
      _id: new mongoose.Types.ObjectId(),
      user: 'another-owner',
      metadata: {
        responsesTurn: { version: 1, responseId },
        responsesResponse: { version: 1, commitState: 'committed', output: [] },
      },
    });
    expect(await methods.getMessages({ user: owner, conversationId })).toEqual([]);
  });
});

it('excludes pending rows from new shares and existing share reads', async () => {
  await scope(async () => {
    const pending = await seedTurn();
    await expect(methods.createSharedLink(owner, conversationId)).rejects.toMatchObject({
      code: 'NO_MESSAGES',
    });
    await mongoose.models.SharedLink.create({
      shareId: 'pending-share',
      conversationId,
      user: owner,
      title: 'pending',
      messages: pending.map((message) => message._id),
    });
    const shared = await methods.getSharedMessages('pending-share');
    expect(shared?.messages ?? []).toEqual([]);
    await methods.commitStoredResponseTurn({ userId: owner, conversationId, responseId });
    const committed = await methods.getSharedMessages('pending-share');
    expect(committed?.messages).toHaveLength(2);
  });
});

it('removes pending search hits even if the external index has already indexed them', async () => {
  await scope(async () => {
    await seedTurn();
    Object.defineProperty(Message, 'meiliSearch', {
      configurable: true,
      value: jest
        .fn()
        .mockResolvedValue({ hits: [{ user: owner, messageId: responseId, text: 'pending' }] }),
    });
    try {
      expect((await methods.searchMessages('pending', {}, true)).hits).toEqual([]);
      await methods.commitStoredResponseTurn({ userId: owner, conversationId, responseId });
      expect((await methods.searchMessages('pending', {}, true)).hits).toHaveLength(1);
    } finally {
      Reflect.deleteProperty(Message, 'meiliSearch');
    }
  });
});
