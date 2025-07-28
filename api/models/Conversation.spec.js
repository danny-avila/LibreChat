const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { v4: uuidv4 } = require('uuid');
const { conversationSchema } = require('@librechat/data-schemas');

const {
  saveConvo,
  getConvo,
  searchConversation,
  getConvoFiles,
  deleteConvos,
  getConvosByCursor,
  getConvoTitle,
  bulkSaveConvos,
  deleteNullOrEmptyConversations,
} = require('./Conversation');

// Mock the createTempChatExpirationDate function
jest.mock('@librechat/api', () => ({
  createTempChatExpirationDate: jest.fn(),
}));

// Mock the getCustomConfig function
jest.mock('~/server/services/Config', () => ({
  getCustomConfig: jest.fn(),
}));

// Mock the getMessages function
jest.mock('./Message', () => ({
  getMessages: jest.fn(),
  deleteMessages: jest.fn(),
}));

const { createTempChatExpirationDate } = require('@librechat/api');
const { getCustomConfig } = require('~/server/services/Config');
const { getMessages, deleteMessages } = require('./Message');

/**
 * @type {import('mongoose').Model<import('@librechat/data-schemas').IConversation>}
 */
let Conversation;

describe('Conversation Operations', () => {
  let mongoServer;
  let mockReq;
  let mockConversationData;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    Conversation =
      mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear database
    await Conversation.deleteMany({});

    // Reset mocks
    jest.clearAllMocks();

    // Mock messages with proper ObjectIds
    const mongoose = require('mongoose');
    getMessages.mockResolvedValue([
      { _id: new mongoose.Types.ObjectId() },
      { _id: new mongoose.Types.ObjectId() },
    ]);

    mockReq = {
      user: { id: 'user123' },
    };

    mockConversationData = {
      conversationId: uuidv4(),
      title: 'Test Conversation',
      endpoint: 'openAI',
      user: 'user123',
    };
  });

  describe('saveConvo', () => {
    it('should save a conversation for an authenticated user', async () => {
      const result = await saveConvo(mockReq, mockConversationData, null);

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.user).toBe('user123');
      expect(result.title).toBe('Test Conversation');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toHaveProperty('_id');
      expect(result.messages[1]).toHaveProperty('_id');

      // Verify the conversation was actually saved to the database
      const savedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });
      expect(savedConvo).toBeTruthy();
      expect(savedConvo.title).toBe('Test Conversation');
    });

    it('should handle newConversationId when provided', async () => {
      const newConversationId = uuidv4();
      const dataWithNewId = {
        ...mockConversationData,
        newConversationId,
      };

      const result = await saveConvo(mockReq, dataWithNewId, null);

      expect(result.conversationId).toBe(newConversationId);

      // Verify the conversation was saved with the new ID
      const savedConvo = await Conversation.findOne({
        conversationId: newConversationId,
        user: 'user123',
      });
      expect(savedConvo).toBeTruthy();
      expect(savedConvo.conversationId).toBe(newConversationId);
    });

    it('should handle metadata with unsetFields', async () => {
      // First, save a conversation with some fields that can be unset
      const conversationWithFields = {
        ...mockConversationData,
        model: 'gpt-4',
        agent_id: 'agent-123',
        iconURL: 'https://example.com/icon.png',
      };

      await saveConvo(mockReq, conversationWithFields, null);

      // Verify the fields were saved
      let savedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });
      expect(savedConvo.model).toBe('gpt-4');
      expect(savedConvo.agent_id).toBe('agent-123');
      expect(savedConvo.iconURL).toBe('https://example.com/icon.png');

      // Now update the conversation with unsetFields metadata to remove model and agent_id but keep iconURL
      const metadata = {
        context: 'test-context',
        unsetFields: {
          model: 1,
          agent_id: 1,
        },
      };

      const updateData = {
        conversationId: mockConversationData.conversationId,
        title: 'Updated Title',
      };

      const result = await saveConvo(mockReq, updateData, metadata);

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.user).toBe('user123');
      expect(result.title).toBe('Updated Title');

      // Verify the specified fields were unset from the database
      savedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });

      expect(savedConvo.model).toBeUndefined();
      expect(savedConvo.agent_id).toBeUndefined();
      expect(savedConvo.iconURL).toBe('https://example.com/icon.png'); // This should still be there
      expect(savedConvo.title).toBe('Updated Title'); // This should be updated
    });
  });

  describe('saveConvo - Temporary Conversation Behavior', () => {
    it('should set expiredAt when isTemporary is true with default config', async () => {
      // Set up the integration: getCustomConfig returns default config
      const defaultConfig = { interface: { temporaryChatRetention: 24 } };
      getCustomConfig.mockResolvedValue(defaultConfig);

      const mockExpirationDate = new Date('2024-12-31T23:59:59.000Z');
      createTempChatExpirationDate.mockReturnValue(mockExpirationDate);

      const tempReq = {
        user: { id: 'user123' },
        body: { isTemporary: true },
      };

      const result = await saveConvo(tempReq, mockConversationData, null);

      // Test the integration: verify the config was passed through correctly
      expect(getCustomConfig).toHaveBeenCalled();
      expect(createTempChatExpirationDate).toHaveBeenCalledWith(defaultConfig);
      expect(result.expiredAt).toEqual(mockExpirationDate);

      // Verify the conversation was saved with the correct expiredAt value
      const savedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });
      expect(savedConvo.expiredAt).toEqual(mockExpirationDate);
    });

    it('should set expiredAt when isTemporary is true with custom config', async () => {
      // Test with different config values to ensure the integration works
      const customConfig = { interface: { temporaryChatRetention: 72 } };
      getCustomConfig.mockResolvedValue(customConfig);

      const mockExpirationDate = new Date('2025-01-02T23:59:59.000Z');
      createTempChatExpirationDate.mockReturnValue(mockExpirationDate);

      const tempReq = {
        user: { id: 'user123' },
        body: { isTemporary: true },
      };

      const result = await saveConvo(tempReq, mockConversationData, null);

      // Test the integration: verify the custom config was passed through
      expect(getCustomConfig).toHaveBeenCalled();
      expect(createTempChatExpirationDate).toHaveBeenCalledWith(customConfig);
      expect(result.expiredAt).toEqual(mockExpirationDate);

      // Verify the conversation was saved with the correct expiredAt value
      const savedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });
      expect(savedConvo.expiredAt).toEqual(mockExpirationDate);
    });

    it('should set expiredAt to null when isTemporary is false', async () => {
      // Set up getCustomConfig even though it shouldn't be called
      getCustomConfig.mockResolvedValue({ interface: { temporaryChatRetention: 24 } });

      const tempReq = {
        user: { id: 'user123' },
        body: { isTemporary: false },
      };

      const result = await saveConvo(tempReq, mockConversationData, null);

      // Verify the integration: config should not be fetched for non-temporary conversations
      expect(getCustomConfig).not.toHaveBeenCalled();
      expect(createTempChatExpirationDate).not.toHaveBeenCalled();
      expect(result.expiredAt).toBeNull();

      // Verify the conversation was saved with expiredAt as null
      const savedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });
      expect(savedConvo.expiredAt).toBeNull();
    });

    it('should set expiredAt to null when isTemporary is not set', async () => {
      // Set up getCustomConfig even though it shouldn't be called
      getCustomConfig.mockResolvedValue({ interface: { temporaryChatRetention: 24 } });

      const result = await saveConvo(mockReq, mockConversationData, null);

      // Verify the integration: config should not be fetched when isTemporary is undefined
      expect(getCustomConfig).not.toHaveBeenCalled();
      expect(createTempChatExpirationDate).not.toHaveBeenCalled();
      expect(result.expiredAt).toBeNull();
    });

    it('should handle getCustomConfig error gracefully', async () => {
      // Test integration error handling: what happens when getCustomConfig fails
      getCustomConfig.mockRejectedValue(new Error('Config service unavailable'));

      const tempReq = {
        user: { id: 'user123' },
        body: { isTemporary: true },
      };

      const result = await saveConvo(tempReq, mockConversationData, null);

      // Verify the integration: config was attempted but failed
      expect(getCustomConfig).toHaveBeenCalled();
      expect(createTempChatExpirationDate).not.toHaveBeenCalled();
      expect(result.expiredAt).toBeNull();

      // Verify the conversation was saved with expiredAt as null (graceful degradation)
      const savedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });
      expect(savedConvo.expiredAt).toBeNull();
    });

    it('should handle createTempChatExpirationDate error gracefully', async () => {
      const validConfig = { interface: { temporaryChatRetention: 48 } };
      getCustomConfig.mockResolvedValue(validConfig);
      createTempChatExpirationDate.mockImplementation(() => {
        throw new Error('Date calculation error');
      });

      const tempReq = {
        user: { id: 'user123' },
        body: { isTemporary: true },
      };

      const result = await saveConvo(tempReq, mockConversationData, null);

      // Verify the integration: config was fetched and passed, but date creation failed
      expect(getCustomConfig).toHaveBeenCalled();
      expect(createTempChatExpirationDate).toHaveBeenCalledWith(validConfig);
      expect(result.expiredAt).toBeNull();

      // Verify graceful degradation: conversation still saved without expiration
      const savedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });
      expect(savedConvo.expiredAt).toBeNull();
    });
  });

  describe('getConvo', () => {
    it('should retrieve a conversation for the specified user', async () => {
      // First, save a conversation
      await saveConvo(mockReq, mockConversationData, null);

      const result = await getConvo('user123', mockConversationData.conversationId);

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.user).toBe('user123');
      expect(result.title).toBe('Test Conversation');
    });

    it('should return null if conversation does not exist', async () => {
      const result = await getConvo('user123', 'nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('searchConversation', () => {
    it('should find conversation by conversationId', async () => {
      // First, save a conversation
      await saveConvo(mockReq, mockConversationData, null);

      const result = await searchConversation(mockConversationData.conversationId);

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.user).toBe('user123');
    });

    it('should return null if conversation does not exist', async () => {
      const result = await searchConversation('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('getConvoFiles', () => {
    it('should return files array from conversation', async () => {
      const convoWithFiles = {
        ...mockConversationData,
        files: ['file1.txt', 'file2.pdf'],
      };

      await saveConvo(mockReq, convoWithFiles, null);

      const result = await getConvoFiles(mockConversationData.conversationId);

      expect(result).toEqual(['file1.txt', 'file2.pdf']);
    });

    it('should return empty array if no files', async () => {
      await saveConvo(mockReq, mockConversationData, null);

      const result = await getConvoFiles(mockConversationData.conversationId);

      expect(result).toEqual([]);
    });
  });

  describe('getConvosByCursor', () => {
    beforeEach(async () => {
      // Save multiple conversations for testing
      const conversations = [
        {
          ...mockConversationData,
          conversationId: uuidv4(),
          title: 'Convo 1',
          updatedAt: new Date('2024-01-01'),
        },
        {
          ...mockConversationData,
          conversationId: uuidv4(),
          title: 'Convo 2',
          updatedAt: new Date('2024-01-02'),
        },
        {
          ...mockConversationData,
          conversationId: uuidv4(),
          title: 'Convo 3',
          updatedAt: new Date('2024-01-03'),
        },
      ];

      for (const convo of conversations) {
        await saveConvo(mockReq, convo, null);
      }
    });

    it('should retrieve conversations for user with default pagination', async () => {
      const result = await getConvosByCursor('user123');

      expect(result.conversations).toHaveLength(3);
      expect(result.nextCursor).toBeNull();
    });

    it('should handle pagination with limit', async () => {
      const result = await getConvosByCursor('user123', { limit: 2 });

      expect(result.conversations).toHaveLength(2);
      expect(result.nextCursor).toBeTruthy();
    });

    it('should exclude archived conversations by default', async () => {
      // Save an archived conversation
      const archivedConvo = {
        ...mockConversationData,
        conversationId: uuidv4(),
        title: 'Archived Convo',
        isArchived: true,
      };
      await saveConvo(mockReq, archivedConvo, null);

      const result = await getConvosByCursor('user123');

      // Should only return non-archived conversations
      expect(result.conversations).toHaveLength(3);
      expect(result.conversations.find((c) => c.title === 'Archived Convo')).toBeUndefined();
      expect(result.nextCursor).toBeNull();
    });

    it('should include archived conversations when requested', async () => {
      // Save an archived conversation
      const archivedConvo = {
        ...mockConversationData,
        conversationId: uuidv4(),
        title: 'Archived Convo',
        isArchived: true,
      };
      await saveConvo(mockReq, archivedConvo, null);

      const result = await getConvosByCursor('user123', { isArchived: true });

      // Should only return archived conversations
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].title).toBe('Archived Convo');
    });

    it('should exclude expired conversations', async () => {
      // Save an expired conversation
      const expiredConvo = {
        ...mockConversationData,
        conversationId: uuidv4(),
        title: 'Expired Convo',
        expiredAt: new Date('2020-01-01'), // Past date
      };
      // Create the expired conversation directly in the database to bypass saveConvo logic
      await Conversation.create({
        ...expiredConvo,
        user: 'user123',
        messages: [],
      });

      const result = await getConvosByCursor('user123');

      // Should exclude expired conversations
      expect(result.conversations).toHaveLength(3);
      expect(result.conversations.find((c) => c.title === 'Expired Convo')).toBeUndefined();
    });
  });

  describe('bulkSaveConvos', () => {
    it('should save multiple conversations in bulk', async () => {
      const conversations = [
        { ...mockConversationData, conversationId: uuidv4(), title: 'Bulk Convo 1' },
        { ...mockConversationData, conversationId: uuidv4(), title: 'Bulk Convo 2' },
        { ...mockConversationData, conversationId: uuidv4(), title: 'Bulk Convo 3' },
      ];

      const result = await bulkSaveConvos(conversations);

      expect(result.matchedCount).toBeGreaterThanOrEqual(0);
      expect(result.upsertedCount).toBeGreaterThanOrEqual(0);

      // Verify conversations were saved
      const savedConvos = await Conversation.find({ user: 'user123' });
      expect(savedConvos).toHaveLength(3);
    });
  });

  describe('deleteConvos', () => {
    it('should delete conversations and associated messages', async () => {
      // Save a conversation first
      const savedConvo = await saveConvo(mockReq, mockConversationData, null);
      expect(savedConvo.conversationId).toBeTruthy();

      const result = await deleteConvos('user123', {
        conversationId: mockConversationData.conversationId,
      });

      expect(result.deletedCount).toBe(1);

      // Verify conversation was deleted
      const deletedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });
      expect(deletedConvo).toBeNull();
    });

    it('should throw error when no conversations found', async () => {
      await expect(deleteConvos('user123', { conversationId: 'nonexistent-id' })).rejects.toThrow(
        'Conversation not found or already deleted.',
      );
    });
  });

  describe('deleteNullOrEmptyConversations', () => {
    it('should delete conversations with null or empty conversationId', async () => {
      // Create conversations using the collection directly to bypass schema validation
      const conversationsWithInvalidIds = [
        { conversationId: null, user: 'user123', title: 'Null ID', endpoint: 'openAI' },
        { conversationId: '', user: 'user123', title: 'Empty ID', endpoint: 'openAI' },
      ];

      // Insert directly into the collection bypassing mongoose validation
      await Conversation.collection.insertMany(conversationsWithInvalidIds);

      deleteMessages.mockResolvedValue({ deletedCount: 2 });

      const result = await deleteNullOrEmptyConversations();

      expect(result.conversations.deletedCount).toBe(2);
      expect(result.messages.deletedCount).toBe(2);
    });
  });

  describe('getConvoTitle', () => {
    it('should return conversation title when it exists', async () => {
      await saveConvo(mockReq, mockConversationData, null);

      const result = await getConvoTitle('user123', mockConversationData.conversationId);

      expect(result).toBe('Test Conversation');
    });

    it('should return null when conversation exists but has no title', async () => {
      // Create a conversation directly in the database with the title set to empty string
      // to bypass the schema default and simulate the ChatGPT Browser scenario
      const convoId = uuidv4();
      await Conversation.collection.insertOne({
        conversationId: convoId,
        user: 'user123',
        endpoint: 'openAI',
        messages: [],
        title: '', // Empty string should be falsy and trigger the null return
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Verify the title is an empty string in the database
      const savedConvo = await Conversation.findOne({
        conversationId: convoId,
        user: 'user123',
      });
      expect(savedConvo.title).toBe('');

      const result = await getConvoTitle('user123', convoId);
      expect(result).toBeNull();
    });

    it('should return "New Chat" when conversation does not exist', async () => {
      const result = await getConvoTitle('user123', 'nonexistent-id');

      expect(result).toBe('New Chat');
    });
  });
});
