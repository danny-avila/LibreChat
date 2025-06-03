const { logger } = require('@librechat/data-schemas');
const { getMessages, deleteMessages } = require('./Message');
const { Conversation } = require('~/db/models');

/**
 * Searches for a conversation by conversationId and returns a lean document with only conversationId and user.
 * @param {string} conversationId - The conversation's ID.
 * @returns {Promise<{conversationId: string, user: string} | null>} The conversation object with selected fields or null if not found.
 */
const searchConversation = async (conversationId) => {
  try {
    return await Conversation.findOne({ conversationId }, 'conversationId user').lean();
  } catch (error) {
    logger.error('[searchConversation] Error searching conversation', error);
    throw new Error('Error searching conversation');
  }
};

/**
 * Retrieves a single conversation for a given user and conversation ID.
 * @param {string} user - The user's ID.
 * @param {string} conversationId - The conversation's ID.
 * @returns {Promise<TConversation>} The conversation object.
 */
const getConvo = async (user, conversationId) => {
  try {
    return await Conversation.findOne({ user, conversationId }).lean();
  } catch (error) {
    logger.error('[getConvo] Error getting single conversation', error);
    return { message: 'Error getting single conversation' };
  }
};

const deleteNullOrEmptyConversations = async () => {
  try {
    const filter = {
      $or: [
        { conversationId: null },
        { conversationId: '' },
        { conversationId: { $exists: false } },
      ],
    };

    const result = await Conversation.deleteMany(filter);

    // Delete associated messages
    const messageDeleteResult = await deleteMessages(filter);

    logger.info(
      `[deleteNullOrEmptyConversations] Deleted ${result.deletedCount} conversations and ${messageDeleteResult.deletedCount} messages`,
    );

    return {
      conversations: result,
      messages: messageDeleteResult,
    };
  } catch (error) {
    logger.error('[deleteNullOrEmptyConversations] Error deleting conversations', error);
    throw new Error('Error deleting conversations with null or empty conversationId');
  }
};

/**
 * Searches for a conversation by conversationId and returns associated file ids.
 * @param {string} conversationId - The conversation's ID.
 * @returns {Promise<string[] | null>}
 */
const getConvoFiles = async (conversationId) => {
  try {
    return (await Conversation.findOne({ conversationId }, 'files').lean())?.files ?? [];
  } catch (error) {
    logger.error('[getConvoFiles] Error getting conversation files', error);
    throw new Error('Error getting conversation files');
  }
};

