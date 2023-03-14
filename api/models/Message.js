const mongoose = require('mongoose');

const messageSchema = mongoose.Schema({
  messageId: {
    type: String,
    unique: true,
    required: true
  },
  conversationId: {
    type: String,
    required: true
  },
  conversationSignature: {
    type: String,
    // required: true
  },
  clientId: {
    type: String,
  },
  invocationId: {
    type: String,
  },
  parentMessageId: {
    type: String,
    // required: true
  },
  sender: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  isCreatedByUser: {
    type: Boolean,
    required: true,
    default: false
  },
  error: {
    type: Boolean,
    default: false
  },
}, { timestamps: true });

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = {
  saveMessage: async ({ messageId, conversationId, parentMessageId, sender, text, isCreatedByUser=false, error }) => {
    try {
      await Message.findOneAndUpdate({ messageId }, {
        conversationId,
        parentMessageId,
        sender,
        text,
        isCreatedByUser,
        error
      }, { upsert: true, new: true });
      return { messageId, conversationId, parentMessageId, sender, text, isCreatedByUser };
    } catch (error) {
      console.error(error);
      return { message: 'Error saving message' };
    }
  },
  deleteMessagesSince: async ({ messageId, conversationId }) => {
    try {
      const message = await Message.findOne({ messageId }).exec()

      if (message) 
        return await Message.find({ conversationId }).deleteMany({ createdAt: { $gt: message.createdAt } }).exec();
    } catch (error) {
      console.error(error);
      return { message: 'Error deleting messages' };
    }
  },
  getMessages: async (filter) => {
    try {
      return await Message.find(filter).sort({createdAt: 1}).exec()
    } catch (error) {
      console.error(error);
      return { message: 'Error getting messages' };
    }
  },
  deleteMessages: async (filter) => {
    try {
      return await Message.deleteMany(filter).exec()
    } catch (error) {
      console.error(error);
      return { message: 'Error deleting messages' };
    }
  }
}