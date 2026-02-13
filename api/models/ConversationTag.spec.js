const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { ConversationTag, Conversation } = require('~/db/models');
const { deleteConversationTag } = require('./ConversationTag');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
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
      expect(result.tag).toBe('temp');

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

      expect(myConvo.tags).toEqual([]);
      expect(theirConvo.tags).toEqual(['shared-name']);
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
      expect(updated.tags).toEqual(['other']);
    });
  });
});
