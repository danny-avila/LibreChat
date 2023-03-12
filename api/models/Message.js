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
  saveMessage: async ({ id, conversationId, parentMessageId, sender, text }) => {
    try {
      await Message.create({
        id,
        conversationId,
        parentMessageId,
        sender,
        text
      });
      return { id, conversationId, parentMessageId, sender, text };
    } catch (error) {
      console.error(error);
      return { message: 'Error saving message' };
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