const Conversation = require('./schema/convoSchema');
const { getMessages, deleteMessages } = require('./Message');
const logger = require('~/config/winston');

const getConvo = async (user, conversationId) => {
  try {
    return await Conversation.findOne({ user, conversationId }).lean();
  } catch (error) {
    logger.error('[getConvo] Error getting single conversation', error);
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
        upsert: true,
      });
    } catch (error) {
      logger.error('[saveConvo] Error saving conversation', error);
      return { message: 'Error saving conversation' };
    }
  },
  getConvosByPage: async (user, pageNumber = 1, pageSize = 14) => {
    try {
      const totalConvos = (await Conversation.countDocuments({ user })) || 1;
      const totalPages = Math.ceil(totalConvos / pageSize);
      const convos = await Conversation.find({ user })
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean();
      return { conversations: convos, pages: totalPages, pageNumber, pageSize };
    } catch (error) {
      logger.error('[getConvosByPage] Error getting conversations', error);
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

      convoIds.forEach((convo) =>
        promises.push(
          Conversation.findOne({
            user,
            conversationId: convo.conversationId,
          }).lean(),
        ),
      );

      const results = (await Promise.all(promises)).filter(Boolean);

      results.forEach((convo, i) => {
        const page = Math.floor(i / pageSize) + 1;
        if (!cache[page]) {
          cache[page] = [];
        }
        cache[page].push(convo);
        convoMap[convo.conversationId] = convo;
      });

      const totalPages = Math.ceil(results.length / pageSize);
      cache.pages = totalPages;
      cache.pageSize = pageSize;
      return {
        cache,
        conversations: cache[pageNumber] || [],
        pages: totalPages || 1,
        pageNumber,
        pageSize,
        convoMap,
      };
    } catch (error) {
      logger.error('[getConvosQueried] Error getting conversations', error);
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
      logger.error('[getConvoTitle] Error getting conversation title', error);
      return { message: 'Error getting conversation title' };
    }
  },
  /**
   * Asynchronously deletes conversations and associated messages for a given user and filter.
   *
   * @async
   * @function
   * @param {string|ObjectId} user - The user's ID.
   * @param {Object} filter - Additional filter criteria for the conversations to be deleted.
   * @returns {Promise<{ n: number, ok: number, deletedCount: number, messages: { n: number, ok: number, deletedCount: number } }>}
   *          An object containing the count of deleted conversations and associated messages.
   * @throws {Error} Throws an error if there's an issue with the database operations.
   *
   * @example
   * const user = 'someUserId';
   * const filter = { someField: 'someValue' };
   * const result = await deleteConvos(user, filter);
   * logger.error(result); // { n: 5, ok: 1, deletedCount: 5, messages: { n: 10, ok: 1, deletedCount: 10 } }
   */
  deleteConvos: async (user, filter) => {
    let toRemove = await Conversation.find({ ...filter, user }).select('conversationId');
    const ids = toRemove.map((instance) => instance.conversationId);
    let deleteCount = await Conversation.deleteMany({ ...filter, user });
    deleteCount.messages = await deleteMessages({ conversationId: { $in: ids } });
    return deleteCount;
  },
};
