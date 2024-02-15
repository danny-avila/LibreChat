const { z } = require('zod');
const Message = require('./schema/messageSchema');
const logger = require('~/config/winston');

const idSchema = z.string().uuid();

module.exports = {
  Message,

  async saveMessage({
    user,
    endpoint,
    messageId,
    newMessageId,
    conversationId,
    parentMessageId,
    sender,
    text,
    isCreatedByUser,
    error,
    unfinished,
    files,
    isEdited,
    finish_reason,
    tokenCount,
    plugin,
    plugins,
    model,
  }) {
    try {
      const validConvoId = idSchema.safeParse(conversationId);
      if (!validConvoId.success) {
        return;
      }

      const update = {
        user,
        endpoint,
        messageId: newMessageId || messageId,
        conversationId,
        parentMessageId,
        sender,
        text,
        isCreatedByUser,
        isEdited,
        finish_reason,
        error,
        unfinished,
        tokenCount,
        plugin,
        plugins,
        model,
      };

      if (files) {
        update.files = files;
      }
      // may also need to update the conversation here
      await Message.findOneAndUpdate({ messageId }, update, { upsert: true, new: true });

      return {
        messageId,
        conversationId,
        parentMessageId,
        sender,
        text,
        isCreatedByUser,
        tokenCount,
      };
    } catch (err) {
      logger.error('Error saving message:', err);
      throw new Error('Failed to save message.');
    }
  },
  async updateMessage(message) {
    try {
      const { messageId, ...update } = message;
      update.isEdited = true;
      const updatedMessage = await Message.findOneAndUpdate({ messageId }, update, { new: true });

      if (!updatedMessage) {
        throw new Error('Message not found.');
      }

      return {
        messageId: updatedMessage.messageId,
        conversationId: updatedMessage.conversationId,
        parentMessageId: updatedMessage.parentMessageId,
        sender: updatedMessage.sender,
        text: updatedMessage.text,
        isCreatedByUser: updatedMessage.isCreatedByUser,
        tokenCount: updatedMessage.tokenCount,
        isEdited: true,
      };
    } catch (err) {
      logger.error('Error updating message:', err);
      throw new Error('Failed to update message.');
    }
  },
  async deleteMessagesSince({ messageId, conversationId }) {
    try {
      const message = await Message.findOne({ messageId }).lean();

      if (message) {
        return await Message.find({ conversationId }).deleteMany({
          createdAt: { $gt: message.createdAt },
        });
      }
    } catch (err) {
      logger.error('Error deleting messages:', err);
      throw new Error('Failed to delete messages.');
    }
  },

  async getMessages(filter) {
    try {
      return await Message.find(filter).sort({ createdAt: 1 }).lean();
    } catch (err) {
      logger.error('Error getting messages:', err);
      throw new Error('Failed to get messages.');
    }
  },

  async deleteMessages(filter) {
    try {
      return await Message.deleteMany(filter);
    } catch (err) {
      logger.error('Error deleting messages:', err);
      throw new Error('Failed to delete messages.');
    }
  },
};
