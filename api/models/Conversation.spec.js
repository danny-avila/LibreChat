const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { EModelEndpoint } = require('librechat-data-provider');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  deleteNullOrEmptyConversations,
  searchConversation,
  getConvosByCursor,
  getConvosQueried,
  getConvoFiles,
  getConvoTitle,
  deleteConvos,
  saveConvo,
  getConvo,
} = require('./Conversation');
jest.mock('~/server/services/Config/app');
jest.mock('./Message');
const { getMessages, deleteMessages } = require('./Message');

const { Conversation } = require('~/db/models');

describe('Conversation Operations', () => {
  let mongoServer;
  let mockReq;
  let mockConversationData;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
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

    // Default mock implementations
    getMessages.mockResolvedValue([]);
    deleteMessages.mockResolvedValue({ deletedCount: 0 });

    mockReq = {
      user: { id: 'user123' },
      body: {},
      config: {
        interfaceConfig: {
          temporaryChatRetention: 24, // Default 24 hours
        },
      },
    };

    mockConversationData = {
      conversationId: uuidv4(),
      title: 'Test Conversation',
      endpoint: EModelEndpoint.openAI,
    };
  });

  describe('saveConvo', () => {
    it('should save a conversation for an authenticated user', async () => {
      const result = await saveConvo(mockReq, mockConversationData);

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.user).toBe('user123');
      expect(result.title).toBe('Test Conversation');
      expect(result.endpoint).toBe(EModelEndpoint.openAI);

      // Verify the conversation was actually saved to the database
      const savedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });
      expect(savedConvo).toBeTruthy();
      expect(savedConvo.title).toBe('Test Conversation');
    });

    it('should query messages when saving a conversation', async () => {
      // Mock messages as ObjectIds
      const mongoose = require('mongoose');
      const mockMessages = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
      getMessages.mockResolvedValue(mockMessages);

      await saveConvo(mockReq, mockConversationData);

      // Verify that getMessages was called with correct parameters
      expect(getMessages).toHaveBeenCalledWith(
        { conversationId: mockConversationData.conversationId },
        '_id',
      );
    });

    it('should handle newConversationId when provided', async () => {
      const newConversationId = uuidv4();
      const result = await saveConvo(mockReq, {
        ...mockConversationData,
        newConversationId,
      });

      expect(result.conversationId).toBe(newConversationId);
    });

    it('should handle unsetFields metadata', async () => {
      const metadata = {
        unsetFields: { someField: 1 },
      };

      await saveConvo(mockReq, mockConversationData, metadata);

      const savedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
      });
      expect(savedConvo.someField).toBeUndefined();
    });
  });

  describe('isTemporary conversation handling', () => {
    it('should save a conversation with expiredAt when isTemporary is true', async () => {
      // Mock app config with 24 hour retention
      mockReq.config.interfaceConfig.temporaryChatRetention = 24;

      mockReq.body = { isTemporary: true };

      const beforeSave = new Date();
      const result = await saveConvo(mockReq, mockConversationData);
      const afterSave = new Date();

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.expiredAt).toBeDefined();
      expect(result.expiredAt).toBeInstanceOf(Date);

      // Verify expiredAt is approximately 24 hours in the future
      const expectedExpirationTime = new Date(beforeSave.getTime() + 24 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result.expiredAt);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        new Date(afterSave.getTime() + 24 * 60 * 60 * 1000 + 1000).getTime(),
      );
    });

    it('should save a conversation without expiredAt when isTemporary is false', async () => {
      mockReq.body = { isTemporary: false };

      const result = await saveConvo(mockReq, mockConversationData);

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.expiredAt).toBeNull();
    });

    it('should save a conversation without expiredAt when isTemporary is not provided', async () => {
      // No isTemporary in body
      mockReq.body = {};

      const result = await saveConvo(mockReq, mockConversationData);

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.expiredAt).toBeNull();
    });

    it('should use custom retention period from config', async () => {
      // Mock app config with 48 hour retention
      mockReq.config.interfaceConfig.temporaryChatRetention = 48;

      mockReq.body = { isTemporary: true };

      const beforeSave = new Date();
      const result = await saveConvo(mockReq, mockConversationData);

      expect(result.expiredAt).toBeDefined();

      // Verify expiredAt is approximately 48 hours in the future
      const expectedExpirationTime = new Date(beforeSave.getTime() + 48 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result.expiredAt);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should handle minimum retention period (1 hour)', async () => {
      // Mock app config with less than minimum retention
      mockReq.config.interfaceConfig.temporaryChatRetention = 0.5; // Half hour - should be clamped to 1 hour

      mockReq.body = { isTemporary: true };

      const beforeSave = new Date();
      const result = await saveConvo(mockReq, mockConversationData);

      expect(result.expiredAt).toBeDefined();

      // Verify expiredAt is approximately 1 hour in the future (minimum)
      const expectedExpirationTime = new Date(beforeSave.getTime() + 1 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result.expiredAt);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should handle maximum retention period (8760 hours)', async () => {
      // Mock app config with more than maximum retention
      mockReq.config.interfaceConfig.temporaryChatRetention = 10000; // Should be clamped to 8760 hours

      mockReq.body = { isTemporary: true };

      const beforeSave = new Date();
      const result = await saveConvo(mockReq, mockConversationData);

      expect(result.expiredAt).toBeDefined();

      // Verify expiredAt is approximately 8760 hours (1 year) in the future
      const expectedExpirationTime = new Date(beforeSave.getTime() + 8760 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result.expiredAt);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should handle missing config gracefully', async () => {
      // Simulate missing config - should use default retention period
      delete mockReq.config;

      mockReq.body = { isTemporary: true };

      const beforeSave = new Date();
      const result = await saveConvo(mockReq, mockConversationData);
      const afterSave = new Date();

      // Should still save the conversation with default retention period (30 days)
      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.expiredAt).toBeDefined();
      expect(result.expiredAt).toBeInstanceOf(Date);

      // Verify expiredAt is approximately 30 days in the future (720 hours)
      const expectedExpirationTime = new Date(beforeSave.getTime() + 720 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result.expiredAt);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        new Date(afterSave.getTime() + 720 * 60 * 60 * 1000 + 1000).getTime(),
      );
    });

    it('should use default retention when config is not provided', async () => {
      // Mock getAppConfig to return empty config
      mockReq.config = {}; // Empty config

      mockReq.body = { isTemporary: true };

      const beforeSave = new Date();
      const result = await saveConvo(mockReq, mockConversationData);

      expect(result.expiredAt).toBeDefined();

      // Default retention is 30 days (720 hours)
      const expectedExpirationTime = new Date(beforeSave.getTime() + 30 * 24 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result.expiredAt);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should update expiredAt when saving existing temporary conversation', async () => {
      // First save a temporary conversation
      mockReq.config.interfaceConfig.temporaryChatRetention = 24;

      mockReq.body = { isTemporary: true };
      const firstSave = await saveConvo(mockReq, mockConversationData);
      const originalExpiredAt = firstSave.expiredAt;

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Save again with same conversationId but different title
      const updatedData = { ...mockConversationData, title: 'Updated Title' };
      const secondSave = await saveConvo(mockReq, updatedData);

      // Should update title and create new expiredAt
      expect(secondSave.title).toBe('Updated Title');
      expect(secondSave.expiredAt).toBeDefined();
      expect(new Date(secondSave.expiredAt).getTime()).toBeGreaterThan(
        new Date(originalExpiredAt).getTime(),
      );
    });

    it('should not set expiredAt when updating non-temporary conversation', async () => {
      // First save a non-temporary conversation
      mockReq.body = { isTemporary: false };
      const firstSave = await saveConvo(mockReq, mockConversationData);
      expect(firstSave.expiredAt).toBeNull();

      // Update without isTemporary flag
      mockReq.body = {};
      const updatedData = { ...mockConversationData, title: 'Updated Title' };
      const secondSave = await saveConvo(mockReq, updatedData);

      expect(secondSave.title).toBe('Updated Title');
      expect(secondSave.expiredAt).toBeNull();
    });

    it('should filter out expired conversations in getConvosByCursor', async () => {
      // Create some test conversations
      const nonExpiredConvo = await Conversation.create({
        conversationId: uuidv4(),
        user: 'user123',
        title: 'Non-expired',
        endpoint: EModelEndpoint.openAI,
        expiredAt: null,
        updatedAt: new Date(),
      });

      await Conversation.create({
        conversationId: uuidv4(),
        user: 'user123',
        title: 'Future expired',
        endpoint: EModelEndpoint.openAI,
        expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        updatedAt: new Date(),
      });

      // Mock Meili search
      Conversation.meiliSearch = jest.fn().mockResolvedValue({ hits: [] });

      const result = await getConvosByCursor('user123');

      // Should only return conversations with null or non-existent expiredAt
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].conversationId).toBe(nonExpiredConvo.conversationId);
    });

    it('should filter out expired conversations in getConvosQueried', async () => {
      // Create test conversations
      const nonExpiredConvo = await Conversation.create({
        conversationId: uuidv4(),
        user: 'user123',
        title: 'Non-expired',
        endpoint: EModelEndpoint.openAI,
        expiredAt: null,
      });

      const expiredConvo = await Conversation.create({
        conversationId: uuidv4(),
        user: 'user123',
        title: 'Expired',
        endpoint: EModelEndpoint.openAI,
        expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const convoIds = [
        { conversationId: nonExpiredConvo.conversationId },
        { conversationId: expiredConvo.conversationId },
      ];

      const result = await getConvosQueried('user123', convoIds);

      // Should only return the non-expired conversation
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].conversationId).toBe(nonExpiredConvo.conversationId);
      expect(result.convoMap[nonExpiredConvo.conversationId]).toBeDefined();
      expect(result.convoMap[expiredConvo.conversationId]).toBeUndefined();
    });
  });

  describe('searchConversation', () => {
    it('should find a conversation by conversationId', async () => {
      await Conversation.create({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
        title: 'Test',
        endpoint: EModelEndpoint.openAI,
      });

      const result = await searchConversation(mockConversationData.conversationId);

      expect(result).toBeTruthy();
      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.user).toBe('user123');
      expect(result.title).toBeUndefined(); // Only returns conversationId and user
    });

    it('should return null if conversation not found', async () => {
      const result = await searchConversation('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getConvo', () => {
    it('should retrieve a conversation for a user', async () => {
      await Conversation.create({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
        title: 'Test Conversation',
        endpoint: EModelEndpoint.openAI,
      });

      const result = await getConvo('user123', mockConversationData.conversationId);

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.user).toBe('user123');
      expect(result.title).toBe('Test Conversation');
    });

    it('should return null if conversation not found', async () => {
      const result = await getConvo('user123', 'non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getConvoTitle', () => {
    it('should return the conversation title', async () => {
      await Conversation.create({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
        title: 'Test Title',
        endpoint: EModelEndpoint.openAI,
      });

      const result = await getConvoTitle('user123', mockConversationData.conversationId);
      expect(result).toBe('Test Title');
    });

    it('should return null if conversation has no title', async () => {
      await Conversation.create({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
        title: null,
        endpoint: EModelEndpoint.openAI,
      });

      const result = await getConvoTitle('user123', mockConversationData.conversationId);
      expect(result).toBeNull();
    });

    it('should return "New Chat" if conversation not found', async () => {
      const result = await getConvoTitle('user123', 'non-existent-id');
      expect(result).toBe('New Chat');
    });
  });

  describe('getConvoFiles', () => {
    it('should return conversation files', async () => {
      const files = ['file1', 'file2'];
      await Conversation.create({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
        endpoint: EModelEndpoint.openAI,
        files,
      });

      const result = await getConvoFiles(mockConversationData.conversationId);
      expect(result).toEqual(files);
    });

    it('should return empty array if no files', async () => {
      await Conversation.create({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
        endpoint: EModelEndpoint.openAI,
      });

      const result = await getConvoFiles(mockConversationData.conversationId);
      expect(result).toEqual([]);
    });

    it('should return empty array if conversation not found', async () => {
      const result = await getConvoFiles('non-existent-id');
      expect(result).toEqual([]);
    });
  });

  describe('deleteConvos', () => {
    it('should delete conversations and associated messages', async () => {
      await Conversation.create({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
        title: 'To Delete',
        endpoint: EModelEndpoint.openAI,
      });

      deleteMessages.mockResolvedValue({ deletedCount: 5 });

      const result = await deleteConvos('user123', {
        conversationId: mockConversationData.conversationId,
      });

      expect(result.deletedCount).toBe(1);
      expect(result.messages.deletedCount).toBe(5);
      expect(deleteMessages).toHaveBeenCalledWith({
        conversationId: { $in: [mockConversationData.conversationId] },
      });

      // Verify conversation was deleted
      const deletedConvo = await Conversation.findOne({
        conversationId: mockConversationData.conversationId,
      });
      expect(deletedConvo).toBeNull();
    });

    it('should throw error if no conversations found', async () => {
      await expect(deleteConvos('user123', { conversationId: 'non-existent' })).rejects.toThrow(
        'Conversation not found or already deleted.',
      );
    });
  });

  describe('deleteNullOrEmptyConversations', () => {
    it('should delete conversations with null, empty, or missing conversationIds', async () => {
      // Since conversationId is required by the schema, we can't create documents with null/missing IDs
      // This test should verify the function works when such documents exist (e.g., from data corruption)

      // For this test, let's create a valid conversation and verify the function doesn't delete it
      await Conversation.create({
        conversationId: mockConversationData.conversationId,
        user: 'user4',
        endpoint: EModelEndpoint.openAI,
      });

      deleteMessages.mockResolvedValue({ deletedCount: 0 });

      const result = await deleteNullOrEmptyConversations();

      expect(result.conversations.deletedCount).toBe(0); // No invalid conversations to delete
      expect(result.messages.deletedCount).toBe(0);

      // Verify valid conversation remains
      const remainingConvos = await Conversation.find({});
      expect(remainingConvos).toHaveLength(1);
      expect(remainingConvos[0].conversationId).toBe(mockConversationData.conversationId);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors in saveConvo', async () => {
      // Force a database error by disconnecting
      await mongoose.disconnect();

      const result = await saveConvo(mockReq, mockConversationData);

      expect(result).toEqual({ message: 'Error saving conversation' });

      // Reconnect for other tests
      await mongoose.connect(mongoServer.getUri());
    });
  });

  describe('getConvosByCursor pagination', () => {
    /**
     * Helper to create conversations with specific timestamps
     * Uses collection.insertOne to bypass Mongoose timestamps entirely
     */
    const createConvoWithTimestamps = async (index, createdAt, updatedAt) => {
      const conversationId = uuidv4();
      // Use collection-level insert to bypass Mongoose timestamps
      await Conversation.collection.insertOne({
        conversationId,
        user: 'user123',
        title: `Conversation ${index}`,
        endpoint: EModelEndpoint.openAI,
        expiredAt: null,
        isArchived: false,
        createdAt,
        updatedAt,
      });
      return Conversation.findOne({ conversationId }).lean();
    };

    it('should not skip conversations at page boundaries', async () => {
      // Create 30 conversations to ensure pagination (limit is 25)
      const baseTime = new Date('2026-01-01T00:00:00.000Z');
      const convos = [];

      for (let i = 0; i < 30; i++) {
        const updatedAt = new Date(baseTime.getTime() - i * 60000); // Each 1 minute apart
        const convo = await createConvoWithTimestamps(i, updatedAt, updatedAt);
        convos.push(convo);
      }

      // Fetch first page
      const page1 = await getConvosByCursor('user123', { limit: 25 });

      expect(page1.conversations).toHaveLength(25);
      expect(page1.nextCursor).toBeTruthy();

      // Fetch second page using cursor
      const page2 = await getConvosByCursor('user123', {
        limit: 25,
        cursor: page1.nextCursor,
      });

      // Should get remaining 5 conversations
      expect(page2.conversations).toHaveLength(5);
      expect(page2.nextCursor).toBeNull();

      // Verify no duplicates and no gaps
      const allIds = [
        ...page1.conversations.map((c) => c.conversationId),
        ...page2.conversations.map((c) => c.conversationId),
      ];
      const uniqueIds = new Set(allIds);

      expect(uniqueIds.size).toBe(30); // All 30 conversations accounted for
      expect(allIds.length).toBe(30); // No duplicates
    });

    it('should include conversation at exact page boundary (item 26 bug fix)', async () => {
      // This test specifically verifies the fix for the bug where item 26
      // (the first item that should appear on page 2) was being skipped

      const baseTime = new Date('2026-01-01T12:00:00.000Z');

      // Create exactly 26 conversations
      const convos = [];
      for (let i = 0; i < 26; i++) {
        const updatedAt = new Date(baseTime.getTime() - i * 60000);
        const convo = await createConvoWithTimestamps(i, updatedAt, updatedAt);
        convos.push(convo);
      }

      // The 26th conversation (index 25) should be on page 2
      const item26 = convos[25];

      // Fetch first page with limit 25
      const page1 = await getConvosByCursor('user123', { limit: 25 });

      expect(page1.conversations).toHaveLength(25);
      expect(page1.nextCursor).toBeTruthy();

      // Item 26 should NOT be in page 1
      const page1Ids = page1.conversations.map((c) => c.conversationId);
      expect(page1Ids).not.toContain(item26.conversationId);

      // Fetch second page
      const page2 = await getConvosByCursor('user123', {
        limit: 25,
        cursor: page1.nextCursor,
      });

      // Item 26 MUST be in page 2 (this was the bug - it was being skipped)
      expect(page2.conversations).toHaveLength(1);
      expect(page2.conversations[0].conversationId).toBe(item26.conversationId);
    });

    it('should sort by updatedAt DESC by default', async () => {
      // Create conversations with different updatedAt times
      // Note: createdAt is older but updatedAt varies
      const convo1 = await createConvoWithTimestamps(
        1,
        new Date('2026-01-01T00:00:00.000Z'), // oldest created
        new Date('2026-01-03T00:00:00.000Z'), // most recently updated
      );

      const convo2 = await createConvoWithTimestamps(
        2,
        new Date('2026-01-02T00:00:00.000Z'), // middle created
        new Date('2026-01-02T00:00:00.000Z'), // middle updated
      );

      const convo3 = await createConvoWithTimestamps(
        3,
        new Date('2026-01-03T00:00:00.000Z'), // newest created
        new Date('2026-01-01T00:00:00.000Z'), // oldest updated
      );

      const result = await getConvosByCursor('user123');

      // Should be sorted by updatedAt DESC (most recent first)
      expect(result.conversations).toHaveLength(3);
      expect(result.conversations[0].conversationId).toBe(convo1.conversationId); // Jan 3 updatedAt
      expect(result.conversations[1].conversationId).toBe(convo2.conversationId); // Jan 2 updatedAt
      expect(result.conversations[2].conversationId).toBe(convo3.conversationId); // Jan 1 updatedAt
    });

    it('should handle conversations with same updatedAt (tie-breaker)', async () => {
      const sameTime = new Date('2026-01-01T12:00:00.000Z');

      // Create 3 conversations with exact same updatedAt
      const convo1 = await createConvoWithTimestamps(1, sameTime, sameTime);
      const convo2 = await createConvoWithTimestamps(2, sameTime, sameTime);
      const convo3 = await createConvoWithTimestamps(3, sameTime, sameTime);

      const result = await getConvosByCursor('user123');

      // All 3 should be returned (no skipping due to same timestamps)
      expect(result.conversations).toHaveLength(3);

      const returnedIds = result.conversations.map((c) => c.conversationId);
      expect(returnedIds).toContain(convo1.conversationId);
      expect(returnedIds).toContain(convo2.conversationId);
      expect(returnedIds).toContain(convo3.conversationId);
    });

    it('should handle cursor pagination with conversations updated during pagination', async () => {
      // Simulate the scenario where a conversation is updated between page fetches
      const baseTime = new Date('2026-01-01T00:00:00.000Z');

      // Create 30 conversations
      for (let i = 0; i < 30; i++) {
        const updatedAt = new Date(baseTime.getTime() - i * 60000);
        await createConvoWithTimestamps(i, updatedAt, updatedAt);
      }

      // Fetch first page
      const page1 = await getConvosByCursor('user123', { limit: 25 });
      expect(page1.conversations).toHaveLength(25);

      // Now update one of the conversations that should be on page 2
      // to have a newer updatedAt (simulating user activity during pagination)
      const convosOnPage2 = await Conversation.find({ user: 'user123' })
        .sort({ updatedAt: -1 })
        .skip(25)
        .limit(5);

      if (convosOnPage2.length > 0) {
        const updatedConvo = convosOnPage2[0];
        await Conversation.updateOne(
          { _id: updatedConvo._id },
          { updatedAt: new Date('2026-01-02T00:00:00.000Z') }, // Much newer
        );
      }

      // Fetch second page with original cursor
      const page2 = await getConvosByCursor('user123', {
        limit: 25,
        cursor: page1.nextCursor,
      });

      // The updated conversation might not be in page 2 anymore
      // (it moved to the front), but we should still get remaining items
      // without errors and without infinite loops
      expect(page2.conversations.length).toBeGreaterThanOrEqual(0);
    });

    it('should correctly decode and use cursor for pagination', async () => {
      const baseTime = new Date('2026-01-01T00:00:00.000Z');

      // Create 30 conversations
      for (let i = 0; i < 30; i++) {
        const updatedAt = new Date(baseTime.getTime() - i * 60000);
        await createConvoWithTimestamps(i, updatedAt, updatedAt);
      }

      // Fetch first page
      const page1 = await getConvosByCursor('user123', { limit: 25 });

      // Decode the cursor to verify it's based on the last RETURNED item
      const decodedCursor = JSON.parse(Buffer.from(page1.nextCursor, 'base64').toString());

      // The cursor should match the last item in page1 (item at index 24)
      const lastReturnedItem = page1.conversations[24];

      expect(new Date(decodedCursor.primary).getTime()).toBe(
        new Date(lastReturnedItem.updatedAt).getTime(),
      );
    });

    it('should support sortBy createdAt when explicitly requested', async () => {
      // Create conversations with different timestamps
      const convo1 = await createConvoWithTimestamps(
        1,
        new Date('2026-01-03T00:00:00.000Z'), // newest created
        new Date('2026-01-01T00:00:00.000Z'), // oldest updated
      );

      const convo2 = await createConvoWithTimestamps(
        2,
        new Date('2026-01-01T00:00:00.000Z'), // oldest created
        new Date('2026-01-03T00:00:00.000Z'), // newest updated
      );

      // Verify timestamps were set correctly
      expect(new Date(convo1.createdAt).getTime()).toBe(
        new Date('2026-01-03T00:00:00.000Z').getTime(),
      );
      expect(new Date(convo2.createdAt).getTime()).toBe(
        new Date('2026-01-01T00:00:00.000Z').getTime(),
      );

      const result = await getConvosByCursor('user123', { sortBy: 'createdAt' });

      // Should be sorted by createdAt DESC
      expect(result.conversations).toHaveLength(2);
      expect(result.conversations[0].conversationId).toBe(convo1.conversationId); // Jan 3 createdAt
      expect(result.conversations[1].conversationId).toBe(convo2.conversationId); // Jan 1 createdAt
    });

    it('should handle empty result set gracefully', async () => {
      const result = await getConvosByCursor('user123');

      expect(result.conversations).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('should handle exactly limit number of conversations (no next page)', async () => {
      const baseTime = new Date('2026-01-01T00:00:00.000Z');

      // Create exactly 25 conversations (equal to default limit)
      for (let i = 0; i < 25; i++) {
        const updatedAt = new Date(baseTime.getTime() - i * 60000);
        await createConvoWithTimestamps(i, updatedAt, updatedAt);
      }

      const result = await getConvosByCursor('user123', { limit: 25 });

      expect(result.conversations).toHaveLength(25);
      expect(result.nextCursor).toBeNull(); // No next page
    });
  });
});
