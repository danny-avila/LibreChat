const Message = require('./schema/messageSchema');

module.exports = {
  Message,

  async saveMessage({
    messageId,
    newMessageId,
    conversationId,
    parentMessageId,
    sender,
    text,
    isCreatedByUser = false,
    error,
    unfinished,
    cancelled
  }) {
    try {
      // may also need to update the conversation here
      await Message.findOneAndUpdate(
        { messageId },
        {
          messageId: newMessageId || messageId,
          conversationId,
          parentMessageId,
          sender,
          text,
          isCreatedByUser,
          error,
          unfinished,
          cancelled
        },
        { upsert: true, new: true }
      );

      return {
        messageId,
        conversationId,
        parentMessageId,
        sender,
        text,
        isCreatedByUser
      };
    } catch (err) {
      console.error(`Error saving message: ${err}`);
      throw new Error('Failed to save message.');
    }
  },

  async deleteMessagesSince({ messageId, conversationId }) {
    try {
      const message = await Message.findOne({ messageId }).exec();

      if (message) {
        const result = await Promise.all([
          Message.find({ conversationId }).where('createdAt').gt(message.createdAt).exec(),
          Message.deleteMany({ conversationId, createdAt: { $lte: message.createdAt } }).exec(),
        ]);
        return result[0];
      }

    } catch (err) {
      console.error(`Error deleting messages: ${err}`);
      throw new Error('Failed to delete messages.');
    }
  },

  async getMessages(filter) {
    try {
      return await Message.find(filter).sort({ createdAt: 1 }).exec();

    } catch (err) {
      console.error(`Error getting messages: ${err}`);
      throw new Error('Failed to get messages.');
    }
  },

  async deleteMessages(filter) {
    try {
      return await Message.deleteMany(filter).exec();

    } catch (err) {
      console.error(`Error deleting messages: ${err}`);
      throw new Error('Failed to delete messages.');
    }
  }
};
