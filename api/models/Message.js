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
    plugin = null,
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
          plugin,
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
        return await Message.find({ conversationId })
          .deleteMany({ createdAt: { $gt: message.createdAt } })
          .exec();
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
