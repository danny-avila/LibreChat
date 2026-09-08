import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IConversation } from '..';
import type { IConversationTag } from '~/schema/conversationTag';
import { createConversationTagMethods, decrementTagCounts } from './conversationTag';
import { tenantStorage } from '~/config/tenantContext';
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
let getConversationTags: ReturnType<typeof createConversationTagMethods>['getConversationTags'];
let reconcileConversationTagCounts: ReturnType<
  typeof createConversationTagMethods
>['reconcileConversationTagCounts'];

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
  getConversationTags = methods.getConversationTags;
  reconcileConversationTagCounts = methods.reconcileConversationTagCounts;

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

    it('returns the committed deletion without a fallible count read', async () => {
      await ConversationTag.create({ tag: 'removed', user: userId, position: 1, count: 77 });
      await Conversation.create({
        conversationId: 'tag-delete',
        user: userId,
        endpoint: 'openAI',
        tags: ['removed'],
      });
      const count = jest
        .spyOn(Conversation, 'countDocuments')
        .mockRejectedValue(new Error('count unavailable'));
      try {
        await expect(deleteConversationTag(userId, 'removed')).resolves.toMatchObject({
          tag: 'removed',
          count: 0,
        });
        expect(count).not.toHaveBeenCalled();
        expect(await ConversationTag.findOne({ user: userId, tag: 'removed' })).toBeNull();
        expect((await Conversation.findOne({ user: userId }).lean())?.tags).toEqual([]);
      } finally {
        count.mockRestore();
      }
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

describe('reconcileConversationTagCounts', () => {
  const userId = new mongoose.Types.ObjectId().toString();

  it('commutes when a later transition reconciles before its predecessor', async () => {
    await Conversation.create({
      conversationId: 'committed',
      user: userId,
      endpoint: 'openAI',
      tags: ['blue'],
    });
    await reconcileConversationTagCounts(userId, ['red'], ['blue']);

    await expect(getConversationTags(userId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: 'red', count: 0 }),
        expect.objectContaining({ tag: 'blue', count: 1 }),
      ]),
    );

    await reconcileConversationTagCounts(userId, [], ['red']);

    await expect(
      ConversationTag.findOne({ user: userId, tag: 'red' }).lean(),
    ).resolves.toMatchObject({ count: 0 });
    await expect(
      ConversationTag.findOne({ user: userId, tag: 'blue' }).lean(),
    ).resolves.toMatchObject({ count: 1 });
  });
});

