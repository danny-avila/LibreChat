import type { Model } from 'mongoose';
import logger from '~/config/winston';

interface IConversationTag {
  user: string;
  tag: string;
  description?: string;
  position: number;
  count: number;
  createdAt?: Date;
  [key: string]: unknown;
}

export function createConversationTagMethods(mongoose: typeof import('mongoose')) {
  /**
   * Retrieves all conversation tags for a user.
   */
  async function getConversationTags(user: string) {
    try {
      const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
      return await ConversationTag.find({ user }).sort({ position: 1 }).lean();
    } catch (error) {
      logger.error('[getConversationTags] Error getting conversation tags', error);
      throw new Error('Error getting conversation tags');
    }
  }

  /**
   * Creates a new conversation tag.
   */
  async function createConversationTag(
    user: string,
    data: {
      tag: string;
      description?: string;
      addToConversation?: boolean;
      conversationId?: string;
    },
  ) {
    try {
      const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
      const Conversation = mongoose.models.Conversation;
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
  }

  /**
   * Adjusts positions of tags when a tag's position is changed.
   */
  async function adjustPositions(user: string, oldPosition: number, newPosition: number) {
    if (oldPosition === newPosition) {
      return;
    }

    const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;

    const update =
      oldPosition < newPosition ? { $inc: { position: -1 } } : { $inc: { position: 1 } };
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

    await ConversationTag.updateMany({ user, position }, update);
  }

  /**
   * Updates an existing conversation tag.
   */
  async function updateConversationTag(
    user: string,
    oldTag: string,
    data: { tag?: string; description?: string; position?: number },
  ) {
    try {
      const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
      const Conversation = mongoose.models.Conversation;
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

      const updateData: Record<string, unknown> = {};
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
  }

  /**
   * Deletes a conversation tag.
   */
  async function deleteConversationTag(user: string, tag: string) {
    try {
      const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
      const Conversation = mongoose.models.Conversation;

      const deletedTag = await ConversationTag.findOneAndDelete({ user, tag }).lean();
      if (!deletedTag) {
        return null;
      }

      await Conversation.updateMany({ user, tags: tag }, { $pullAll: { tags: [tag] } });

      await ConversationTag.updateMany(
        { user, position: { $gt: deletedTag.position } },
        { $inc: { position: -1 } },
      );

      return deletedTag;
    } catch (error) {
      logger.error('[deleteConversationTag] Error deleting conversation tag', error);
      throw new Error('Error deleting conversation tag');
    }
  }

  /**
   * Updates tags for a specific conversation.
   */
  async function updateTagsForConversation(user: string, conversationId: string, tags: string[]) {
    try {
      const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
      const Conversation = mongoose.models.Conversation;

      const conversation = await Conversation.findOne({ user, conversationId }).lean();
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const oldTags = new Set<string>(
        ((conversation as Record<string, unknown>).tags as string[]) ?? [],
      );
      const newTags = new Set(tags);

      const addedTags = [...newTags].filter((tag) => !oldTags.has(tag));
      const removedTags = [...oldTags].filter((tag) => !newTags.has(tag));

      const bulkOps: Array<{
        updateOne: {
          filter: Record<string, unknown>;
          update: Record<string, unknown>;
          upsert?: boolean;
        };
      }> = [];

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
  }

  /**
   * Increments tag counts for existing tags only.
   */
  async function bulkIncrementTagCounts(user: string, tags: string[]) {
    if (!tags || tags.length === 0) {
      return;
    }

    try {
      const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
      const uniqueTags = [...new Set(tags.filter(Boolean))];
      if (uniqueTags.length === 0) {
        return;
      }

      const bulkOps = uniqueTags.map((tag) => ({
        updateOne: {
          filter: { user, tag },
          update: { $inc: { count: 1 } },
        },
      }));

      const result = await ConversationTag.bulkWrite(bulkOps);
      if (result && result.modifiedCount > 0) {
        logger.debug(
          `user: ${user} | Incremented tag counts - modified ${result.modifiedCount} tags`,
        );
      }
    } catch (error) {
      logger.error('[bulkIncrementTagCounts] Error incrementing tag counts', error);
    }
  }

  /**
   * Deletes all conversation tags matching the given filter.
   */
  async function deleteConversationTags(filter: Record<string, unknown>): Promise<number> {
    try {
      const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
      const result = await ConversationTag.deleteMany(filter);
      return result.deletedCount;
    } catch (error) {
      logger.error('[deleteConversationTags] Error deleting conversation tags', error);
      throw new Error('Error deleting conversation tags');
    }
  }

  return {
    getConversationTags,
    createConversationTag,
    updateConversationTag,
    deleteConversationTag,
    deleteConversationTags,
    bulkIncrementTagCounts,
    updateTagsForConversation,
  };
}

export type ConversationTagMethods = ReturnType<typeof createConversationTagMethods>;
