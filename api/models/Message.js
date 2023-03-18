const mongoose = require('mongoose');
const mongoMeili = require('../lib/db/mongoMeili');

const messageSchema = mongoose.Schema({
  messageId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    meiliIndex: true
  },
  conversationId: {
    type: String,
    required: true,
    meiliIndex: true
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
    required: true,
    meiliIndex: true
  },
  text: {
    type: String,
    required: true,
    meiliIndex: true
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
  _meiliIndex: { 
    type: Boolean, 
    required: false, 
    select: false, 
    default: false 
  }
}, { timestamps: true });

messageSchema.plugin(mongoMeili, {
  host: process.env.MEILI_HOST,
  apiKey: process.env.MEILI_KEY,
  indexName: 'messages', // Will get created automatically if it doesn't exist already
  primaryKey: 'messageId',
});

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = {
  messageSchema,
  Message,
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