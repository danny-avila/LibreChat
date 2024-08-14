const ConversationTag = require('./schema/conversationTagSchema');
const Conversation = require('./schema/convoSchema');
const logger = require('~/config/winston');

/**
 * Retrieves all conversation tags for a user.
 * @param {string} user - The user ID.
 * @returns {Promise<Array>} An array of conversation tags.
 */
const getConversationTags = async (user) => {
  try {
    return await ConversationTag.find({ user }).sort({ position: 1 }).lean();
  } catch (error) {
    logger.error('[getConversationTags] Error getting conversation tags', error);
    throw new Error('Error getting conversation tags');
  }
};

/**
 * Creates a new conversation tag.
 * @param {string} user - The user ID.
 * @param {Object} data - The tag data.
 * @param {string} data.tag - The tag name.
 * @param {string} [data.description] - The tag description.
 * @param {boolean} [data.addToConversation] - Whether to add the tag to a conversation.
 * @param {string} [data.conversationId] - The conversation ID to add the tag to.
 * @returns {Promise<Object>} The created tag.
 */
const createConversationTag = async (user, data) => {
  try {
    const { tag, description, addToConversation, conversationId } = data;

    const existingTag = await ConversationTag.findOne({ user, tag }).lean();
    if (existingTag) {
      return existingTag;
    }

    const maxPosition = await ConversationTag.findOne({ user }).sort('-position').lean();
    const position = (maxPosition?.position || 0) + 1;

    const newTag = await ConversationTag.findOneAndUpdate(
      { tag, user },
      {
        tag,
        user,
        count: addToConversation ? 1 : 0,
        position,
        description,
        $setOnInsert: { createdAt: new Date() },
      },
      {
        new: true,
        upsert: true,
        lean: true,
      },
    );

    if (addToConversation && conversationId) {
      await Conversation.findOneAndUpdate(
        { user, conversationId },
        { $addToSet: { tags: tag } },
        { new: true },
      );
    }

    return newTag;
  } catch (error) {
    logger.error('[createConversationTag] Error creating conversation tag', error);
    throw new Error('Error creating conversation tag');
  }
};

/**
 * Updates an existing conversation tag.
 * @param {string} user - The user ID.
 * @param {string} oldTag - The current tag name.
 * @param {Object} data - The updated tag data.
 * @param {string} [data.tag] - The new tag name.
 * @param {string} [data.description] - The updated description.
 * @param {number} [data.position] - The new position.
 * @returns {Promise<Object>} The updated tag.
 */
const updateConversationTag = async (user, oldTag, data) => {
  try {
    const { tag: newTag, description, position } = data;

    const existingTag = await ConversationTag.findOne({ user, tag: oldTag }).lean();
    if (!existingTag) {
      return null;
    }

    if (newTag && newTag !== oldTag) {
      const tagAlreadyExists = await ConversationTag.findOne({ user, tag: newTag }).lean();
      if (tagAlreadyExists) {
        throw new Error('Tag already exists');
      }

      await Conversation.updateMany({ user, tags: oldTag }, { $set: { 'tags.$': newTag } });
    }

    const updateData = {};
    if (newTag) {
      updateData.tag = newTag;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (position !== undefined) {
      await adjustPositions(user, existingTag.position, position);
      updateData.position = position;
    }

    return await ConversationTag.findOneAndUpdate({ user, tag: oldTag }, updateData, {
      new: true,
      lean: true,
    });
  } catch (error) {
    logger.error('[updateConversationTag] Error updating conversation tag', error);
    throw new Error('Error updating conversation tag');
  }
};

/**
 * Adjusts positions of tags when a tag's position is changed.
 * @param {string} user - The user ID.
 * @param {number} oldPosition - The old position of the tag.
 * @param {number} newPosition - The new position of the tag.
 * @returns {Promise<void>}
 */
const adjustPositions = async (user, oldPosition, newPosition) => {
  if (oldPosition === newPosition) {
    return;
  }

  const update = oldPosition < newPosition ? { $inc: { position: -1 } } : { $inc: { position: 1 } };
  const position =
    oldPosition < newPosition
      ? {
          $gt: Math.min(oldPosition, newPosition),
          $lte: Math.max(oldPosition, newPosition),
        }
      : {
          $gte: Math.min(oldPosition, newPosition),
          $lt: Math.max(oldPosition, newPosition),
        };

  await ConversationTag.updateMany(
    {
      user,
      position,
    },
    update,
  );
};

/**
 * Deletes a conversation tag.
 * @param {string} user - The user ID.
 * @param {string} tag - The tag to delete.
 * @returns {Promise<Object>} The deleted tag.
 */
const deleteConversationTag = async (user, tag) => {
  try {
    const deletedTag = await ConversationTag.findOneAndDelete({ user, tag }).lean();
    if (!deletedTag) {
      return null;
    }

    await Conversation.updateMany({ user, tags: tag }, { $pull: { tags: tag } });

    await ConversationTag.updateMany(
      { user, position: { $gt: deletedTag.position } },
      { $inc: { position: -1 } },
    );

    return deletedTag;
  } catch (error) {
    logger.error('[deleteConversationTag] Error deleting conversation tag', error);
    throw new Error('Error deleting conversation tag');
  }
};

/**
 * Updates tags for a specific conversation.
 * @param {string} user - The user ID.
 * @param {string} conversationId - The conversation ID.
 * @param {string[]} tags - The new set of tags for the conversation.
 * @returns {Promise<string[]>} The updated list of tags for the conversation.
 */
const updateTagsForConversation = async (user, conversationId, tags) => {
  try {
    const conversation = await Conversation.findOne({ user, conversationId }).lean();
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const oldTags = new Set(conversation.tags);
    const newTags = new Set(tags);

    const addedTags = [...newTags].filter((tag) => !oldTags.has(tag));
    const removedTags = [...oldTags].filter((tag) => !newTags.has(tag));

    const bulkOps = [];

    for (const tag of addedTags) {
      bulkOps.push({
        updateOne: {
          filter: { user, tag },
          update: { $inc: { count: 1 } },
          upsert: true,
        },
      });
    }

    for (const tag of removedTags) {
      bulkOps.push({
        updateOne: {
          filter: { user, tag },
          update: { $inc: { count: -1 } },
        },
      });
    }

    if (bulkOps.length > 0) {
      await ConversationTag.bulkWrite(bulkOps);
    }

    const updatedConversation = (
      await Conversation.findOneAndUpdate(
        { user, conversationId },
        { $set: { tags: [...newTags] } },
        { new: true },
      )
    ).toObject();

    return updatedConversation.tags;
  } catch (error) {
    logger.error('[updateTagsForConversation] Error updating tags', error);
    throw new Error('Error updating tags for conversation');
  }
};

module.exports = {
  getConversationTags,
  createConversationTag,
  updateConversationTag,
  deleteConversationTag,
  updateTagsForConversation,
};