describe('authoritative public tag counts', () => {
  const user = 'count-owner';

  it('reads stable derived tags without writes after reconciliation fails', async () => {
    await Conversation.create({
      conversationId: 'committed',
      user,
      endpoint: 'openAI',
      tags: ['new', 'new'],
    });
    const write = jest
      .spyOn(ConversationTag, 'bulkWrite')
      .mockRejectedValueOnce(new Error('transient'));
    await expect(reconcileConversationTagCounts(user, [], ['new'])).rejects.toThrow('transient');
    write.mockClear();
    const first = await getConversationTags(user);
    expect(await getConversationTags(user)).toEqual(first);
    expect(write).not.toHaveBeenCalled();
    expect(await ConversationTag.countDocuments({ user })).toBe(0);
    write.mockRestore();
    await expect(getConversationTags(user)).resolves.toEqual([
      expect.objectContaining({ tag: 'new', count: 1 }),
    ]);
    await expect(getConversationTags(user)).resolves.toEqual([
      expect.objectContaining({ tag: 'new', count: 1 }),
    ]);
  });

  it.each(['delete', 'rename'])(
    'ignores delayed signed deltas after catalog %s',
    async (action) => {
      const methods = createConversationTagMethods(mongoose);
      await Conversation.create({
        conversationId: 'committed',
        user,
        endpoint: 'openAI',
        tags: ['blue'],
      });
      await reconcileConversationTagCounts(user, ['red'], ['blue']);
      if (action === 'delete') await methods.deleteConversationTag(user, 'red');
      else await methods.updateConversationTag(user, 'red', { tag: 'renamed' });
      await reconcileConversationTagCounts(user, [], ['red']);
      const tags = await getConversationTags(user);
      expect(tags.find((tag) => tag.tag === 'blue')).toMatchObject({ count: 1 });
      expect(tags.filter((tag) => tag.tag !== 'blue').every((tag) => tag.count === 0)).toBe(true);
    },
  );

  it('separates named and tenantless counts and preserves catalog metadata', async () => {
    await Conversation.create([
      { conversationId: 'plain', user, endpoint: 'openAI', tags: ['shared'] },
      { conversationId: 'foreign', user: 'foreign', endpoint: 'openAI', tags: ['shared'] },
    ]);
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await Conversation.create({
        conversationId: 'named',
        user,
        endpoint: 'openAI',
        tags: ['shared', 'shared'],
      });
      await ConversationTag.create({
        user,
        tag: 'empty',
        count: 999,
        description: 'Keep me',
        position: 3,
      });
      expect(await getConversationTags(user)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tag: 'shared', count: 1, tenantId: 'tenant-a' }),
          expect.objectContaining({ tag: 'empty', count: 0, description: 'Keep me', position: 3 }),
        ]),
      );
    });
    expect(await getConversationTags(user, null)).toEqual([
      expect.objectContaining({ tag: 'shared', count: 1 }),
    ]);
    expect(
      (await ConversationTag.find({ user }).lean()).filter((tag) => tag.tag === 'shared'),
    ).toHaveLength(0);
  });

  it.each(['rename', 'delete'])('does not repair catalog rows during %s', async (action) => {
    const methods = createConversationTagMethods(mongoose);
    await Conversation.create({
      conversationId: 'interleaved',
      user,
      endpoint: 'openAI',
      tags: ['red'],
    });
    await ConversationTag.create({ user, tag: 'red', count: 1, position: 1 });
    const updateMany = Conversation.collection.updateMany.bind(Conversation.collection);
    const write = jest
      .spyOn(Conversation.collection, 'updateMany')
      .mockImplementationOnce(async (...args) => {
        if (action === 'delete') await getConversationTags(user);
        const result = await updateMany(...args);
        if (action === 'rename') await getConversationTags(user);
        return result;
      });
    try {
      if (action === 'rename') await methods.updateConversationTag(user, 'red', { tag: 'blue' });
      else await methods.deleteConversationTag(user, 'red');
    } finally {
      write.mockRestore();
    }
    expect(await ConversationTag.find({ user }).distinct('tag')).toEqual(
      action === 'rename' ? ['blue'] : [],
    );
    expect((await getConversationTags(user)).map(({ tag, count }) => ({ tag, count }))).toEqual(
      action === 'rename' ? [{ tag: 'blue', count: 1 }] : [],
    );
  });

  it('allows explicit rename and deletion of tags with no catalog row', async () => {
    const methods = createConversationTagMethods(mongoose);
    await Conversation.create({
      conversationId: 'derived',
      user,
      endpoint: 'openAI',
      tags: ['red', 'green'],
    });
    expect(await methods.updateConversationTag(user, 'red', { tag: 'blue' })).toMatchObject({
      count: 1,
    });
    expect(await methods.deleteConversationTag(user, 'green')).toMatchObject({ count: 0 });
    expect((await getConversationTags(user)).map(({ tag, count }) => ({ tag, count }))).toEqual([
      { tag: 'blue', count: 1 },
    ]);
  });

  it('returns committed counts from create and rename responses', async () => {
    const methods = createConversationTagMethods(mongoose);
    await Conversation.create({
      conversationId: 'committed',
      user,
      endpoint: 'openAI',
      tags: ['red'],
    });
    await ConversationTag.create({ user, tag: 'red', count: -7, position: 1 });
    expect(await methods.createConversationTag(user, { tag: 'red' })).toMatchObject({ count: 1 });
    expect(await methods.updateConversationTag(user, 'red', { tag: 'blue' })).toMatchObject({
      count: 1,
    });
    expect(await methods.deleteConversationTag(user, 'blue')).toMatchObject({ count: 0 });
  });
});

