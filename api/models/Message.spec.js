const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { v4: uuidv4 } = require('uuid');
const { messageSchema } = require('@librechat/data-schemas');

const {
  saveMessage,
  getMessages,
  updateMessage,
  deleteMessages,
  updateMessageText,
  deleteMessagesSince,
} = require('./Message');

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
      const message1 = await saveMessage(mockReq, {
        messageId: 'msg1',
        conversationId,
        text: 'First message',
        user: 'user123',
      });

      const message2 = await saveMessage(mockReq, {
        messageId: 'msg2',
        conversationId,
        text: 'Second message',
        user: 'user123',
      });

      const message3 = await saveMessage(mockReq, {
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
});
