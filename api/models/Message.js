const { z } = require('zod');
const Message = require('./schema/messageSchema');

const idSchema = z.string().uuid();

module.exports = {
  Message,

  async saveMessage({
    user,
    messageId,
    newMessageId,
    conversationId,
    parentMessageId,
    sender,
    text,
    isCreatedByUser = false,
    error,
    unfinished,
    cancelled,
    isEdited = false,
    finish_reason = null,
    tokenCount = null,
    plugin = null,
    plugins = null,
    model = null,
  }) {
    try {
      const validConvoId = idSchema.safeParse(conversationId);
      if (!validConvoId.success) {
        return;
      }
      // may also need to update the conversation here
      await Message.findOneAndUpdate(
        { messageId },
        {
          user,
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
          cancelled,
          tokenCount,
          plugin,
          plugins,
          model,
        },
        { upsert: true, new: true },
      );

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
      console.error(`Error saving message: ${err}`);
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
      console.error(`Error updating message: ${err}`);
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
      console.error(`Error deleting messages: ${err}`);
      throw new Error('Failed to delete messages.');
    }
  },

  async getMessages(filter) {
    try {
      return await Message.find(filter).sort({ createdAt: 1 }).lean();
    } catch (err) {
      console.error(`Error getting messages: ${err}`);
      throw new Error('Failed to get messages.');
    }
  },

  async deleteMessages(filter) {
    try {
      return await Message.deleteMany(filter);
    } catch (err) {
      console.error(`Error deleting messages: ${err}`);
      throw new Error('Failed to delete messages.');
    }
  },
};
