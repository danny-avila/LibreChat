import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IConversation } from '..';
import type { IConversationTag } from '~/schema/conversationTag';
import { createConversationTagMethods, decrementTagCounts } from './conversationTag';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let ConversationTag: mongoose.Model<IConversationTag>;
let Conversation: mongoose.Model<IConversation>;
let deleteConversationTag: ReturnType<typeof createConversationTagMethods>['deleteConversationTag'];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Register models
  const models = createModels(mongoose);
  Object.assign(mongoose.models, models);

  ConversationTag = mongoose.models.ConversationTag;
  Conversation = mongoose.models.Conversation;

  // Create methods from factory
  const methods = createConversationTagMethods(mongoose);
  deleteConversationTag = methods.deleteConversationTag;

  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await ConversationTag.deleteMany({});
  await Conversation.deleteMany({});
});

describe('ConversationTag model - $pullAll operations', () => {
  const userId = new mongoose.Types.ObjectId().toString();

  describe('deleteConversationTag', () => {
    it('should remove the tag from all conversations that have it', async () => {
      await ConversationTag.create({ tag: 'work', user: userId, position: 1 });

      await Conversation.create([
        { conversationId: 'conv1', user: userId, endpoint: 'openAI', tags: ['work', 'important'] },
        { conversationId: 'conv2', user: userId, endpoint: 'openAI', tags: ['work'] },
        { conversationId: 'conv3', user: userId, endpoint: 'openAI', tags: ['personal'] },
      ]);

      await deleteConversationTag(userId, 'work');

      const convos = await Conversation.find({ user: userId }).sort({ conversationId: 1 }).lean();
      expect(convos[0].tags).toEqual(['important']);
      expect(convos[1].tags).toEqual([]);
      expect(convos[2].tags).toEqual(['personal']);
    });

    it('should delete the tag document itself', async () => {
      await ConversationTag.create({ tag: 'temp', user: userId, position: 1 });

      const result = await deleteConversationTag(userId, 'temp');

      expect(result).toBeDefined();
      expect(result!.tag).toBe('temp');

      const remaining = await ConversationTag.find({ user: userId }).lean();
      expect(remaining).toHaveLength(0);
    });

    it('should return null when the tag does not exist', async () => {
      const result = await deleteConversationTag(userId, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should adjust positions of tags after the deleted one', async () => {
      await ConversationTag.create([
        { tag: 'first', user: userId, position: 1 },
        { tag: 'second', user: userId, position: 2 },
        { tag: 'third', user: userId, position: 3 },
      ]);

      await deleteConversationTag(userId, 'first');

      const tags = await ConversationTag.find({ user: userId }).sort({ position: 1 }).lean();
      expect(tags).toHaveLength(2);
      expect(tags[0].tag).toBe('second');
      expect(tags[0].position).toBe(1);
      expect(tags[1].tag).toBe('third');
      expect(tags[1].position).toBe(2);
    });

    it('should not affect conversations of other users', async () => {
      const otherUser = new mongoose.Types.ObjectId().toString();

      await ConversationTag.create({ tag: 'shared-name', user: userId, position: 1 });
      await ConversationTag.create({ tag: 'shared-name', user: otherUser, position: 1 });

      await Conversation.create([
        { conversationId: 'mine', user: userId, endpoint: 'openAI', tags: ['shared-name'] },
        { conversationId: 'theirs', user: otherUser, endpoint: 'openAI', tags: ['shared-name'] },
      ]);

      await deleteConversationTag(userId, 'shared-name');

      const myConvo = await Conversation.findOne({ conversationId: 'mine' }).lean();
      const theirConvo = await Conversation.findOne({ conversationId: 'theirs' }).lean();

      expect(myConvo?.tags).toEqual([]);
      expect(theirConvo?.tags).toEqual(['shared-name']);
    });

    it('should handle duplicate tags in conversations correctly', async () => {
      await ConversationTag.create({ tag: 'dup', user: userId, position: 1 });

      const conv = await Conversation.create({
        conversationId: 'conv-dup',
        user: userId,
        endpoint: 'openAI',
        tags: ['dup', 'other', 'dup'],
      });

      await deleteConversationTag(userId, 'dup');

      const updated = await Conversation.findById(conv._id).lean();
      expect(updated?.tags).toEqual(['other']);
    });
  });
});

describe('decrementTagCounts', () => {
  const userId = new mongoose.Types.ObjectId().toString();

  const readCount = async (tag: string, user: string = userId) =>
    (await ConversationTag.findOne({ user, tag }).lean())?.count;

  it('decrements once per tag occurrence', async () => {
    await ConversationTag.create({ tag: 'work', user: userId, position: 1, count: 5 });

    await decrementTagCounts(mongoose, userId, ['work', 'work']);

    expect(await readCount('work')).toBe(3);
  });

  it('decrements an exact count down to zero', async () => {
    await ConversationTag.create({ tag: 'work', user: userId, position: 1, count: 2 });

    await decrementTagCounts(mongoose, userId, ['work', 'work']);

    expect(await readCount('work')).toBe(0);
  });

  it('clamps at zero when the decrement exceeds the current count', async () => {
    await ConversationTag.create({ tag: 'work', user: userId, position: 1, count: 1 });

    await decrementTagCounts(mongoose, userId, ['work', 'work', 'work']);

    expect(await readCount('work')).toBe(0);
  });

  it('leaves a zero count at zero', async () => {
    await ConversationTag.create({ tag: 'empty', user: userId, position: 1, count: 0 });

    await decrementTagCounts(mongoose, userId, ['empty']);

    expect(await readCount('empty')).toBe(0);
  });

  it('clamps pre-existing negative drift to zero', async () => {
    await ConversationTag.create({ tag: 'drift', user: userId, position: 1, count: -3 });

    await decrementTagCounts(mongoose, userId, ['drift']);

    expect(await readCount('drift')).toBe(0);
  });

  it('treats a missing count as zero', async () => {
    await ConversationTag.collection.insertOne({ tag: 'legacy', user: userId, position: 1 });

    await decrementTagCounts(mongoose, userId, ['legacy']);

    expect(await readCount('legacy')).toBe(0);
  });

  it('converges to zero under concurrent decrements exceeding the count', async () => {
    await ConversationTag.create({ tag: 'race', user: userId, position: 1, count: 3 });

    await Promise.all([
      decrementTagCounts(mongoose, userId, ['race', 'race']),
      decrementTagCounts(mongoose, userId, ['race', 'race']),
    ]);

    expect(await readCount('race')).toBe(0);
  });

  it("leaves other users' tags untouched", async () => {
    const otherUserId = new mongoose.Types.ObjectId().toString();
    await ConversationTag.create({ tag: 'work', user: userId, position: 1, count: 4 });
    await ConversationTag.create({ tag: 'work', user: otherUserId, position: 1, count: 4 });

    await decrementTagCounts(mongoose, userId, ['work']);

    expect(await readCount('work')).toBe(3);
    expect(await readCount('work', otherUserId)).toBe(4);
  });

  it('ignores empty and unknown tags without throwing', async () => {
    await expect(decrementTagCounts(mongoose, userId, ['', 'nonexistent'])).resolves.not.toThrow();
  });
});

describe('management metadata count integration', () => {
  it('applies each committed transition once, including reversed reconciliation order', async () => {
    const { reconcileConversationTagCounts } = createConversationTagMethods(mongoose);
    await Conversation.create({
      user: 'owner',
      conversationId: 'committed',
      endpoint: 'openAI',
      tags: ['blue'],
    });
    await reconcileConversationTagCounts('owner', ['red'], ['blue'], null);
    await reconcileConversationTagCounts('owner', [], ['red'], null);
    expect(await ConversationTag.findOne({ user: 'owner', tag: 'red' }).lean()).toBeNull();
    expect(await ConversationTag.findOne({ user: 'owner', tag: 'blue' }).lean()).toMatchObject({
      count: 1,
    });
    await reconcileConversationTagCounts('owner', ['blue'], ['blue'], null);
    expect(await ConversationTag.findOne({ user: 'owner', tag: 'blue' }).lean()).toMatchObject({
      count: 1,
    });
  });

  it('isolates tenantless metadata and deletion deltas from historical tenant rows', async () => {
    const { reconcileConversationTagCounts } = createConversationTagMethods(mongoose);
    await ConversationTag.collection.insertOne({
      user: 'owner',
      tenantId: 'historical',
      tag: 'red',
      count: 8,
    });
    await Conversation.create({
      user: 'owner',
      conversationId: 'tenantless',
      endpoint: 'openAI',
      tags: ['red'],
    });
    await reconcileConversationTagCounts('owner', [], ['red'], null);
    await decrementTagCounts(mongoose, 'owner', ['red'], null);
    expect(
      await ConversationTag.findOne({ user: 'owner', tenantId: 'historical' }).lean(),
    ).toMatchObject({ count: 8 });
    expect(
      await ConversationTag.findOne({ user: 'owner', tenantId: { $exists: false } }).lean(),
    ).toMatchObject({ count: 0 });
  });
});

describe('management count refresh ordering', () => {
  it('does not materialize a removed imported tag with no catalog row', async () => {
    const methods = createConversationTagMethods(mongoose);
    await Conversation.create({
      user: 'owner',
      conversationId: 'imported',
      endpoint: 'openAI',
      tags: [],
    });
    await methods.reconcileConversationTagCounts('owner', ['imported-name'], [], null);
    expect(await ConversationTag.find({ user: 'owner' }).lean()).toEqual([]);
  });

  it.each([false, true])(
    'recounts after a competing removal while a catalog write is paused (existing=%s)',
    async (existing) => {
      const methods = createConversationTagMethods(mongoose);
      await Conversation.create({
        user: 'owner',
        conversationId: 'race',
        endpoint: 'openAI',
        tags: ['red'],
      });
      if (existing) await ConversationTag.create({ user: 'owner', tag: 'red', count: 0 });
      const original = ConversationTag.collection.updateOne.bind(ConversationTag.collection);
      let arrive!: () => void;
      let release!: () => void;
      const paused = new Promise<void>((resolve) => {
        arrive = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      const write = jest
        .spyOn(ConversationTag.collection, 'updateOne')
        .mockImplementationOnce(async (...args) => {
          arrive();
          await resume;
          return original(...args);
        });
      try {
        const older = methods.reconcileConversationTagCounts('owner', [], ['red'], null);
        await paused;
        await Conversation.updateOne(
          { user: 'owner', conversationId: 'race' },
          { $set: { tags: [] } },
        );
        await methods.reconcileConversationTagCounts('owner', ['red'], [], null);
        release();
        await older;
        expect(await ConversationTag.findOne({ user: 'owner', tag: 'red' }).lean()).toMatchObject({
          count: 0,
        });
      } finally {
        release();
        write.mockRestore();
      }
    },
  );
});

it('provisions the required catalog index with automatic indexing disabled and retries failed setup', async () => {
  const isolated = new mongoose.Mongoose();
  createModels(isolated);
  await isolated.connect(mongoServer.getUri('management-tag-index'), { autoIndex: false });
  const methods = createConversationTagMethods(isolated);
  await isolated.models.Conversation.create({
    user: 'owner',
    conversationId: 'indexed',
    endpoint: 'openAI',
    tags: ['red'],
  });
  const build = jest
    .spyOn(isolated.models.ConversationTag, 'createIndexes')
    .mockRejectedValueOnce(new Error('DDL unavailable'));
  try {
    await expect(
      methods.reconcileConversationTagCounts('owner', [], ['red'], null),
    ).rejects.toThrow('DDL unavailable');
    await methods.reconcileConversationTagCounts('owner', [], ['red'], null);
    await methods.reconcileConversationTagCounts('owner', ['red'], ['red'], null);
    expect(build).toHaveBeenCalledTimes(2);
    expect(
      await isolated.models.ConversationTag.findOne({ user: 'owner', tag: 'red' }).lean(),
    ).toMatchObject({ count: 1 });
    const indexes = await isolated.models.ConversationTag.collection.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { tag: 1, user: 1, tenantId: 1 }, unique: true }),
      ]),
    );
  } finally {
    build.mockRestore();
    await isolated.connection.dropDatabase();
    await isolated.disconnect();
  }
});
