//const crypto = require('crypto');

const logger = require('~/config/winston');
const Conversation = require('./schema/convoSchema');
const ConversationTag = require('./schema/conversationTagSchema');

const SAVED_TAG = 'Saved';

const updateTagsForConversation = async (user, conversationId, tags) => {
  try {
    const conversation = await Conversation.findOne({ user, conversationId });
    if (!conversation) {
      return { message: 'Conversation not found' };
    }

    const addedTags = tags.tags.filter((tag) => !conversation.tags.includes(tag));
    const removedTags = conversation.tags.filter((tag) => !tags.tags.includes(tag));
    for (const tag of addedTags) {
      await ConversationTag.updateOne({ tag, user }, { $inc: { count: 1 } }, { upsert: true });
    }
    for (const tag of removedTags) {
      await ConversationTag.updateOne({ tag, user }, { $inc: { count: -1 } });
    }
    conversation.tags = tags.tags;
    await conversation.save({ timestamps: { updatedAt: false } });
    return conversation.tags;
  } catch (error) {
    logger.error('[updateTagsToConversation] Error updating tags', error);
    return { message: 'Error updating tags' };
  }
};

const createConversationTag = async (user, data) => {
  try {
    const cTag = await ConversationTag.findOne({ user, tag: data.tag });
    if (cTag) {
      return cTag;
    }

    const addToConversation = data.addToConversation && data.conversationId;
    const newTag = await ConversationTag.create({
      user,
      tag: data.tag,
      count: 0,
      description: data.description,
      position: 1,
    });

    await ConversationTag.updateMany(
      { user, position: { $gte: 1 }, _id: { $ne: newTag._id } },
      { $inc: { position: 1 } },
    );

    if (addToConversation) {
      const conversation = await Conversation.findOne({
        user,
        conversationId: data.conversationId,
      });
      if (conversation) {
        const tags = [...(conversation.tags || []), data.tag];
        await updateTagsForConversation(user, data.conversationId, { tags });
      } else {
        logger.warn('[updateTagsForConversation] Conversation not found', data.conversationId);
      }
    }

    return await ConversationTag.findOne({ user, tag: data.tag });
  } catch (error) {
    logger.error('[createConversationTag] Error updating conversation tag', error);
    return { message: 'Error updating conversation tag' };
  }
};

const replaceOrRemoveTagInConversations = async (user, oldtag, newtag) => {
  try {
    const conversations = await Conversation.find({ user, tags: { $in: [oldtag] } });
    for (const conversation of conversations) {
      if (newtag && newtag !== '') {
        conversation.tags = conversation.tags.map((tag) => (tag === oldtag ? newtag : tag));
      } else {
        conversation.tags = conversation.tags.filter((tag) => tag !== oldtag);
      }
      await conversation.save({ timestamps: { updatedAt: false } });
    }
  } catch (error) {
    logger.error('[replaceOrRemoveTagInConversations] Error updating conversation tags', error);
    return { message: 'Error updating conversation tags' };
  }
};

