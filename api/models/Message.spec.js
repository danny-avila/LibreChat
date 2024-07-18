const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

jest.mock('mongoose');

const mockFindQuery = {
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
};

const mockSchema = {
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  findOne: jest.fn(() => ({
    lean: jest.fn(),
  })),
  find: jest.fn(() => mockFindQuery),
  deleteMany: jest.fn(),
};

mongoose.model.mockReturnValue(mockSchema);

jest.mock('~/models/schema/messageSchema', () => mockSchema);

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
}));

const {
  saveMessage,
  getMessages,
  updateMessage,
  deleteMessages,
  updateMessageText,
  deleteMessagesSince,
} = require('~/models/Message');

describe('Message Operations', () => {
  let mockReq;
  let mockMessage;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      user: { id: 'user123' },
    };

    mockMessage = {
      messageId: 'msg123',
      conversationId: uuidv4(),
      text: 'Hello, world!',
      user: 'user123',
    };

    mockSchema.findOneAndUpdate.mockResolvedValue({
      toObject: () => mockMessage,
    });
  });

  describe('saveMessage', () => {
    it('should save a message for an authenticated user', async () => {
      const result = await saveMessage(mockReq, mockMessage);
      expect(result).toEqual(mockMessage);
      expect(mockSchema.findOneAndUpdate).toHaveBeenCalledWith(
        { messageId: 'msg123', user: 'user123' },
        expect.objectContaining({ user: 'user123' }),
        expect.any(Object),
      );
    });

    it('should throw an error for unauthenticated user', async () => {
      mockReq.user = null;
      await expect(saveMessage(mockReq, mockMessage)).rejects.toThrow('User not authenticated');
    });

    it('should throw an error for invalid conversation ID', async () => {
      mockMessage.conversationId = 'invalid-id';
      await expect(saveMessage(mockReq, mockMessage)).resolves.toBeUndefined();
    });
  });

  describe('updateMessageText', () => {
    it('should update message text for the authenticated user', async () => {
      await updateMessageText(mockReq, { messageId: 'msg123', text: 'Updated text' });
      expect(mockSchema.updateOne).toHaveBeenCalledWith(
        { messageId: 'msg123', user: 'user123' },
        { text: 'Updated text' },
      );
    });
  });

  describe('updateMessage', () => {
    it('should update a message for the authenticated user', async () => {
      mockSchema.findOneAndUpdate.mockResolvedValue(mockMessage);
      const result = await updateMessage(mockReq, { messageId: 'msg123', text: 'Updated text' });
      expect(result).toEqual(
        expect.objectContaining({
          messageId: 'msg123',
          text: 'Hello, world!',
          isEdited: true,
        }),
      );
    });

    it('should throw an error if message is not found', async () => {
      mockSchema.findOneAndUpdate.mockResolvedValue(null);
      await expect(
        updateMessage(mockReq, { messageId: 'nonexistent', text: 'Test' }),
      ).rejects.toThrow('Message not found or user not authorized.');
    });
  });

  describe('deleteMessagesSince', () => {
    it('should delete messages only for the authenticated user', async () => {
      mockSchema.findOne().lean.mockResolvedValueOnce({ createdAt: new Date() });
      mockFindQuery.deleteMany.mockResolvedValueOnce({ deletedCount: 1 });
      const result = await deleteMessagesSince(mockReq, {
        messageId: 'msg123',
        conversationId: 'convo123',
      });
      expect(mockSchema.findOne).toHaveBeenCalledWith({ messageId: 'msg123', user: 'user123' });
      expect(mockSchema.find).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should return undefined if no message is found', async () => {
      mockSchema.findOne().lean.mockResolvedValueOnce(null);
      const result = await deleteMessagesSince(mockReq, {
        messageId: 'nonexistent',
        conversationId: 'convo123',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages with the correct filter', async () => {
      const filter = { conversationId: 'convo123' };
      await getMessages(filter);
      expect(mockSchema.find).toHaveBeenCalledWith(filter);
      expect(mockFindQuery.sort).toHaveBeenCalledWith({ createdAt: 1 });
      expect(mockFindQuery.lean).toHaveBeenCalled();
    });
  });

  describe('deleteMessages', () => {
    it('should delete messages with the correct filter', async () => {
      await deleteMessages({ user: 'user123' });
      expect(mockSchema.deleteMany).toHaveBeenCalledWith({ user: 'user123' });
    });
  });

  describe('Conversation Hijacking Prevention', () => {
    it('should not allow editing a message in another user\'s conversation', async () => {
      const attackerReq = { user: { id: 'attacker123' } };
      const victimConversationId = 'victim-convo-123';
      const victimMessageId = 'victim-msg-123';

      mockSchema.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        updateMessage(attackerReq, {
          messageId: victimMessageId,
          conversationId: victimConversationId,
          text: 'Hacked message',
        }),
      ).rejects.toThrow('Message not found or user not authorized.');

      expect(mockSchema.findOneAndUpdate).toHaveBeenCalledWith(
        { messageId: victimMessageId, user: 'attacker123' },
        expect.anything(),
        expect.anything(),
      );
    });

    it('should not allow deleting messages from another user\'s conversation', async () => {
      const attackerReq = { user: { id: 'attacker123' } };
      const victimConversationId = 'victim-convo-123';
      const victimMessageId = 'victim-msg-123';

      mockSchema.findOne().lean.mockResolvedValueOnce(null); // Simulating message not found for this user
      const result = await deleteMessagesSince(attackerReq, {
        messageId: victimMessageId,
        conversationId: victimConversationId,
      });

      expect(result).toBeUndefined();
      expect(mockSchema.findOne).toHaveBeenCalledWith({
        messageId: victimMessageId,
        user: 'attacker123',
      });
    });

    it('should not allow inserting a new message into another user\'s conversation', async () => {
      const attackerReq = { user: { id: 'attacker123' } };
      const victimConversationId = uuidv4(); // Use a valid UUID

      await expect(
        saveMessage(attackerReq, {
          conversationId: victimConversationId,
          text: 'Inserted malicious message',
          messageId: 'new-msg-123',
        }),
      ).resolves.not.toThrow(); // It should not throw an error

      // Check that the message was saved with the attacker's user ID
      expect(mockSchema.findOneAndUpdate).toHaveBeenCalledWith(
        { messageId: 'new-msg-123', user: 'attacker123' },
        expect.objectContaining({
          user: 'attacker123',
          conversationId: victimConversationId,
        }),
        expect.anything(),
      );
    });

    it('should allow retrieving messages from any conversation', async () => {
      const victimConversationId = 'victim-convo-123';

      await getMessages({ conversationId: victimConversationId });

      expect(mockSchema.find).toHaveBeenCalledWith({
        conversationId: victimConversationId,
      });

      mockSchema.find.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ text: 'Test message' }]),
      });

      const result = await getMessages({ conversationId: victimConversationId });
      expect(result).toEqual([{ text: 'Test message' }]);
    });
  });
});
