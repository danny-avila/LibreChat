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
        isPrivate: { $eq: false }
      }).sort( { createdAt: -1 } ).limit(200).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error fetching recent conversations' };
    }
  },
  getFollowingConvos: async (following) => {
    try {
      return await Conversation.find({
        user: { $in: following },
        isPrivate: { $eq: false }
      }).sort( { createdAt: -1 } ).limit(200).exec();
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

      if (!likedBy) { // If the likedBy object is undefined, that means this conversation has 0 likes
        return await Conversation.findOneAndUpdate(
          { conversationId },
          { $currentDate: update, $inc: { likes: 1 } },
          { new: true, upsert: false }
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
            { new: true, upsert: false }
          ).exec();
        } else { // User request is different from DB record
          return await Conversation.findOneAndUpdate(
            { conversationId },
            { $unset: update, $inc: { likes: -1 } },
            { new: true, upsert: false }
          ).exec();
        }
      }
    } catch (error) {
      console.log(error);
      return { message: 'Error liking conversation' };
    }
  },
  getHottestConvo: async (userId) => {
    try {
      return await Conversation.find({
        user: { $ne: userId },
        isPrivate: { $eq: false }
      }).sort({ likes: -1 }) // Sort by count in descending order (hottest first)
        .limit(200).exec();
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
        isPrivate: { $eq: false }
      }).sort({ createdAt: -1 }).limit(30).exec();

      return dbResponse;
    } catch (error) {
      console.log(error);
      return { message: 'Error fetching liked conversations' };
    }
  }
};
