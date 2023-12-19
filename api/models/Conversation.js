const Conversation = require('./schema/convoSchema');
const { getMessages, deleteMessages } = require('./Message');
const logger = require('~/config/winston');

const getConvo = async (user, conversationId) => {
  try {
    if (conversationId != null) {
      return await Conversation.findOne({ conversationId }).lean();
    } else {
      return await Conversation.findOne({ user, conversationId }).lean();
    }
  } catch (error) {
    logger.error('[getConvo] Error getting single conversation', error);
    return { message: 'Error getting single conversation' };
  }
};

module.exports = {
  Conversation,
  getSharedConvo: async (conversationId) => {
    try {
      return await Conversation.findOne({ conversationId }).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error getting single conversation' };
    }
  },
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
  getRecentConvos: async (userId) => {
    try {
      return await Conversation.find({
        user: { $ne: userId },
        isPrivate: { $eq: false },
      })
        .sort({ createdAt: -1 })
        .limit(200)
        .exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error fetching recent conversations' };
    }
  },
  getFollowingConvos: async (following) => {
    try {
      return await Conversation.find({
        user: { $in: following },
        isPrivate: { $eq: false },
      })
        .sort({ createdAt: -1 })
        .limit(200)
        .exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error fetching recent conversations' };
    }
  },

  likeConvo: async (conversationId, userId, liked) => {
    try {
      const conversation = await Conversation.findOne({ conversationId });
      const likedBy = conversation.likedBy;

      const update = {};
      update[`likedBy.${userId}`] = { $type: 'date' };

      if (!likedBy) {
        // If the likedBy object is undefined, that means this conversation has 0 likes
        return await Conversation.findOneAndUpdate(
          { conversationId },
          { $currentDate: update, $inc: { likes: 1 } },
          { new: true, upsert: false },
        ).exec();
      } else {
        // User request is the same as DB record
        // e.g. User wants to like the conversation, but DB says that the user has already liked the conversation
        if ((likedBy[userId] && liked) || (!likedBy[userId] && !liked)) {
          return conversation;
        } else if (liked) {
          return await Conversation.findOneAndUpdate(
            { conversationId },
            { $currentDate: update, $inc: { likes: 1 } },
            { new: true, upsert: false },
          ).exec();
        } else {
          // User request is different from DB record
          return await Conversation.findOneAndUpdate(
            { conversationId },
            { $unset: update, $inc: { likes: -1 } },
            { new: true, upsert: false },
          ).exec();
        }
      }
    } catch (error) {
      console.log(error);
      return { message: 'Error liking conversation' };
    }
  },
  getHottestConvo: async (userId) => {
    console.log(`calling getHottestConvo(${userId})`);
    try {
      return await Conversation.aggregate([
        {
          $match: {
            isPrivate: { $eq: false },
            user: { $ne: userId },
          },
        }, // Filter for documents where isPrivate is false and user is not equal to userId
        {
          $addFields: {
            totalLikesAndViewCount: { $sum: ['$likes', '$viewCount'] },
          },
        },
        { $sort: { totalLikesAndViewCount: -1 } },
        { $limit: 200 },
      ]);
    } catch (error) {
      console.log(error);
      return { message: 'Error getting the hottest conversations' };
    }
  },
  getLikedConvos: async (userId) => {
    try {
      const filter = {};
      filter[`likedBy.${userId}`] = { $exists: true };

      const sortOrder = {};
      sortOrder[`likedBy.${userId}`] = -1;
      sortOrder['title'] = 1;

      const dbResponse = await Conversation.find(filter).limit(30).sort(sortOrder).exec();
      return dbResponse;
    } catch (error) {
      console.log(error);
      return { message: 'Error fetching liked conversations' };
    }
  },
  getPublicConvos: async (userId) => {
    try {
      const dbResponse = await Conversation.find({
        user: { $eq: userId },
        isPrivate: { $eq: false },
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .exec();

      return dbResponse;
    } catch (error) {
      console.log(error);
      return { message: 'Error fetching liked conversations' };
    }
  },
  //increase conversation view count
  increaseConvoViewCount: async (conversationId) => {
    console.log(`increaseConvoViewCount(${conversationId}) called.`);
    try {
      return await Conversation.findOneAndUpdate(
        { conversationId },
        { $inc: { viewCount: 1 } },
        { new: true, upsert: false },
      ).exec();
    } catch (error) {
      console.log(error);
      return { message: `Error increasing view count for conversation ${conversationId}` };
    }
  },
};