const updateTagPosition = async (user, tag, newPosition) => {
  try {
    const cTag = await ConversationTag.findOne({ user, tag });
    if (!cTag) {
      return { message: 'Tag not found' };
    }

    const oldPosition = cTag.position;

    if (newPosition === oldPosition) {
      return cTag;
    }

    const updateOperations = [];

    if (newPosition > oldPosition) {
      // Move other tags up
      updateOperations.push({
        updateMany: {
          filter: {
            user,
            position: { $gt: oldPosition, $lte: newPosition },
            tag: { $ne: SAVED_TAG },
          },
          update: { $inc: { position: -1 } },
        },
      });
    } else {
      // Move other tags down
      updateOperations.push({
        updateMany: {
          filter: {
            user,
            position: { $gte: newPosition, $lt: oldPosition },
            tag: { $ne: SAVED_TAG },
          },
          update: { $inc: { position: 1 } },
        },
      });
    }

    // Update the target tag's position
    updateOperations.push({
      updateOne: {
        filter: { _id: cTag._id },
        update: { $set: { position: newPosition } },
      },
    });

    await ConversationTag.bulkWrite(updateOperations);

    return await ConversationTag.findById(cTag._id);
  } catch (error) {
    logger.error('[updateTagPosition] Error updating tag position', error);
    return { message: 'Error updating tag position' };
  }
};
module.exports = {
  SAVED_TAG,
  ConversationTag,
  getConversationTags: async (user) => {
    try {
      const cTags = await ConversationTag.find({ user }).sort({ position: 1 }).lean();
      cTags.sort((a, b) => (a.tag === SAVED_TAG ? -1 : b.tag === SAVED_TAG ? 1 : 0));

      return cTags;
    } catch (error) {
      logger.error('[getShare] Error getting share link', error);
      return { message: 'Error getting share link' };
    }
  },

  createConversationTag,
  updateConversationTag: async (user, tag, data) => {
    try {
      const cTag = await ConversationTag.findOne({ user, tag });
      if (!cTag) {
        return createConversationTag(user, data);
      }

      if (cTag.tag !== data.tag || cTag.description !== data.description) {
        cTag.tag = data.tag;
        cTag.description = data.description === undefined ? cTag.description : data.description;
        await cTag.save();
      }

      if (data.position !== undefined && cTag.position !== data.position) {
        await updateTagPosition(user, tag, data.position);
      }

      // update conversation tags properties
      replaceOrRemoveTagInConversations(user, tag, data.tag);
      return await ConversationTag.findOne({ user, tag: data.tag });
    } catch (error) {
      logger.error('[updateConversationTag] Error updating conversation tag', error);
      return { message: 'Error updating conversation tag' };
    }
  },

  deleteConversationTag: async (user, tag) => {
    try {
      const currentTag = await ConversationTag.findOne({ user, tag });
      if (!currentTag) {
        return;
      }

      await currentTag.deleteOne({ user, tag });

      await replaceOrRemoveTagInConversations(user, tag, null);
      return currentTag;
    } catch (error) {
      logger.error('[deleteConversationTag] Error deleting conversation tag', error);
      return { message: 'Error deleting conversation tag' };
    }
  },

  updateTagsForConversation,
  rebuildConversationTags: async (user) => {
    try {
      const conversations = await Conversation.find({ user }).select('tags');
      const tagCountMap = {};

      // Count the occurrences of each tag
      conversations.forEach((conversation) => {
        conversation.tags.forEach((tag) => {
          if (tagCountMap[tag]) {
            tagCountMap[tag]++;
          } else {
            tagCountMap[tag] = 1;
          }
        });
      });

      const tags = await ConversationTag.find({ user }).sort({ position: -1 });

      // Update existing tags and add new tags
      for (const [tag, count] of Object.entries(tagCountMap)) {
        const existingTag = tags.find((t) => t.tag === tag);
        if (existingTag) {
          existingTag.count = count;
          await existingTag.save();
        } else {
          const newTag = new ConversationTag({ user, tag, count });
          tags.push(newTag);
          await newTag.save();
        }
      }

      // Set count to 0 for tags that are not in the grouped tags
      for (const tag of tags) {
        if (!tagCountMap[tag.tag]) {
          tag.count = 0;
          await tag.save();
        }
      }

      // Sort tags by position in descending order
      tags.sort((a, b) => a.position - b.position);

      // Move the tag with name "saved" to the first position
      const savedTagIndex = tags.findIndex((tag) => tag.tag === SAVED_TAG);
      if (savedTagIndex !== -1) {
        const [savedTag] = tags.splice(savedTagIndex, 1);
        tags.unshift(savedTag);
      }

      // Reassign positions starting from 0
      tags.forEach((tag, index) => {
        tag.position = index;
        tag.save();
      });
      return tags;
    } catch (error) {
      logger.error('[rearrangeTags] Error rearranging tags', error);
      return { message: 'Error rearranging tags' };
    }
  },
};
