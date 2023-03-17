const mongoose = require('mongoose');
const { getMessages, deleteMessages } = require('./Message');

const convoSchema = mongoose.Schema(
  {
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
      type: String,
      default: null
    },
    conversationSignature: {
      type: String,
      default: null
    },
    clientId: {
      type: String
    },
    invocationId: {
      type: String
    },
    chatGptLabel: {
      type: String,
      default: null
    },
    promptPrefix: {
      type: String,
      default: null
    },
    model: {
      type: String,
      required: true
    },
    user: {
      type: String
    },
    suggestions: [{ type: String }],
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }]
  },
  { timestamps: true }
);

const Conversation =
  mongoose.models.Conversation || mongoose.model('Conversation', convoSchema);

const getConvo = async (user, conversationId) => {
  try {
    return await Conversation.findOne({ user, conversationId }).exec();
  } catch (error) {
    console.log(error);
    return { message: 'Error getting single conversation' };
  }
};

module.exports = {
  Conversation,
  saveConvo: async (user, { conversationId, newConversationId, title, ...convo }) => {
    try {
      const messages = await getMessages({ conversationId });
      const update = { ...convo, messages };
      if (title) {
        update.title = title;
        update.user = user;
      }
      if (newConversationId) {
        update.conversationId = newConversationId;
      }
      if (!update.jailbreakConversationId) {
        update.jailbreakConversationId = null;
      }
      if (update.model !== 'chatgptCustom' && update.chatGptLabel && update.promptPrefix) {
        console.log('Validation error: resetting chatgptCustom fields', update);
        update.chatGptLabel = null;
        update.promptPrefix = null;
      }

      return await Conversation.findOneAndUpdate(
        { conversationId: conversationId, user },
        { $set: update },
        { new: true, upsert: true }
      ).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error saving conversation' };
    }
  },
  updateConvo: async (user, { conversationId, ...update }) => {
    try {
      return await Conversation.findOneAndUpdate(
        { conversationId: conversationId, user },
        update,
        {
          new: true
        }
      ).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error updating conversation' };
    }
  },
  getConvosByPage: async (user, pageNumber = 1, pageSize = 12) => {
    try {
      const totalConvos = (await Conversation.countDocuments({ user })) || 1;
      const totalPages = Math.ceil(totalConvos / pageSize);
      const convos = await Conversation.find({ user })
        .sort({ createdAt: -1, created: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .exec();

      return { conversations: convos, pages: totalPages, pageNumber, pageSize };
    } catch (error) {
      console.log(error);
      return { message: 'Error getting conversations' };
    }
  },
  getConvo,
  getConvoTitle: async (user, conversationId) => {
    try {
      const convo = await getConvo(user, conversationId);
      return convo.title;
    } catch (error) {
      console.log(error);
      return { message: 'Error getting conversation title' };
    }
  },
  deleteConvos: async (user, filter) => {
    let deleteCount = await Conversation.deleteMany({ ...filter, user }).exec();
    deleteCount.messages = await deleteMessages(filter);
    return deleteCount;
  }
};
