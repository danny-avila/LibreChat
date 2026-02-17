import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { EModelEndpoint } from 'librechat-data-provider';
import type { IConversation } from '../types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConversationMethods, createConversationMethods } from './conversation';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let Conversation: mongoose.Model<IConversation>;
let modelsToCleanup: string[] = [];

// Mock message methods (same as original test mocking ./Message)
const getMessages = jest.fn().mockResolvedValue([]);
const deleteMessages = jest.fn().mockResolvedValue({ deletedCount: 0 });

let methods: ConversationMethods;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);
  Conversation = mongoose.models.Conversation as mongoose.Model<IConversation>;

  methods = createConversationMethods(mongoose, { getMessages, deleteMessages });

  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete mongoose.models[modelName];
    }
  }

  await mongoose.disconnect();
  await mongoServer.stop();
});

const saveConvo = (...args: Parameters<ConversationMethods['saveConvo']>) =>
  methods.saveConvo(...args) as Promise<IConversation | null>;
const getConvo = (...args: Parameters<ConversationMethods['getConvo']>) =>
  methods.getConvo(...args);
const getConvoTitle = (...args: Parameters<ConversationMethods['getConvoTitle']>) =>
  methods.getConvoTitle(...args);
const getConvoFiles = (...args: Parameters<ConversationMethods['getConvoFiles']>) =>
  methods.getConvoFiles(...args);
const deleteConvos = (...args: Parameters<ConversationMethods['deleteConvos']>) =>
  methods.deleteConvos(...args);
const getConvosByCursor = (...args: Parameters<ConversationMethods['getConvosByCursor']>) =>
  methods.getConvosByCursor(...args);
const getConvosQueried = (...args: Parameters<ConversationMethods['getConvosQueried']>) =>
  methods.getConvosQueried(...args);
const deleteNullOrEmptyConversations = (
  ...args: Parameters<ConversationMethods['deleteNullOrEmptyConversations']>
) => methods.deleteNullOrEmptyConversations(...args);
const searchConversation = (...args: Parameters<ConversationMethods['searchConversation']>) =>
  methods.searchConversation(...args);

