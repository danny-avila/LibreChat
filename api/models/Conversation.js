const mongoose = require('mongoose');
const crypto = require('crypto');
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
  saveConvo: async (user, { conversationId, newConversationId, title, ...convo }) => {
    try {
      const messages = await getMessages({ conversationId });
      const update = { ...convo, messages };
      if (title) {
        update.title = title;
        update.user = user
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
        { conversationId: conversationId, user: user },
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
      return await Conversation.findOneAndUpdate({ conversationId: conversationId, user: user }, update, {
        new: true
      }).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error updating conversation' };
    }
  },
  getConvosByPage: async (user, pageNumber = 1, pageSize = 12) => {
    try {
      const totalConvos = (await Conversation.countDocuments({ user: user })) || 1;
      const totalPages = Math.ceil(totalConvos / pageSize);
      const convos = await Conversation.find({ user: user })
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
    let deleteCount = await Conversation.deleteMany({...filter, user: user}).exec();
    deleteCount.messages = await deleteMessages(filter);
    return deleteCount;
  },
  migrateDb: async () => {
    try {
      const conversations = await Conversation.find({ model: null }).exec();

      if (!conversations || conversations.length === 0)
        return { message: '[Migrate] No conversations to migrate' };

      for (let convo of conversations) {
        const messages = await getMessages({
          conversationId: convo.conversationId,
          messageId: { $exists: false }
        });

        let model;
        let oldId;
        const promises = [];
        messages.forEach((message, i) => {
          const msgObj = message.toObject();
          const newId = msgObj.id;
          if (i === 0) {
            message.parentMessageId = '00000000-0000-0000-0000-000000000000';
          } else {
            message.parentMessageId = oldId;
          }

          oldId = newId;
          message.messageId = newId;
          if (message.sender.toLowerCase() !== 'user' && !model) {
            model = message.sender.toLowerCase();
          }

          if (message.sender.toLowerCase() === 'user') {
            message.isCreatedByUser = true;
          }
          promises.push(message.save());
        });
        await Promise.all(promises);

        await Conversation.findOneAndUpdate(
          { conversationId: convo.conversationId },
          { model },
          { new: true }
        ).exec();
      }

      try {
        await mongoose.connection.db.collection('messages').dropIndex('id_1');
      } catch (error) {
        console.log("[Migrate] Index doesn't exist or already dropped");
      }
    } catch (error) {
      console.log(error);
      return { message: '[Migrate] Error migrating conversations' };
    }
  }
};