describe('decrementTagCounts', () => {
  const userId = new mongoose.Types.ObjectId().toString();

  const readCount = async (tag: string, user: string = userId) =>
    (await ConversationTag.findOne({ user, tag }).lean())?.count;

  it('preserves a delayed metadata increment across deletion of another tagged conversation', async () => {
    await ConversationTag.create({ tag: 'red', user: userId, position: 1, count: 1 });
    await reconcileConversationTagCounts(userId, ['red'], ['blue']);
    await decrementTagCounts(mongoose, userId, ['red']);
    expect(await readCount('red')).toBe(-1);
    await reconcileConversationTagCounts(userId, [], ['red']);
    expect(await readCount('red')).toBe(0);
    expect(await readCount('blue')).toBe(1);
  });

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

  it('retains signed deltas when decrements precede increments', async () => {
    await ConversationTag.create({ tag: 'work', user: userId, position: 1, count: 1 });

    await decrementTagCounts(mongoose, userId, ['work', 'work', 'work']);

    expect(await readCount('work')).toBe(-2);
  });

  it('retains a decrement of a zero count', async () => {
    await ConversationTag.create({ tag: 'empty', user: userId, position: 1, count: 0 });

    await decrementTagCounts(mongoose, userId, ['empty']);

    expect(await readCount('empty')).toBe(-1);
  });

  it('preserves an existing negative delta', async () => {
    await ConversationTag.create({ tag: 'drift', user: userId, position: 1, count: -3 });

    await decrementTagCounts(mongoose, userId, ['drift']);

    expect(await readCount('drift')).toBe(-4);
  });

  it('treats a missing count as zero', async () => {
    await ConversationTag.collection.insertOne({ tag: 'legacy', user: userId, position: 1 });

    await decrementTagCounts(mongoose, userId, ['legacy']);

    expect(await readCount('legacy')).toBe(-1);
  });

  it('combines concurrent decrements without discarding negative deltas', async () => {
    await ConversationTag.create({ tag: 'race', user: userId, position: 1, count: 3 });

    await Promise.all([
      decrementTagCounts(mongoose, userId, ['race', 'race']),
      decrementTagCounts(mongoose, userId, ['race', 'race']),
    ]);

    expect(await readCount('race')).toBe(-1);
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

describe('catalog mutation tenant boundaries', () => {
  const user = 'catalog-owner';

  it.each([null, 'tenant-a'])(
    'keeps catalog and membership mutations inside tenant %s',
    async (tenantId) => {
      const methods = createConversationTagMethods(mongoose);
      const owners = [
        { user },
        { user, tenantId: 'tenant-a' },
        { user, tenantId: 'tenant-b' },
        { user: 'foreign' },
      ];
      for (const owner of owners) {
        await Conversation.collection.insertOne({
          ...owner,
          conversationId: 'same',
          endpoint: 'openAI',
          tags: ['shared'],
        });
        await ConversationTag.collection.insertMany([
          { ...owner, tag: 'shared', count: 5, position: 1 },
          { ...owner, tag: 'later', count: 0, position: 2 },
        ]);
        if (owner.user !== user || (owner.tenantId ?? null) !== tenantId) {
          await ConversationTag.collection.insertOne({
            ...owner,
            tag: 'renamed',
            count: 0,
            position: 99,
          });
        }
      }
      const outside = {
        $or: [
          { user: { $ne: user } },
          tenantId == null ? { tenantId: { $exists: true } } : { tenantId: { $ne: tenantId } },
        ],
      };
      const catalogBefore = await ConversationTag.collection
        .find(outside)
        .sort({ _id: 1 })
        .toArray();
      const messagesBefore = await Conversation.collection.find(outside).sort({ _id: 1 }).toArray();
      await tenantStorage.run(tenantId == null ? {} : { tenantId }, async () => {
        const created = await methods.createConversationTag(
          user,
          { tag: 'fresh', addToConversation: true, conversationId: 'same' },
          tenantId,
        );
        expect(created).toMatchObject({ tag: 'fresh', position: 3, count: 1 });
        await methods.bulkIncrementTagCounts(user, ['shared']);
        const renamed = await methods.updateConversationTag(
          user,
          'shared',
          { tag: 'renamed', position: 3 },
          tenantId,
        );
        expect(renamed).toMatchObject({ tag: 'renamed', count: 1, position: 3 });
        await methods.deleteConversationTag(user, 'later', tenantId);
        await methods.deleteConversationTag(user, 'renamed', tenantId);
        expect(await methods.getConversationTags(user, tenantId)).toEqual([
          expect.objectContaining({ tag: 'fresh', position: 1, count: 1 }),
        ]);
      });
      expect(await ConversationTag.collection.find(outside).sort({ _id: 1 }).toArray()).toEqual(
        catalogBefore,
      );
      expect(await Conversation.collection.find(outside).sort({ _id: 1 }).toArray()).toEqual(
        messagesBefore,
      );
    },
  );

  it('does not materialize historical derived tags in a tenantless mutation', async () => {
    const methods = createConversationTagMethods(mongoose);
    await Conversation.collection.insertOne({
      user,
      tenantId: 'historical',
      conversationId: 'same',
      tags: ['derived'],
    });
    await expect(
      methods.updateConversationTag(user, 'derived', { tag: 'renamed' }, null),
    ).resolves.toBeNull();
    await expect(methods.deleteConversationTag(user, 'derived', null)).resolves.toBeNull();
    expect(await ConversationTag.countDocuments({ user })).toBe(0);
    expect((await Conversation.findOne({ user }).lean())?.tags).toEqual(['derived']);
    await Conversation.collection.insertOne({ user, conversationId: 'same', tags: ['derived'] });
    await expect(
      methods.updateConversationTag(user, 'derived', { tag: 'renamed' }, null),
    ).resolves.toMatchObject({ tag: 'renamed', count: 1 });
    await methods.deleteConversationTag(user, 'renamed', null);
    expect((await Conversation.findOne({ user, tenantId: 'historical' }).lean())?.tags).toEqual([
      'derived',
    ]);
  });
});
