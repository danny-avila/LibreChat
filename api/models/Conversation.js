// const { Conversation } = require('./plugins');
const Conversation = require('./schema/convoSchema');
const { getMessages, deleteMessages } = require('./Message');

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
  saveConvo: async (user, { conversationId, newConversationId, ...convo }) => {
    try {
      const messages = await getMessages({ conversationId });
      const update = { ...convo, messages, user };
      if (newConversationId) {
        update.conversationId = newConversationId;
      }

      return await Conversation.findOneAndUpdate({ conversationId: conversationId, user }, update, {
        new: true,
        upsert: true
      }).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error saving conversation' };
    }
  },
  getConvosByPage: async (user, pageNumber = 1, pageSize = 14) => {
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
  getConvosQueried: async (user, convoIds, pageNumber = 1, pageSize = 14) => {
    try {
      if (!convoIds || convoIds.length === 0) {
        return { conversations: [], pages: 1, pageNumber, pageSize };
      }

      const cache = {};
      const convoMap = {};
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
          convoMap[convo.conversationId] = convo;
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
        convoMap
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
      return { message: 'Error getting conversation title' };
    }
  },
  deleteConvos: async (user, filter) => {
    let toRemove = await Conversation.find({ ...filter, user }).select('conversationId');
    const ids = toRemove.map((instance) => instance.conversationId);
    let deleteCount = await Conversation.deleteMany({ ...filter, user }).exec();
    deleteCount.messages = await deleteMessages({ conversationId: { $in: ids } });
    return deleteCount;
  },
  getRecentConvos: async (userId) => {
    try {
      return await Conversation.find({
        user: { $ne: userId },
        isPrivate: {$eq: false}
      }).sort( {updatedAt: -1} ).limit(3).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error fetching recent conversations' };
    }
  }
};
