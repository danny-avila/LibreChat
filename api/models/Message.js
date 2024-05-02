const { z } = require('zod');
const Message = require('./schema/messageSchema');
const logger = require('~/config/winston');

const idSchema = z.string().uuid();

module.exports = {
  Message,

  async saveMessage({
    user,
    endpoint,
    iconURL,
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
        iconURL,
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

  async bulkSaveMessages(messages) {
    try {
      const bulkOps = messages.map((message) => ({
        updateOne: {
          filter: { messageId: message.messageId },
          update: message,
          upsert: true,
        },
      }));

      const result = await Message.bulkWrite(bulkOps);
      return result;
    } catch (err) {
      logger.error('Error saving messages in bulk:', err);
      throw new Error('Failed to save messages in bulk.');
    }
  },

  /**
   * Records a message in the database.
   *
   * @async
   * @function recordMessage
   * @param {Object} params - The message data object.
   * @param {string} params.user - The identifier of the user.
   * @param {string} params.endpoint - The endpoint where the message originated.
   * @param {string} params.messageId - The unique identifier for the message.
   * @param {string} params.conversationId - The identifier of the conversation.
   * @param {string} [params.parentMessageId] - The identifier of the parent message, if any.
   * @param {Partial<TMessage>} rest - Any additional properties from the TMessage typedef not explicitly listed.
   * @returns {Promise<Object>} The updated or newly inserted message document.
   * @throws {Error} If there is an error in saving the message.
   */
  async recordMessage({ user, endpoint, messageId, conversationId, parentMessageId, ...rest }) {
    try {
      // No parsing of convoId as may use threadId
      const message = {
        user,
        endpoint,
        messageId,
        conversationId,
        parentMessageId,
        ...rest,
      };

      return await Message.findOneAndUpdate({ user, messageId }, message, {
        upsert: true,
        new: true,
      });
    } catch (err) {
      logger.error('Error saving message:', err);
      throw new Error('Failed to save message.');
    }
  },
  async updateMessage(message) {
    try {
      const { messageId, ...update } = message;
      update.isEdited = true;
      const updatedMessage = await Message.findOneAndUpdate({ messageId }, update, {
        new: true,
      });

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
