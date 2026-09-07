import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels, tenantStorage } from '..';
import type { SearchParams } from 'meilisearch';
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
          subagentTask: { status: 'completed' },
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
    const transcript = await methods.getMessages(
      { user: owner },
      'messageId parentMessageId text createdAt +subagentTranscript +subagentTask',
    );
    expect(transcript[0].subagentTranscript).toEqual({ messagesJson: 'private' });
    expect(transcript[0].subagentTask).toEqual({ status: 'completed' });
    expect(transcript[0]).not.toHaveProperty('contextMeta');
    expect(transcript[0]).not.toHaveProperty('user');
  });
});

it.each([false, true])(
  'refills projected search results with one visibility read per page (hydrate=%s)',
  async (hydrate) => {
    await scope(async () => {
      await seedTurn();
      await Message.create({
        messageId: 'search-visible',
        conversationId,
        user: owner,
        sender: 'User',
        text: 'visible',
      });
      const indexed = [
        { messageId: responseId, user: owner, conversationId },
        { messageId: 'search-visible', user: owner, conversationId },
      ];
      const search = jest.fn(async (_query: string, options: SearchParams) => ({
        hits: indexed
          .slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 20))
          .map((hit) =>
            Object.fromEntries(
              Object.entries(hit).filter(
                ([field]) =>
                  !options.attributesToRetrieve || options.attributesToRetrieve.includes(field),
              ),
            ),
          ),
      }));
      Object.defineProperty(Message, 'meiliSearch', { configurable: true, value: search });
      const aggregate = jest.spyOn(Message, 'aggregate');
      try {
        const result = await methods.searchMessages(
          'visible',
          {
            limit: 1,
            attributesToRetrieve: ['conversationId', 'originalConversationId'],
            filter: `user = "${owner}"`,
          },
          hydrate,
        );
        expect(result.hits).toHaveLength(1);
        expect(result.hits[0].conversationId).toBe(conversationId);
        if (hydrate) {
          expect(result.hits[0].messageId).toBe('search-visible');
          expect(result.hits[0].text).toBe('visible');
        } else {
          expect(result.hits[0]).toEqual({ conversationId });
        }
        expect(search).toHaveBeenCalledTimes(2);
        expect(aggregate).toHaveBeenCalledTimes(2);
        expect(search).toHaveBeenLastCalledWith(
          'visible',
          expect.objectContaining({
            offset: 1,
            limit: 1,
            filter: `user = "${owner}"`,
            attributesToRetrieve: ['conversationId', 'originalConversationId', 'messageId', 'user'],
          }),
          false,
        );
      } finally {
        aggregate.mockRestore();
        Reflect.deleteProperty(Message, 'meiliSearch');
      }
    });
  },
);

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