module.exports = {
  getConvoFiles,
  searchConversation,
  deleteNullOrEmptyConversations,
  /**
   * Saves a conversation to the database.
   * @param {Object} req - The request object.
   * @param {string} conversationId - The conversation's ID.
   * @param {Object} metadata - Additional metadata to log for operation.
   * @returns {Promise<TConversation>} The conversation object.
   */
  saveConvo: async (req, { conversationId, newConversationId, ...convo }, metadata) => {
    try {
      if (metadata?.context) {
        logger.debug(`[saveConvo] ${metadata.context}`);
      }

      const messages = await getMessages({ conversationId }, '_id');
      const update = { ...convo, messages, user: req.user.id };

      if (newConversationId) {
        update.conversationId = newConversationId;
      }

      if (req.body.isTemporary) {
        const expiredAt = new Date();
        expiredAt.setDate(expiredAt.getDate() + 30);
        update.expiredAt = expiredAt;
      } else {
        update.expiredAt = null;
      }

      /** @type {{ $set: Partial<TConversation>; $unset?: Record<keyof TConversation, number> }} */
      const updateOperation = { $set: update };
      if (metadata && metadata.unsetFields && Object.keys(metadata.unsetFields).length > 0) {
        updateOperation.$unset = metadata.unsetFields;
      }

      /** Note: the resulting Model object is necessary for Meilisearch operations */
      const conversation = await Conversation.findOneAndUpdate(
        { conversationId, user: req.user.id },
        updateOperation,
        {
          new: true,
          upsert: true,
        },
      );

      return conversation.toObject();
    } catch (error) {
      logger.error('[saveConvo] Error saving conversation', error);
      if (metadata && metadata?.context) {
        logger.info(`[saveConvo] ${metadata.context}`);
      }
      return { message: 'Error saving conversation' };
    }
  },
  bulkSaveConvos: async (conversations) => {
    try {
      const bulkOps = conversations.map((convo) => ({
        updateOne: {
          filter: { conversationId: convo.conversationId, user: convo.user },
          update: convo,
          upsert: true,
          timestamps: false,
        },
      }));

      const result = await Conversation.bulkWrite(bulkOps);
      return result;
    } catch (error) {
      logger.error('[saveBulkConversations] Error saving conversations in bulk', error);
      throw new Error('Failed to save conversations in bulk.');
    }
  },
  getConvosByCursor: async (
    user,
    { cursor, limit = 25, isArchived = false, tags, search, order = 'desc' } = {},
  ) => {
    const filters = [{ user }];
    if (isArchived) {
      filters.push({ isArchived: true });
    } else {
      filters.push({ $or: [{ isArchived: false }, { isArchived: { $exists: false } }] });
    }

    if (Array.isArray(tags) && tags.length > 0) {
      filters.push({ tags: { $in: tags } });
    }

    filters.push({ $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }] });

    if (search) {
      try {
        const meiliResults = await Conversation.meiliSearch(search);
        const matchingIds = Array.isArray(meiliResults.hits)
          ? meiliResults.hits.map((result) => result.conversationId)
          : [];
        if (!matchingIds.length) {
          return { conversations: [], nextCursor: null };
        }
        filters.push({ conversationId: { $in: matchingIds } });
      } catch (error) {
        logger.error('[getConvosByCursor] Error during meiliSearch', error);
        return { message: 'Error during meiliSearch' };
      }
    }

    if (cursor) {
      filters.push({ updatedAt: { $lt: new Date(cursor) } });
    }

    const query = filters.length === 1 ? filters[0] : { $and: filters };

    try {
      const convos = await Conversation.find(query)
        .select(
          'conversationId endpoint title createdAt updatedAt user model agent_id assistant_id spec iconURL',
        )
        .sort({ updatedAt: order === 'asc' ? 1 : -1 })
        .limit(limit + 1)
        .lean();

      let nextCursor = null;
      if (convos.length > limit) {
        const lastConvo = convos.pop();
        nextCursor = lastConvo.updatedAt.toISOString();
      }

      return { conversations: convos, nextCursor };
    } catch (error) {
      logger.error('[getConvosByCursor] Error getting conversations', error);
      return { message: 'Error getting conversations' };
    }
  },
  getConvosQueried: async (user, convoIds, cursor = null, limit = 25) => {
    try {
      if (!convoIds?.length) {
        return { conversations: [], nextCursor: null, convoMap: {} };
      }

      const conversationIds = convoIds.map((convo) => convo.conversationId);

      const results = await Conversation.find({
        user,
        conversationId: { $in: conversationIds },
        $or: [{ expiredAt: { $exists: false } }, { expiredAt: null }],
      }).lean();

      results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      let filtered = results;
      if (cursor && cursor !== 'start') {
        const cursorDate = new Date(cursor);
        filtered = results.filter((convo) => new Date(convo.updatedAt) < cursorDate);
      }

      const limited = filtered.slice(0, limit + 1);
      let nextCursor = null;
      if (limited.length > limit) {
        const lastConvo = limited.pop();
        nextCursor = lastConvo.updatedAt.toISOString();
      }

      const convoMap = {};
      limited.forEach((convo) => {
        convoMap[convo.conversationId] = convo;
      });

      return { conversations: limited, nextCursor, convoMap };
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
    try {
      const userFilter = { ...filter, user };
      const conversations = await Conversation.find(userFilter).select('conversationId');
      const conversationIds = conversations.map((c) => c.conversationId);

      if (!conversationIds.length) {
        throw new Error('Conversation not found or already deleted.');
      }

      const deleteConvoResult = await Conversation.deleteMany(userFilter);

      const deleteMessagesResult = await deleteMessages({
        conversationId: { $in: conversationIds },
      });

      return { ...deleteConvoResult, messages: deleteMessagesResult };
    } catch (error) {
      logger.error('[deleteConvos] Error deleting conversations and messages', error);
      throw error;
    }
  },
};
