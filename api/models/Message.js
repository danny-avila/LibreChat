const crypto = require('crypto');
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
          model
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
  },

  async getRecentMessages() {
    try {
      return await Message.find().sort( {createdAt: -1} ).select('conversationId').limit(30).exec();
    } catch (err) {
      console.error(`Error fetching recents messages: ${err}`);
      throw new Error('Failed to fetch recent messages.');
    }
  },

  async duplicateMessages({ newConversationId, msgData }) {
    try {
      let newParentMessageId = "00000000-0000-0000-0000-000000000000";
      let newMessageId = crypto.randomUUID();
      const msgObjIds = [];

      for (let i = 0; i < msgData.length; i++) {
        let msgObj = structuredClone(msgData[i]);

        delete msgObj._id;
        msgObj.messageId = newMessageId;
        msgObj.parentMessageId = newParentMessageId;
        msgObj.conversationId = newConversationId;

        newParentMessageId = newMessageId;
        newMessageId = crypto.randomUUID();

        const newMsg = new Message(msgObj);
        const result = await newMsg.save();
        msgObjIds.push(result.id);
      }

      return msgObjIds;
    } catch (err) {
      console.error(`Error duplicating messages: ${err}`);
      throw new Error('Failed to duplicate messages.');
    }
    
  }
};
