const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { messageSchema } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');

const {
  saveMessage,
  getMessages,
  updateMessage,
  deleteMessages,
  bulkSaveMessages,
  updateMessageText,
  deleteMessagesSince,
} = require('./Message');

jest.mock('~/server/services/Config/app');

/**
 * @type {import('mongoose').Model<import('@librechat/data-schemas').IMessage>}
 */
let Message;

describe('Message Operations', () => {
  let mongoServer;
  let mockReq;
  let mockMessageData;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear database
    await Message.deleteMany({});

    mockReq = {
      user: { id: 'user123' },
      config: {
        interfaceConfig: {
          temporaryChatRetention: 24, // Default 24 hours
        },
      },
    };

    mockMessageData = {
      messageId: 'msg123',
      conversationId: uuidv4(),
      text: 'Hello, world!',
      user: 'user123',
    };
  });

  describe('saveMessage', () => {
    it('should save a message for an authenticated user', async () => {
      const result = await saveMessage(mockReq, mockMessageData);

      expect(result.messageId).toBe('msg123');
      expect(result.user).toBe('user123');
      expect(result.text).toBe('Hello, world!');

      // Verify the message was actually saved to the database
      const savedMessage = await Message.findOne({ messageId: 'msg123', user: 'user123' });
      expect(savedMessage).toBeTruthy();
      expect(savedMessage.text).toBe('Hello, world!');
    });

    it('should throw an error for unauthenticated user', async () => {
      mockReq.user = null;
      await expect(saveMessage(mockReq, mockMessageData)).rejects.toThrow('User not authenticated');
    });

    it('should handle invalid conversation ID gracefully', async () => {
      mockMessageData.conversationId = 'invalid-id';
      const result = await saveMessage(mockReq, mockMessageData);
      expect(result).toBeUndefined();
    });
  });

  describe('updateMessageText', () => {
    it('should update message text for the authenticated user', async () => {
      // First save a message
      await saveMessage(mockReq, mockMessageData);

      // Then update it
      await updateMessageText(mockReq, { messageId: 'msg123', text: 'Updated text' });

      // Verify the update
      const updatedMessage = await Message.findOne({ messageId: 'msg123', user: 'user123' });
      expect(updatedMessage.text).toBe('Updated text');
    });
  });

  describe('updateMessage', () => {
    it('should update a message for the authenticated user', async () => {
      // First save a message
      await saveMessage(mockReq, mockMessageData);

      const result = await updateMessage(mockReq, { messageId: 'msg123', text: 'Updated text' });

      expect(result.messageId).toBe('msg123');
      expect(result.text).toBe('Updated text');

      // Verify in database
      const updatedMessage = await Message.findOne({ messageId: 'msg123', user: 'user123' });
      expect(updatedMessage.text).toBe('Updated text');
    });

    it('should throw an error if message is not found', async () => {
      await expect(
        updateMessage(mockReq, { messageId: 'nonexistent', text: 'Test' }),
      ).rejects.toThrow('Message not found or user not authorized.');
    });
  });

  describe('deleteMessagesSince', () => {
    it('should delete messages only for the authenticated user', async () => {
      const conversationId = uuidv4();

      // Create multiple messages in the same conversation
      await saveMessage(mockReq, {
        messageId: 'msg1',
        conversationId,
        text: 'First message',
        user: 'user123',
      });

      await saveMessage(mockReq, {
        messageId: 'msg2',
        conversationId,
        text: 'Second message',
        user: 'user123',
      });

      await saveMessage(mockReq, {
        messageId: 'msg3',
        conversationId,
        text: 'Third message',
        user: 'user123',
      });

      // Delete messages since message2 (this should only delete messages created AFTER msg2)
      await deleteMessagesSince(mockReq, {
        messageId: 'msg2',
        conversationId,
      });

      // Verify msg1 and msg2 remain, msg3 is deleted
      const remainingMessages = await Message.find({ conversationId, user: 'user123' });
      expect(remainingMessages).toHaveLength(2);
      expect(remainingMessages.map((m) => m.messageId)).toContain('msg1');
      expect(remainingMessages.map((m) => m.messageId)).toContain('msg2');
      expect(remainingMessages.map((m) => m.messageId)).not.toContain('msg3');
    });

    it('should return undefined if no message is found', async () => {
      const result = await deleteMessagesSince(mockReq, {
        messageId: 'nonexistent',
        conversationId: 'convo123',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages with the correct filter', async () => {
      const conversationId = uuidv4();

      // Save some messages
      await saveMessage(mockReq, {
        messageId: 'msg1',
        conversationId,
        text: 'First message',
        user: 'user123',
      });

      await saveMessage(mockReq, {
        messageId: 'msg2',
        conversationId,
        text: 'Second message',
        user: 'user123',
      });

      const messages = await getMessages({ conversationId });
      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('First message');
      expect(messages[1].text).toBe('Second message');
    });
  });

  describe('deleteMessages', () => {
    it('should delete messages with the correct filter', async () => {
      // Save some messages for different users
      await saveMessage(mockReq, mockMessageData);
      await saveMessage(
        { user: { id: 'user456' } },
        {
          messageId: 'msg456',
          conversationId: uuidv4(),
          text: 'Other user message',
          user: 'user456',
        },
      );

      await deleteMessages({ user: 'user123' });

      // Verify only user123's messages were deleted
      const user123Messages = await Message.find({ user: 'user123' });
      const user456Messages = await Message.find({ user: 'user456' });

      expect(user123Messages).toHaveLength(0);
      expect(user456Messages).toHaveLength(1);
    });
  });

  describe('Conversation Hijacking Prevention', () => {
    it("should not allow editing a message in another user's conversation", async () => {
      const attackerReq = { user: { id: 'attacker123' } };
      const victimConversationId = uuidv4();
      const victimMessageId = 'victim-msg-123';

      // First, save a message as the victim (but we'll try to edit as attacker)
      const victimReq = { user: { id: 'victim123' } };
      await saveMessage(victimReq, {
        messageId: victimMessageId,
        conversationId: victimConversationId,
        text: 'Victim message',
        user: 'victim123',
      });

      // Attacker tries to edit the victim's message
      await expect(
        updateMessage(attackerReq, {
          messageId: victimMessageId,
          conversationId: victimConversationId,
          text: 'Hacked message',
        }),
      ).rejects.toThrow('Message not found or user not authorized.');

      // Verify the original message is unchanged
      const originalMessage = await Message.findOne({
        messageId: victimMessageId,
        user: 'victim123',
      });
      expect(originalMessage.text).toBe('Victim message');
    });

    it("should not allow deleting messages from another user's conversation", async () => {
      const attackerReq = { user: { id: 'attacker123' } };
      const victimConversationId = uuidv4();
      const victimMessageId = 'victim-msg-123';

      // Save a message as the victim
      const victimReq = { user: { id: 'victim123' } };
      await saveMessage(victimReq, {
        messageId: victimMessageId,
        conversationId: victimConversationId,
        text: 'Victim message',
        user: 'victim123',
      });

      // Attacker tries to delete from victim's conversation
      const result = await deleteMessagesSince(attackerReq, {
        messageId: victimMessageId,
        conversationId: victimConversationId,
      });

      expect(result).toBeUndefined();

      // Verify the victim's message still exists
      const victimMessage = await Message.findOne({
        messageId: victimMessageId,
        user: 'victim123',
      });
      expect(victimMessage).toBeTruthy();
      expect(victimMessage.text).toBe('Victim message');
    });

    it("should not allow inserting a new message into another user's conversation", async () => {
      const attackerReq = { user: { id: 'attacker123' } };
      const victimConversationId = uuidv4();

      // Attacker tries to save a message - this should succeed but with attacker's user ID
      const result = await saveMessage(attackerReq, {
        conversationId: victimConversationId,
        text: 'Inserted malicious message',
        messageId: 'new-msg-123',
        user: 'attacker123',
      });

      expect(result).toBeTruthy();
      expect(result.user).toBe('attacker123');

      // Verify the message was saved with the attacker's user ID, not as an anonymous message
      const savedMessage = await Message.findOne({ messageId: 'new-msg-123' });
      expect(savedMessage.user).toBe('attacker123');
      expect(savedMessage.conversationId).toBe(victimConversationId);
    });

    it('should allow retrieving messages from any conversation', async () => {
      const victimConversationId = uuidv4();

      // Save a message in the victim's conversation
      const victimReq = { user: { id: 'victim123' } };
      await saveMessage(victimReq, {
        messageId: 'victim-msg',
        conversationId: victimConversationId,
        text: 'Victim message',
        user: 'victim123',
      });

      // Anyone should be able to retrieve messages by conversation ID
      const messages = await getMessages({ conversationId: victimConversationId });
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('Victim message');
    });
  });

  describe('isTemporary message handling', () => {
    beforeEach(() => {
      // Reset mocks before each test
      jest.clearAllMocks();
    });

    it('should save a message with expiredAt when isTemporary is true', async () => {
      // Mock app config with 24 hour retention
      mockReq.config.interfaceConfig.temporaryChatRetention = 24;

      mockReq.body = { isTemporary: true };

      const beforeSave = new Date();
      const result = await saveMessage(mockReq, mockMessageData);
      const afterSave = new Date();

      expect(result.messageId).toBe('msg123');
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

    it('should save a message without expiredAt when isTemporary is false', async () => {
      mockReq.body = { isTemporary: false };

      const result = await saveMessage(mockReq, mockMessageData);

      expect(result.messageId).toBe('msg123');
      expect(result.expiredAt).toBeNull();
    });

    it('should save a message without expiredAt when isTemporary is not provided', async () => {
      // No isTemporary in body
      mockReq.body = {};

      const result = await saveMessage(mockReq, mockMessageData);

      expect(result.messageId).toBe('msg123');
      expect(result.expiredAt).toBeNull();
    });

    it('should use custom retention period from config', async () => {
      // Mock app config with 48 hour retention
      mockReq.config.interfaceConfig.temporaryChatRetention = 48;

      mockReq.body = { isTemporary: true };

      const beforeSave = new Date();
      const result = await saveMessage(mockReq, mockMessageData);

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
      const result = await saveMessage(mockReq, mockMessageData);

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
      const result = await saveMessage(mockReq, mockMessageData);

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
      const result = await saveMessage(mockReq, mockMessageData);
      const afterSave = new Date();

      // Should still save the message with default retention period (30 days)
      expect(result.messageId).toBe('msg123');
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
      const result = await saveMessage(mockReq, mockMessageData);

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

    it('should not update expiredAt on message update', async () => {
      // First save a temporary message
      mockReq.config.interfaceConfig.temporaryChatRetention = 24;

      mockReq.body = { isTemporary: true };
      const savedMessage = await saveMessage(mockReq, mockMessageData);
      const originalExpiredAt = savedMessage.expiredAt;

      // Now update the message without isTemporary flag
      mockReq.body = {};
      const updatedMessage = await updateMessage(mockReq, {
        messageId: 'msg123',
        text: 'Updated text',
      });

      // expiredAt should not be in the returned updated message object
      expect(updatedMessage.expiredAt).toBeUndefined();

      // Verify in database that expiredAt wasn't changed
      const dbMessage = await Message.findOne({ messageId: 'msg123', user: 'user123' });
      expect(dbMessage.expiredAt).toEqual(originalExpiredAt);
    });

    it('should preserve expiredAt when saving existing temporary message', async () => {
      // First save a temporary message
      mockReq.config.interfaceConfig.temporaryChatRetention = 24;

      mockReq.body = { isTemporary: true };
      const firstSave = await saveMessage(mockReq, mockMessageData);
      const originalExpiredAt = firstSave.expiredAt;

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Save again with same messageId but different text
      const updatedData = { ...mockMessageData, text: 'Updated text' };
      const secondSave = await saveMessage(mockReq, updatedData);

      // Should update text but create new expiredAt
      expect(secondSave.text).toBe('Updated text');
      expect(secondSave.expiredAt).toBeDefined();
      expect(new Date(secondSave.expiredAt).getTime()).toBeGreaterThan(
        new Date(originalExpiredAt).getTime(),
      );
    });

    it('should handle bulk operations with temporary messages', async () => {
      // This test verifies bulkSaveMessages doesn't interfere with expiredAt
      const messages = [
        {
          messageId: 'bulk1',
          conversationId: uuidv4(),
          text: 'Bulk message 1',
          user: 'user123',
          expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        {
          messageId: 'bulk2',
          conversationId: uuidv4(),
          text: 'Bulk message 2',
          user: 'user123',
          expiredAt: null,
        },
      ];

      await bulkSaveMessages(messages);

      const savedMessages = await Message.find({
        messageId: { $in: ['bulk1', 'bulk2'] },
      }).lean();

      expect(savedMessages).toHaveLength(2);

      const bulk1 = savedMessages.find((m) => m.messageId === 'bulk1');
      const bulk2 = savedMessages.find((m) => m.messageId === 'bulk2');

      expect(bulk1.expiredAt).toBeDefined();
      expect(bulk2.expiredAt).toBeNull();
    });
  });

  describe('Message cursor pagination', () => {
    /**
     * Helper to create messages with specific timestamps
     * Uses collection.insertOne to bypass Mongoose timestamps
     */
    const createMessageWithTimestamp = async (index, conversationId, createdAt) => {
      const messageId = uuidv4();
      await Message.collection.insertOne({
        messageId,
        conversationId,
        user: 'user123',
        text: `Message ${index}`,
        isCreatedByUser: index % 2 === 0,
        createdAt,
        updatedAt: createdAt,
      });
      return Message.findOne({ messageId }).lean();
    };

    /**
     * Simulates the pagination logic from api/server/routes/messages.js
     * This tests the exact query pattern used in the route
     */
    const getMessagesByCursor = async ({
      conversationId,
      user,
      pageSize = 25,
      cursor = null,
      sortBy = 'createdAt',
      sortDirection = 'desc',
    }) => {
      const sortOrder = sortDirection === 'asc' ? 1 : -1;
      const sortField = ['createdAt', 'updatedAt'].includes(sortBy) ? sortBy : 'createdAt';
      const cursorOperator = sortDirection === 'asc' ? '$gt' : '$lt';

      const filter = { conversationId, user };
      if (cursor) {
        filter[sortField] = { [cursorOperator]: new Date(cursor) };
      }

      const messages = await Message.find(filter)
        .sort({ [sortField]: sortOrder })
        .limit(pageSize + 1)
        .lean();

      let nextCursor = null;
      if (messages.length > pageSize) {
        messages.pop(); // Remove extra item used to detect next page
        // Create cursor from the last RETURNED item (not the popped one)
        nextCursor = messages[messages.length - 1][sortField];
      }

      return { messages, nextCursor };
    };

    it('should return messages for a conversation with pagination', async () => {
      const conversationId = uuidv4();
      const baseTime = new Date('2026-01-01T00:00:00.000Z');

      // Create 30 messages to test pagination
      for (let i = 0; i < 30; i++) {
        const createdAt = new Date(baseTime.getTime() - i * 60000); // Each 1 minute apart
        await createMessageWithTimestamp(i, conversationId, createdAt);
      }

      // Fetch first page (pageSize 25)
      const page1 = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 25,
      });

      expect(page1.messages).toHaveLength(25);
      expect(page1.nextCursor).toBeTruthy();

      // Fetch second page using cursor
      const page2 = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 25,
        cursor: page1.nextCursor,
      });

      // Should get remaining 5 messages
      expect(page2.messages).toHaveLength(5);
      expect(page2.nextCursor).toBeNull();

      // Verify no duplicates and no gaps
      const allMessageIds = [
        ...page1.messages.map((m) => m.messageId),
        ...page2.messages.map((m) => m.messageId),
      ];
      const uniqueIds = new Set(allMessageIds);

      expect(uniqueIds.size).toBe(30); // All 30 messages accounted for
      expect(allMessageIds.length).toBe(30); // No duplicates
    });

    it('should not skip message at page boundary (item 26 bug fix)', async () => {
      const conversationId = uuidv4();
      const baseTime = new Date('2026-01-01T12:00:00.000Z');

      // Create exactly 26 messages
      const messages = [];
      for (let i = 0; i < 26; i++) {
        const createdAt = new Date(baseTime.getTime() - i * 60000);
        const msg = await createMessageWithTimestamp(i, conversationId, createdAt);
        messages.push(msg);
      }

      // The 26th message (index 25) should be on page 2
      const item26 = messages[25];

      // Fetch first page with pageSize 25
      const page1 = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 25,
      });

      expect(page1.messages).toHaveLength(25);
      expect(page1.nextCursor).toBeTruthy();

      // Item 26 should NOT be in page 1
      const page1Ids = page1.messages.map((m) => m.messageId);
      expect(page1Ids).not.toContain(item26.messageId);

      // Fetch second page
      const page2 = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 25,
        cursor: page1.nextCursor,
      });

      // Item 26 MUST be in page 2 (this was the bug - it was being skipped)
      expect(page2.messages).toHaveLength(1);
      expect(page2.messages[0].messageId).toBe(item26.messageId);
    });

    it('should sort by createdAt DESC by default', async () => {
      const conversationId = uuidv4();

      // Create messages with specific timestamps
      const msg1 = await createMessageWithTimestamp(
        1,
        conversationId,
        new Date('2026-01-01T00:00:00.000Z'),
      );
      const msg2 = await createMessageWithTimestamp(
        2,
        conversationId,
        new Date('2026-01-02T00:00:00.000Z'),
      );
      const msg3 = await createMessageWithTimestamp(
        3,
        conversationId,
        new Date('2026-01-03T00:00:00.000Z'),
      );

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
      });

      // Should be sorted by createdAt DESC (newest first) by default
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].messageId).toBe(msg3.messageId);
      expect(result.messages[1].messageId).toBe(msg2.messageId);
      expect(result.messages[2].messageId).toBe(msg1.messageId);
    });

    it('should support ascending sort direction', async () => {
      const conversationId = uuidv4();

      const msg1 = await createMessageWithTimestamp(
        1,
        conversationId,
        new Date('2026-01-01T00:00:00.000Z'),
      );
      const msg2 = await createMessageWithTimestamp(
        2,
        conversationId,
        new Date('2026-01-02T00:00:00.000Z'),
      );

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        sortDirection: 'asc',
      });

      // Should be sorted by createdAt ASC (oldest first)
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].messageId).toBe(msg1.messageId);
      expect(result.messages[1].messageId).toBe(msg2.messageId);
    });

    it('should handle empty conversation', async () => {
      const conversationId = uuidv4();

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
      });

      expect(result.messages).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('should only return messages for the specified user', async () => {
      const conversationId = uuidv4();
      const createdAt = new Date();

      // Create a message for user123
      await Message.collection.insertOne({
        messageId: uuidv4(),
        conversationId,
        user: 'user123',
        text: 'User message',
        createdAt,
        updatedAt: createdAt,
      });

      // Create a message for a different user
      await Message.collection.insertOne({
        messageId: uuidv4(),
        conversationId,
        user: 'otherUser',
        text: 'Other user message',
        createdAt,
        updatedAt: createdAt,
      });

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
      });

      // Should only return user123's message
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].user).toBe('user123');
    });

    it('should handle exactly pageSize number of messages (no next page)', async () => {
      const conversationId = uuidv4();
      const baseTime = new Date('2026-01-01T00:00:00.000Z');

      // Create exactly 25 messages (equal to default pageSize)
      for (let i = 0; i < 25; i++) {
        const createdAt = new Date(baseTime.getTime() - i * 60000);
        await createMessageWithTimestamp(i, conversationId, createdAt);
      }

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 25,
      });

      expect(result.messages).toHaveLength(25);
      expect(result.nextCursor).toBeNull(); // No next page
    });

    it('should handle pageSize of 1', async () => {
      const conversationId = uuidv4();
      const baseTime = new Date('2026-01-01T00:00:00.000Z');

      // Create 3 messages
      for (let i = 0; i < 3; i++) {
        const createdAt = new Date(baseTime.getTime() - i * 60000);
        await createMessageWithTimestamp(i, conversationId, createdAt);
      }

      // Fetch with pageSize 1
      let cursor = null;
      const allMessages = [];

      for (let page = 0; page < 5; page++) {
        const result = await getMessagesByCursor({
          conversationId,
          user: 'user123',
          pageSize: 1,
          cursor,
        });

        allMessages.push(...result.messages);
        cursor = result.nextCursor;

        if (!cursor) {
          break;
        }
      }

      // Should get all 3 messages without duplicates
      expect(allMessages).toHaveLength(3);
      const uniqueIds = new Set(allMessages.map((m) => m.messageId));
      expect(uniqueIds.size).toBe(3);
    });

    it('should handle messages with same createdAt timestamp', async () => {
      const conversationId = uuidv4();
      const sameTime = new Date('2026-01-01T12:00:00.000Z');

      // Create multiple messages with the exact same timestamp
      const messages = [];
      for (let i = 0; i < 5; i++) {
        const msg = await createMessageWithTimestamp(i, conversationId, sameTime);
        messages.push(msg);
      }

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 10,
      });

      // All messages should be returned
      expect(result.messages).toHaveLength(5);
    });
  });
});
