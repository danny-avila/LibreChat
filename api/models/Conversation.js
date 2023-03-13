const mongoose = require('mongoose');
const { getMessages, deleteMessages } = require('./Message');

const convoSchema = mongoose.Schema({
  conversationId: {
    type: String,
    unique: true,
    required: true
  },
  parentMessageId: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: 'New Chat'
  },
  jailbreakConversationId: {
    type: String
  },
  conversationSignature: {
    type: String
  },
  clientId: {
    type: String
  },
  invocationId: {
    type: String
  },
  chatGptLabel: {
    type: String
  },
  promptPrefix: {
    type: String
  },
  model: {
    type: String
  },
  suggestions: [{ type: String }],
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
}, { timestamps: true });

const Conversation =
  mongoose.models.Conversation || mongoose.model('Conversation', convoSchema);

const getConvo = async (conversationId) => {
  try {
    return await Conversation.findOne({ conversationId }).exec();
  } catch (error) {
    console.log(error);
    return { message: 'Error getting single conversation' };
  }
};

module.exports = {
  saveConvo: async ({ conversationId, title, ...convo }) => {
    try {
      const messages = await getMessages({ conversationId });
      const update = { ...convo, messages };
      if (title) {
        update.title = title;
      }

      return await Conversation.findOneAndUpdate(
        { conversationId },
        { $set: update },
        { new: true, upsert: true }
      ).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error saving conversation' };
    }
  },
  updateConvo: async ({ conversationId, ...update }) => {
    try {
      return await Conversation.findOneAndUpdate({ conversationId }, update, {
        new: true
      }).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error updating conversation' };
    }
  },
  // getConvos: async () => await Conversation.find({}).sort({ createdAt: -1 }).exec(),
  getConvos: async (pageNumber = 1, pageSize = 12) => {
    try {
      const skip = (pageNumber - 1) * pageSize;
      // const limit = pageNumber * pageSize;

      const conversations = await Conversation.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        // .limit(limit)
        .limit(pageSize)
        .exec();

      return conversations;
    } catch (error) {
      console.log(error);
      return { message: 'Error getting conversations' };
    }
  },
  getConvo,
  getConvoTitle: async (conversationId) => {
    try {
      const convo = await getConvo(conversationId);
      return convo.title;
    } catch (error) {
      console.log(error);
      return { message: 'Error getting conversation title' };
    }
  },
  deleteConvos: async (filter) => {
    let deleteCount = await Conversation.deleteMany(filter).exec();
    deleteCount.messages = await deleteMessages(filter);
    return deleteCount;
  }
};
