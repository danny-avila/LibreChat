const mongoose = require('mongoose');
const mongoMeili = require('../lib/db/mongoMeili');
const { getMessages, deleteMessages } = require('./Message');

const convoSchema = mongoose.Schema(
  {
    conversationId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      meiliIndex: true
    },
    parentMessageId: {
      type: String,
      required: true
    },
    title: {
      type: String,
      default: 'New Chat',
      meiliIndex: true
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

// convoSchema.plugin(mongoMeili, {
//   host: process.env.MEILI_HOST,
//   apiKey: process.env.MEILI_KEY,
//   indexName: 'convos', // Will get created automatically if it doesn't exist already
//   primaryKey: 'conversationId'
// });

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
  getConvosQueried: async (user, convoIds, pageNumber = 1, pageSize = 12) => {
    try {
      if (!convoIds || convoIds.length === 0) {
        return { conversations: [], pages: 1, pageNumber, pageSize };
      }

      const cache = {};
      const promises = [];
      // will handle a syncing solution soon
      const deletedConvoIds = [];

      convoIds.forEach((convo) =>
        promises.push(
          Conversation.findOne({
            user,
            conversationId: convo.conversationId
          }).exec()
        )
      );

      const results = (await Promise.all(promises)).filter((convo, i) => {
        if (!convo) {
          deletedConvoIds.push(convoIds[i].conversationId);
          return false;
        } else {
          const page = Math.floor(i / pageSize) + 1;
          if (!cache[page]) {
            cache[page] = [];
          }
          cache[page].push(convo);
          return true;
        }
      });

      // const startIndex = (pageNumber - 1) * pageSize;
      // const convos = results.slice(startIndex, startIndex + pageSize);
      const totalPages = Math.ceil(results.length / pageSize);
      cache.pages = totalPages;
      cache.pageSize = pageSize;
      return {
        cache,
        conversations: cache[pageNumber] || [],
        pages: totalPages || 1,
        pageNumber,
        pageSize,
        // will handle a syncing solution soon
        filter: new Set(deletedConvoIds),
      };
    } catch (error) {
      console.log(error);
      return { message: 'Error fetching conversations' };
    }
  },
  getConvo,
  /* chore: this method is not properly error handled */
  getConvoTitle: async (user, conversationId) => {
    try {
      const convo = await getConvo(user, conversationId);
      /* ChatGPT Browser was triggering error here due to convo being saved later */
      if (convo && !convo.title) {
        return null;
      } else {
        // TypeError: Cannot read properties of null (reading 'title')
        return convo?.title || 'New Chat';
      }
    } catch (error) {
      console.log(error);
      return 'Error getting conversation title';
    }
  },
  deleteConvos: async (user, filter) => {
    let deleteCount = await Conversation.deleteMany({ ...filter, user }).exec();
    deleteCount.messages = await deleteMessages(filter);
    return deleteCount;
  }
};
