const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { EModelEndpoint } = require('librechat-data-provider');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  searchConversationsAndMessages,
  buildLatestMessagePipeline,
  clearSearchCache,
} = require('./search');
const { getConvosQueried } = require('./Conversation');
const { Conversation, Message } = require('~/db/models');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Conversation.deleteMany({});
  await Message.deleteMany({});
  clearSearchCache();
  if (!Conversation.meiliSearch) {
    Conversation.meiliSearch = () => Promise.resolve({ hits: [] });
  }
  if (!Message.meiliSearch) {
    Message.meiliSearch = () => Promise.resolve({ hits: [] });
  }
});

describe('searchConversationsAndMessages', () => {
  it('should merge conversation IDs from both convo and message hits', async () => {
    const convoId1 = uuidv4();
    const convoId2 = uuidv4();

    const convoSpy = jest
      .spyOn(Conversation, 'meiliSearch')
      .mockResolvedValue({ hits: [{ conversationId: convoId1 }] });
    const msgSpy = jest
      .spyOn(Message, 'meiliSearch')
      .mockResolvedValue({ hits: [{ conversationId: convoId2 }] });

    try {
      const { conversationIds, convoHits, messageHits } = await searchConversationsAndMessages(
        'test',
        'user1',
      );

      expect(conversationIds).toEqual(new Set([convoId1, convoId2]));
      expect(convoHits).toHaveLength(1);
      expect(messageHits).toHaveLength(1);
      expect(convoSpy).toHaveBeenCalledWith('test', { filter: 'user = "user1"' });
      expect(msgSpy).toHaveBeenCalledWith('test', { filter: 'user = "user1"' }, false);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should deduplicate overlapping conversation IDs', async () => {
    const sharedId = uuidv4();

    const convoSpy = jest
      .spyOn(Conversation, 'meiliSearch')
      .mockResolvedValue({ hits: [{ conversationId: sharedId }] });
    const msgSpy = jest
      .spyOn(Message, 'meiliSearch')
      .mockResolvedValue({ hits: [{ conversationId: sharedId }] });

    try {
      const { conversationIds } = await searchConversationsAndMessages('test', 'user1');
      expect(conversationIds.size).toBe(1);
      expect(conversationIds.has(sharedId)).toBe(true);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should filter out null and undefined conversationIds', async () => {
    const validId = uuidv4();

    const convoSpy = jest.spyOn(Conversation, 'meiliSearch').mockResolvedValue({
      hits: [{ conversationId: validId }, { conversationId: null }],
    });
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({
      hits: [{ conversationId: undefined }, {}],
    });

    try {
      const { conversationIds } = await searchConversationsAndMessages('test', 'user1');
      expect(conversationIds.size).toBe(1);
      expect(conversationIds.has(validId)).toBe(true);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should return empty sets when both searches return no hits', async () => {
    const convoSpy = jest.spyOn(Conversation, 'meiliSearch').mockResolvedValue({ hits: [] });
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({ hits: [] });

    try {
      const { conversationIds, convoHits, messageHits } = await searchConversationsAndMessages(
        'test',
        'user1',
      );
      expect(conversationIds.size).toBe(0);
      expect(convoHits).toHaveLength(0);
      expect(messageHits).toHaveLength(0);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should handle non-array hits gracefully', async () => {
    const convoSpy = jest.spyOn(Conversation, 'meiliSearch').mockResolvedValue({ hits: null });
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({});

    try {
      const { conversationIds, convoHits, messageHits } = await searchConversationsAndMessages(
        'test',
        'user1',
      );
      expect(conversationIds.size).toBe(0);
      expect(convoHits).toHaveLength(0);
      expect(messageHits).toHaveLength(0);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should pass populateMessages flag to Message.meiliSearch', async () => {
    const convoSpy = jest.spyOn(Conversation, 'meiliSearch').mockResolvedValue({ hits: [] });
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({ hits: [] });

    try {
      await searchConversationsAndMessages('test', 'user1', true);
      expect(msgSpy).toHaveBeenCalledWith('test', { filter: 'user = "user1"' }, true);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should propagate Meilisearch errors', async () => {
    const convoSpy = jest
      .spyOn(Conversation, 'meiliSearch')
      .mockRejectedValue(new Error('Meilisearch unavailable'));
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({ hits: [] });

    try {
      await expect(searchConversationsAndMessages('test', 'user1')).rejects.toThrow(
        'Meilisearch unavailable',
      );
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should return cached results within TTL window', async () => {
    const convoId = uuidv4();

    const convoSpy = jest
      .spyOn(Conversation, 'meiliSearch')
      .mockResolvedValue({ hits: [{ conversationId: convoId }] });
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({ hits: [] });

    try {
      const first = await searchConversationsAndMessages('cached-query', 'user1');
      const second = await searchConversationsAndMessages('cached-query', 'user1');

      expect(first).toBe(second);
      expect(convoSpy).toHaveBeenCalledTimes(1);
      expect(msgSpy).toHaveBeenCalledTimes(1);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should not share cache across different users', async () => {
    const convoSpy = jest.spyOn(Conversation, 'meiliSearch').mockResolvedValue({ hits: [] });
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({ hits: [] });

    try {
      await searchConversationsAndMessages('query', 'user-a');
      await searchConversationsAndMessages('query', 'user-b');

      expect(convoSpy).toHaveBeenCalledTimes(2);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });
});

describe('Search + getConvosQueried integration', () => {
  it('should return message-matched conversations with correct convoMap', async () => {
    const convoId = uuidv4();

    await Conversation.create({
      conversationId: convoId,
      user: 'user1',
      title: 'Test Convo',
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-4',
      expiredAt: null,
    });

    const convoSpy = jest.spyOn(Conversation, 'meiliSearch').mockResolvedValue({ hits: [] });
    const msgSpy = jest
      .spyOn(Message, 'meiliSearch')
      .mockResolvedValue({ hits: [{ conversationId: convoId, messageId: 'msg-1' }] });

    try {
      const { conversationIds, messageHits } = await searchConversationsAndMessages(
        'test',
        'user1',
        true,
      );

      const convoRefs = [...conversationIds].map((id) => ({ conversationId: id }));
      const result = await getConvosQueried('user1', convoRefs, null, convoRefs.length);

      expect(result.convoMap[convoId]).toBeDefined();
      expect(result.convoMap[convoId].title).toBe('Test Convo');

      const cleanedMessages = messageHits.filter((m) => result.convoMap[m.conversationId]);
      expect(cleanedMessages).toHaveLength(1);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should return title-matched conversations not in message hits', async () => {
    const titleConvoId = uuidv4();
    const msgConvoId = uuidv4();

    await Conversation.create({
      conversationId: titleConvoId,
      user: 'user1',
      title: 'Title Match',
      endpoint: EModelEndpoint.openAI,
      expiredAt: null,
    });
    await Conversation.create({
      conversationId: msgConvoId,
      user: 'user1',
      title: 'Message Match',
      endpoint: EModelEndpoint.openAI,
      expiredAt: null,
    });

    const convoSpy = jest
      .spyOn(Conversation, 'meiliSearch')
      .mockResolvedValue({ hits: [{ conversationId: titleConvoId }] });
    const msgSpy = jest
      .spyOn(Message, 'meiliSearch')
      .mockResolvedValue({ hits: [{ conversationId: msgConvoId, messageId: 'msg-1' }] });

    try {
      const { conversationIds, messageHits } = await searchConversationsAndMessages(
        'test',
        'user1',
        true,
      );

      const convoRefs = [...conversationIds].map((id) => ({ conversationId: id }));
      const result = await getConvosQueried('user1', convoRefs, null, convoRefs.length);

      const messageConvoIds = new Set(messageHits.map((m) => m.conversationId));
      const titleOnlyIds = result.conversations
        .filter((c) => !messageConvoIds.has(c.conversationId))
        .map((c) => c.conversationId);

      expect(titleOnlyIds).toContain(titleConvoId);
      expect(titleOnlyIds).not.toContain(msgConvoId);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should return empty results when no search hits', async () => {
    const convoSpy = jest.spyOn(Conversation, 'meiliSearch').mockResolvedValue({ hits: [] });
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({ hits: [] });

    try {
      const { conversationIds } = await searchConversationsAndMessages('test', 'user1', true);

      expect(conversationIds.size).toBe(0);
      const convoRefs = [...conversationIds].map((id) => ({ conversationId: id }));
      const result = await getConvosQueried('user1', convoRefs, null, convoRefs.length);
      expect(result.conversations).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should handle mixed overlap where convo and message match the same conversation', async () => {
    const sharedId = uuidv4();
    const titleOnlyId = uuidv4();

    await Conversation.create({
      conversationId: sharedId,
      user: 'user1',
      title: 'Both Match',
      endpoint: EModelEndpoint.openAI,
      expiredAt: null,
    });
    await Conversation.create({
      conversationId: titleOnlyId,
      user: 'user1',
      title: 'Title Only',
      endpoint: EModelEndpoint.openAI,
      expiredAt: null,
    });

    const convoSpy = jest.spyOn(Conversation, 'meiliSearch').mockResolvedValue({
      hits: [{ conversationId: sharedId }, { conversationId: titleOnlyId }],
    });
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({
      hits: [{ conversationId: sharedId, messageId: 'msg-1' }],
    });

    try {
      const { conversationIds, messageHits } = await searchConversationsAndMessages(
        'test',
        'user1',
        true,
      );

      expect(conversationIds.size).toBe(2);

      const convoRefs = [...conversationIds].map((id) => ({ conversationId: id }));
      const result = await getConvosQueried('user1', convoRefs, null, convoRefs.length);

      expect(result.conversations).toHaveLength(2);

      const messageConvoIds = new Set(messageHits.map((m) => m.conversationId));
      const titleOnlyIds = result.conversations
        .filter((c) => !messageConvoIds.has(c.conversationId))
        .map((c) => c.conversationId);

      expect(titleOnlyIds).toEqual([titleOnlyId]);
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });

  it('should use null cursor so getConvosQueried does not apply date filtering', async () => {
    const convoId = uuidv4();

    await Conversation.create({
      conversationId: convoId,
      user: 'user1',
      title: 'Old Convo',
      endpoint: EModelEndpoint.openAI,
      expiredAt: null,
      updatedAt: new Date('2020-01-01'),
    });

    const convoSpy = jest
      .spyOn(Conversation, 'meiliSearch')
      .mockResolvedValue({ hits: [{ conversationId: convoId }] });
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({ hits: [] });

    try {
      const { conversationIds } = await searchConversationsAndMessages('test', 'user1');
      const convoRefs = [...conversationIds].map((id) => ({ conversationId: id }));
      const result = await getConvosQueried('user1', convoRefs, null, convoRefs.length);

      expect(result.conversations).toHaveLength(1);
      expect(result.convoMap[convoId]).toBeDefined();
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });
});

describe('Message.aggregate pipeline for title-only conversations', () => {
  it('should return only projected fields with no _id or internal fields', async () => {
    const convoId = uuidv4();

    await Message.create({
      messageId: uuidv4(),
      conversationId: convoId,
      user: 'user1',
      text: 'Hello world',
      isCreatedByUser: true,
      endpoint: 'openAI',
      iconURL: null,
      model: 'gpt-4',
    });

    const results = await Message.aggregate(buildLatestMessagePipeline('user1', [convoId]));

    expect(results).toHaveLength(1);
    const msg = results[0].message;
    expect(msg.conversationId).toBe(convoId);
    expect(msg.messageId).toBeDefined();
    expect(msg.text).toBe('Hello world');
    expect(msg.isCreatedByUser).toBe(true);
    expect(msg.endpoint).toBe('openAI');
    expect(msg.model).toBe('gpt-4');
    expect(msg.updatedAt).toBeDefined();
    expect(msg._id).toBeUndefined();
    expect(msg.__v).toBeUndefined();
    expect(msg._meiliIndex).toBeUndefined();
    expect(msg.content).toBeUndefined();
    expect(msg.metadata).toBeUndefined();
    expect(msg.addedConvo).toBeUndefined();
  });

  it('should return only the latest message per conversationId', async () => {
    const convoId = uuidv4();

    await Message.collection.insertMany([
      {
        messageId: uuidv4(),
        conversationId: convoId,
        user: 'user1',
        text: 'Older message',
        isCreatedByUser: true,
        updatedAt: new Date('2025-01-01'),
        createdAt: new Date('2025-01-01'),
      },
      {
        messageId: uuidv4(),
        conversationId: convoId,
        user: 'user1',
        text: 'Newer message',
        isCreatedByUser: false,
        updatedAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
      },
    ]);

    const results = await Message.aggregate(buildLatestMessagePipeline('user1', [convoId]));

    expect(results).toHaveLength(1);
    expect(results[0].message.text).toBe('Newer message');
    expect(results[0].message.isCreatedByUser).toBe(false);
  });

  it('should group by conversationId across multiple conversations', async () => {
    const convoA = uuidv4();
    const convoB = uuidv4();

    await Message.collection.insertMany([
      {
        messageId: uuidv4(),
        conversationId: convoA,
        user: 'user1',
        text: 'Message A1',
        isCreatedByUser: true,
        updatedAt: new Date('2025-06-01'),
        createdAt: new Date('2025-06-01'),
      },
      {
        messageId: uuidv4(),
        conversationId: convoA,
        user: 'user1',
        text: 'Message A2',
        isCreatedByUser: false,
        updatedAt: new Date('2026-06-01'),
        createdAt: new Date('2026-06-01'),
      },
      {
        messageId: uuidv4(),
        conversationId: convoB,
        user: 'user1',
        text: 'Message B only',
        isCreatedByUser: true,
        updatedAt: new Date('2026-03-01'),
        createdAt: new Date('2026-03-01'),
      },
    ]);

    const results = await Message.aggregate(buildLatestMessagePipeline('user1', [convoA, convoB]));

    expect(results).toHaveLength(2);
    const byConvo = {};
    for (const r of results) {
      byConvo[r._id] = r.message;
    }
    expect(byConvo[convoA].text).toBe('Message A2');
    expect(byConvo[convoB].text).toBe('Message B only');
  });

  it('should return empty array when no messages match', async () => {
    const results = await Message.aggregate(buildLatestMessagePipeline('user1', [uuidv4()]));
    expect(results).toHaveLength(0);
  });

  it('should scope results to the specified user', async () => {
    const convoId = uuidv4();

    await Message.create({
      messageId: uuidv4(),
      conversationId: convoId,
      user: 'other-user',
      text: 'Wrong user message',
      isCreatedByUser: true,
    });
    await Message.create({
      messageId: uuidv4(),
      conversationId: convoId,
      user: 'user1',
      text: 'Correct user message',
      isCreatedByUser: true,
    });

    const results = await Message.aggregate(buildLatestMessagePipeline('user1', [convoId]));

    expect(results).toHaveLength(1);
    expect(results[0].message.text).toBe('Correct user message');
  });
});

describe('Zero-message title-only conversation handling', () => {
  it('should identify title-only conversations that have no messages in aggregation', async () => {
    const withMsgsId = uuidv4();
    const emptyConvoId = uuidv4();

    await Conversation.create({
      conversationId: withMsgsId,
      user: 'user1',
      title: 'Has messages',
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-4',
      expiredAt: null,
    });
    await Conversation.create({
      conversationId: emptyConvoId,
      user: 'user1',
      title: 'Empty convo',
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-4',
      expiredAt: null,
    });

    await Message.create({
      messageId: uuidv4(),
      conversationId: withMsgsId,
      user: 'user1',
      text: 'A real message',
      isCreatedByUser: true,
    });

    const convoSpy = jest.spyOn(Conversation, 'meiliSearch').mockResolvedValue({
      hits: [{ conversationId: withMsgsId }, { conversationId: emptyConvoId }],
    });
    const msgSpy = jest.spyOn(Message, 'meiliSearch').mockResolvedValue({ hits: [] });

    try {
      const { conversationIds } = await searchConversationsAndMessages('test', 'user1');
      const convoRefs = [...conversationIds].map((id) => ({ conversationId: id }));
      const result = await getConvosQueried('user1', convoRefs, null, convoRefs.length);

      const titleOnlyIds = [withMsgsId, emptyConvoId];
      const aggregated = await Message.aggregate(buildLatestMessagePipeline('user1', titleOnlyIds));

      const coveredIds = new Set(aggregated.map((e) => e._id));
      expect(coveredIds.has(withMsgsId)).toBe(true);
      expect(coveredIds.has(emptyConvoId)).toBe(false);

      const uncoveredIds = titleOnlyIds.filter((id) => !coveredIds.has(id));
      expect(uncoveredIds).toEqual([emptyConvoId]);

      const convo = result.convoMap[emptyConvoId];
      expect(convo).toBeDefined();
      expect(convo.title).toBe('Empty convo');
    } finally {
      convoSpy.mockRestore();
      msgSpy.mockRestore();
    }
  });
});