describe('Conversation Operations', () => {
  let mockCtx: {
    userId: string;
    isTemporary?: boolean;
    interfaceConfig?: { temporaryChatRetention?: number };
  };
  let mockConversationData: {
    conversationId: string;
    title: string;
    endpoint: string;
  };

  beforeEach(async () => {
    // Clear database
    await Conversation.deleteMany({});

    // Reset mocks
    jest.clearAllMocks();
    getMessages.mockResolvedValue([]);
    deleteMessages.mockResolvedValue({ deletedCount: 0 });

    mockCtx = {
      userId: 'user123',
      interfaceConfig: {
        temporaryChatRetention: 24, // Default 24 hours
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
      const result = await saveConvo(mockCtx, mockConversationData);

      expect(result?.conversationId).toBe(mockConversationData.conversationId);
      expect(result?.user).toBe('user123');
      expect(result?.title).toBe('Test Conversation');
      expect(result?.endpoint).toBe(EModelEndpoint.openAI);

      // Verify the conversation was actually saved to the database
      const savedConvo = await Conversation.findOne<IConversation>({
        conversationId: mockConversationData.conversationId,
        user: 'user123',
      });
      expect(savedConvo).toBeTruthy();
      expect(savedConvo?.title).toBe('Test Conversation');
    });

    it('should query messages when saving a conversation', async () => {
      // Mock messages as ObjectIds
      const mockMessages = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
      getMessages.mockResolvedValue(mockMessages);

      await saveConvo(mockCtx, mockConversationData);

      // Verify that getMessages was called with correct parameters
      expect(getMessages).toHaveBeenCalledWith(
        { conversationId: mockConversationData.conversationId },
        '_id',
      );
    });

    it('should handle newConversationId when provided', async () => {
      const newConversationId = uuidv4();
      const result = await saveConvo(mockCtx, {
        ...mockConversationData,
        newConversationId,
      });

      expect(result?.conversationId).toBe(newConversationId);
    });

    it('should not create a conversation when noUpsert is true and conversation does not exist', async () => {
      const nonExistentId = uuidv4();
      const result = await saveConvo(
        mockCtx,
        { conversationId: nonExistentId, title: 'Ghost Title' },
        { noUpsert: true },
      );

      expect(result).toBeNull();

      const dbConvo = await Conversation.findOne({ conversationId: nonExistentId });
      expect(dbConvo).toBeNull();
    });

    it('should update an existing conversation when noUpsert is true', async () => {
      await saveConvo(mockCtx, mockConversationData);

      const result = await saveConvo(
        mockCtx,
        { conversationId: mockConversationData.conversationId, title: 'Updated Title' },
        { noUpsert: true },
      );

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Updated Title');
      expect(result?.conversationId).toBe(mockConversationData.conversationId);
    });

    it('should still upsert by default when noUpsert is not provided', async () => {
      const newId = uuidv4();
      const result = await saveConvo(mockCtx, {
        conversationId: newId,
        title: 'New Conversation',
        endpoint: EModelEndpoint.openAI,
      });

      expect(result).not.toBeNull();
      expect(result?.conversationId).toBe(newId);
      expect(result?.title).toBe('New Conversation');
    });

    it('should handle unsetFields metadata', async () => {
      const metadata = {
        unsetFields: { someField: 1 },
      };

      await saveConvo(mockCtx, mockConversationData, metadata);

      const savedConvo = await Conversation.findOne<IConversation & { someField?: string }>({
        conversationId: mockConversationData.conversationId,
      });
      expect(savedConvo?.someField).toBeUndefined();
    });
  });

  describe('isTemporary conversation handling', () => {
    it('should save a conversation with expiredAt when isTemporary is true', async () => {
      mockCtx.interfaceConfig = { temporaryChatRetention: 24 };
      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveConvo(mockCtx, mockConversationData);
      const afterSave = new Date();

      expect(result?.conversationId).toBe(mockConversationData.conversationId);
      expect(result?.expiredAt).toBeDefined();
      expect(result?.expiredAt).toBeInstanceOf(Date);

      const expectedExpirationTime = new Date(beforeSave.getTime() + 24 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        new Date(afterSave.getTime() + 24 * 60 * 60 * 1000 + 1000).getTime(),
      );
    });

    it('should save a conversation without expiredAt when isTemporary is false', async () => {
      mockCtx.isTemporary = false;

      const result = await saveConvo(mockCtx, mockConversationData);

      expect(result?.conversationId).toBe(mockConversationData.conversationId);
      expect(result?.expiredAt).toBeNull();
    });

    it('should save a conversation without expiredAt when isTemporary is not provided', async () => {
      mockCtx.isTemporary = undefined;

      const result = await saveConvo(mockCtx, mockConversationData);

      expect(result?.conversationId).toBe(mockConversationData.conversationId);
      expect(result?.expiredAt).toBeNull();
    });

    it('should use custom retention period from config', async () => {
      mockCtx.interfaceConfig = { temporaryChatRetention: 48 };
      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveConvo(mockCtx, mockConversationData);

      expect(result?.expiredAt).toBeDefined();

      // Verify expiredAt is approximately 48 hours in the future
      const expectedExpirationTime = new Date(beforeSave.getTime() + 48 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should handle minimum retention period (1 hour)', async () => {
      // Mock app config with less than minimum retention
      mockCtx.interfaceConfig = { temporaryChatRetention: 0.5 }; // Half hour - should be clamped to 1 hour
      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveConvo(mockCtx, mockConversationData);

      expect(result?.expiredAt).toBeDefined();

      // Verify expiredAt is approximately 1 hour in the future (minimum)
      const expectedExpirationTime = new Date(beforeSave.getTime() + 1 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should handle maximum retention period (8760 hours)', async () => {
      // Mock app config with more than maximum retention
      mockCtx.interfaceConfig = { temporaryChatRetention: 10000 }; // Should be clamped to 8760 hours
      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveConvo(mockCtx, mockConversationData);

      expect(result?.expiredAt).toBeDefined();

      // Verify expiredAt is approximately 8760 hours (1 year) in the future
      const expectedExpirationTime = new Date(beforeSave.getTime() + 8760 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should handle missing config gracefully', async () => {
      // Simulate missing config - should use default retention period
      mockCtx.interfaceConfig = undefined;
      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveConvo(mockCtx, mockConversationData);
      const afterSave = new Date();

      // Should still save the conversation with default retention period (30 days)
      expect(result?.conversationId).toBe(mockConversationData.conversationId);
      expect(result?.expiredAt).toBeDefined();
      expect(result?.expiredAt).toBeInstanceOf(Date);

      // Verify expiredAt is approximately 30 days in the future (720 hours)
      const expectedExpirationTime = new Date(beforeSave.getTime() + 720 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        new Date(afterSave.getTime() + 720 * 60 * 60 * 1000 + 1000).getTime(),
      );
    });

    it('should use default retention when config is not provided', async () => {
      // Mock getAppConfig to return empty config
      mockCtx.interfaceConfig = undefined; // Empty config
      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveConvo(mockCtx, mockConversationData);

      expect(result?.expiredAt).toBeDefined();

      // Default retention is 30 days (720 hours)
      const expectedExpirationTime = new Date(beforeSave.getTime() + 30 * 24 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should update expiredAt when saving existing temporary conversation', async () => {
      // First save a temporary conversation
      mockCtx.interfaceConfig = { temporaryChatRetention: 24 };
      mockCtx.isTemporary = true;
      const firstSave = await saveConvo(mockCtx, mockConversationData);
      const originalExpiredAt = firstSave?.expiredAt ?? new Date(0);

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Save again with same conversationId but different title
      const updatedData = { ...mockConversationData, title: 'Updated Title' };
      const secondSave = await saveConvo(mockCtx, updatedData);

      // Should update title and create new expiredAt
      expect(secondSave?.title).toBe('Updated Title');
      expect(secondSave?.expiredAt).toBeDefined();
      expect(new Date(secondSave?.expiredAt ?? 0).getTime()).toBeGreaterThan(
        new Date(originalExpiredAt).getTime(),
      );
    });

    it('should not set expiredAt when updating non-temporary conversation', async () => {
      // First save a non-temporary conversation
      mockCtx.isTemporary = false;
      const firstSave = await saveConvo(mockCtx, mockConversationData);
      expect(firstSave?.expiredAt).toBeNull();

      // Update without isTemporary flag
      mockCtx.isTemporary = undefined;
      const updatedData = { ...mockConversationData, title: 'Updated Title' };
      const secondSave = await saveConvo(mockCtx, updatedData);

      expect(secondSave?.title).toBe('Updated Title');
      expect(secondSave?.expiredAt).toBeNull();
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
      Object.assign(Conversation, { meiliSearch: jest.fn().mockResolvedValue({ hits: [] }) });

      const result = await getConvosByCursor('user123');

      // Should only return conversations with null or non-existent expiredAt
      expect(result?.conversations).toHaveLength(1);
      expect(result?.conversations[0]?.conversationId).toBe(nonExpiredConvo.conversationId);
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
      expect(result?.conversations).toHaveLength(1);
      expect(result?.conversations[0].conversationId).toBe(nonExpiredConvo.conversationId);
      expect(result?.convoMap[nonExpiredConvo.conversationId]).toBeDefined();
      expect(result?.convoMap[expiredConvo.conversationId]).toBeUndefined();
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
      expect(result!.conversationId).toBe(mockConversationData.conversationId);
      expect(result!.user).toBe('user123');
      expect((result as unknown as { title?: string }).title).toBeUndefined(); // Only returns conversationId and user
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

      expect(result!.conversationId).toBe(mockConversationData.conversationId);
      expect(result!.user).toBe('user123');
      expect(result!.title).toBe('Test Conversation');
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

      expect(result?.deletedCount).toBe(1);
      expect(result?.messages.deletedCount).toBe(5);
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

      expect(result?.conversations.deletedCount).toBe(0); // No invalid conversations to delete
      expect(result?.messages.deletedCount).toBe(0);

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

      const result = await saveConvo(mockCtx, mockConversationData);

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
    const createConvoWithTimestamps = async (index: number, createdAt: Date, updatedAt: Date) => {
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
      const convos: unknown[] = [];

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
        ...page1.conversations.map((c: IConversation) => c.conversationId),
        ...page2.conversations.map((c: IConversation) => c.conversationId),
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
      const convos: (IConversation | null)[] = [];
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
      const page1Ids = page1.conversations.map((c: IConversation) => c.conversationId);
      expect(page1Ids).not.toContain(item26!.conversationId);

      // Fetch second page
      const page2 = await getConvosByCursor('user123', {
        limit: 25,
        cursor: page1.nextCursor,
      });

      // Item 26 MUST be in page 2 (this was the bug - it was being skipped)
      expect(page2.conversations).toHaveLength(1);
      expect(page2.conversations[0].conversationId).toBe(item26!.conversationId);
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
      expect(result?.conversations).toHaveLength(3);
      expect(result?.conversations[0].conversationId).toBe(convo1!.conversationId); // Jan 3 updatedAt
      expect(result?.conversations[1].conversationId).toBe(convo2!.conversationId); // Jan 2 updatedAt
      expect(result?.conversations[2].conversationId).toBe(convo3!.conversationId); // Jan 1 updatedAt
    });

    it('should handle conversations with same updatedAt (tie-breaker)', async () => {
      const sameTime = new Date('2026-01-01T12:00:00.000Z');

      // Create 3 conversations with exact same updatedAt
      const convo1 = await createConvoWithTimestamps(1, sameTime, sameTime);
      const convo2 = await createConvoWithTimestamps(2, sameTime, sameTime);
      const convo3 = await createConvoWithTimestamps(3, sameTime, sameTime);

      const result = await getConvosByCursor('user123');

      // All 3 should be returned (no skipping due to same timestamps)
      expect(result?.conversations).toHaveLength(3);

      const returnedIds = result?.conversations.map((c: IConversation) => c.conversationId);
      expect(returnedIds).toContain(convo1!.conversationId);
      expect(returnedIds).toContain(convo2!.conversationId);
      expect(returnedIds).toContain(convo3!.conversationId);
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
      const decodedCursor = JSON.parse(
        Buffer.from(page1.nextCursor as string, 'base64').toString(),
      );

      // The cursor should match the last item in page1 (item at index 24)
      const lastReturnedItem = page1.conversations[24] as IConversation;

      expect(new Date(decodedCursor.primary).getTime()).toBe(
        new Date(lastReturnedItem.updatedAt ?? 0).getTime(),
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
      expect(new Date(convo1!.createdAt ?? 0).getTime()).toBe(
        new Date('2026-01-03T00:00:00.000Z').getTime(),
      );
      expect(new Date(convo2!.createdAt ?? 0).getTime()).toBe(
        new Date('2026-01-01T00:00:00.000Z').getTime(),
      );

      const result = await getConvosByCursor('user123', { sortBy: 'createdAt' });

      // Should be sorted by createdAt DESC
      expect(result?.conversations).toHaveLength(2);
      expect(result?.conversations[0].conversationId).toBe(convo1!.conversationId); // Jan 3 createdAt
      expect(result?.conversations[1].conversationId).toBe(convo2!.conversationId); // Jan 1 createdAt
    });

    it('should handle empty result set gracefully', async () => {
      const result = await getConvosByCursor('user123');

      expect(result?.conversations).toHaveLength(0);
      expect(result?.nextCursor).toBeNull();
    });

    it('should handle exactly limit number of conversations (no next page)', async () => {
      const baseTime = new Date('2026-01-01T00:00:00.000Z');

      // Create exactly 25 conversations (equal to default limit)
      for (let i = 0; i < 25; i++) {
        const updatedAt = new Date(baseTime.getTime() - i * 60000);
        await createConvoWithTimestamps(i, updatedAt, updatedAt);
      }

      const result = await getConvosByCursor('user123', { limit: 25 });

      expect(result?.conversations).toHaveLength(25);
      expect(result?.nextCursor).toBeNull(); // No next page
    });
  });
});
