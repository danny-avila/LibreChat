const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { EModelEndpoint } = require('librechat-data-provider');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { searchConversationsAndMessages } = require('./search');
const { getConvosQueried } = require('./Conversation');
const { Conversation, Message } = require('~/db/models');

describe('searchConversationsAndMessages', () => {
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
    if (!Conversation.meiliSearch) {
      Conversation.meiliSearch = () => Promise.resolve({ hits: [] });
    }
    if (!Message.meiliSearch) {
      Message.meiliSearch = () => Promise.resolve({ hits: [] });
    }
  });

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
});

describe('Search + getConvosQueried integration', () => {
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
    if (!Conversation.meiliSearch) {
      Conversation.meiliSearch = () => Promise.resolve({ hits: [] });
    }
    if (!Message.meiliSearch) {
      Message.meiliSearch = () => Promise.resolve({ hits: [] });
    }
  });

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
