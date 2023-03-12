const mongoose = require('mongoose');

const messageSchema = mongoose.Schema({
  id: {
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
  }
}, { timestamps: true });

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = {
  saveMessage: async ({ id, conversationId, parentMessageId, sender, text, isCreatedByUser=false }) => {
    try {
      await Message.findOneAndUpdate({ id }, {
        conversationId,
        parentMessageId,
        sender,
        text,
        isCreatedByUser
      }, { upsert: true, new: true });
      return { id, conversationId, parentMessageId, sender, text, isCreatedByUser };
    } catch (error) {
      console.error(error);
      return { message: 'Error saving message' };
    }
  },
  deleteMessagesSince: async ({ id, conversationId }) => {
    try {
      message = await Message.findOne({ id }).exec()

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