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
    cancelled,
    plugin = null,
    model = null,
    senderId = null,
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
          cancelled,
          plugin,
          model,
          senderId,
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

  async likeMessage (messageId, isLiked) {
    try {
      const existingMsg = await Message.findOne({ messageId }).exec();
  
      if (existingMsg) {
        const update = {};
        
        if (isLiked) {
          // Increment by 1
          update.likesMsg = existingMsg.likesMsg + 1;
        } else {
          // Ensure likesCount doesn't go below 0
          update.likesMsg = existingMsg.likesMsg > 0 ? existingMsg.likesMsg - 1 : 0;
        }
  
        return await Message.findOneAndUpdate(
          { messageId },
          update,
          { new: true }
        ).exec();
      } else {
        return { message: 'Message not found.' };
      }
    } catch (error) {
      console.log(error);
      return { message: 'Error liking Message' };
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
  },

  async getMessagesCount(filter) {
    try {
      return await Message.countDocuments(filter);
    } catch (err) {
      console.error(`Error counting messages: ${err}`);
      throw new Error('Failed to count messages.');
    }
  },
};
