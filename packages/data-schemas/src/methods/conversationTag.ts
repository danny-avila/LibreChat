import type { FilterQuery, Model } from 'mongoose';
import { tenantSafeBulkWrite } from '~/utils/tenantBulkWrite';
import logger from '~/config/winston';

interface IConversationTag {
  user: string;
  tenantId?: string;
  tag: string;
  description?: string;
  position: number;
  count: number;
  createdAt?: Date;
  [key: string]: unknown;
}

function optionalTenantFilter<T>(tenantId?: string | null): FilterQuery<T> {
  if (tenantId === null) {
    return { tenantId: { $exists: false } } as FilterQuery<T>;
  }
  return (tenantId === undefined ? {} : { tenantId }) as FilterQuery<T>;
}

/** Maintains legacy cached deltas for existing writers. Public counts are derived
 * from committed conversations; callers deduplicate tags per conversation. */
export async function decrementTagCounts(
  mongoose: typeof import('mongoose'),
  user: string,
  tags: string[],
  tenantId?: string | null,
): Promise<void> {
  if (!tags.length) {
    return;
  }

  const decrementByTag = new Map<string, number>();
  for (const tag of tags) {
    if (!tag) {
      continue;
    }
    decrementByTag.set(tag, (decrementByTag.get(tag) ?? 0) + 1);
  }

  if (decrementByTag.size === 0) {
    return;
  }

  try {
    const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
    const tenantFilter = optionalTenantFilter<IConversationTag>(tenantId);
    const bulkOps = [...decrementByTag.entries()].flatMap(([tag, amount]) => [
      {
        updateOne: {
          filter: { user, tag, count: null, ...tenantFilter },
          update: { $set: { count: 0 } },
        },
      },
      {
        updateOne: {
          filter: { user, tag, ...tenantFilter },
          update: { $inc: { count: -amount } },
          upsert: true,
        },
      },
    ]);

    await tenantSafeBulkWrite(ConversationTag, bulkOps);
  } catch (error) {
    logger.error('[decrementTagCounts] Error decrementing tag counts', error);
  }
}

export function createConversationTagMethods(mongoose: typeof import('mongoose')): {
  getConversationTags: (
    user: string,
    tenantId?: string | null,
  ) => Promise<
    (import('mongoose').FlattenMaps<{
      [x: string]: unknown;
      user: string;
      tag: string;
      description?: string | undefined;
      position: number;
      count: number;
      createdAt?: Date | undefined;
    }> & {
      _id: import('mongoose').Types.ObjectId;
    } & {
      __v: number;
    })[]
  >;
  createConversationTag: (
    user: string,
    data: {
      tag: string;
      description?: string;
      addToConversation?: boolean;
      conversationId?: string;
    },
  ) => Promise<
    | (import('mongoose').FlattenMaps<{
        [x: string]: unknown;
        user: string;
        tag: string;
        description?: string | undefined;
        position: number;
        count: number;
        createdAt?: Date | undefined;
      }> & {
        _id: import('mongoose').Types.ObjectId;
      } & {
        __v: number;
      })
    | null
  >;
  updateConversationTag: (
    user: string,
    oldTag: string,
    data: { tag?: string; description?: string; position?: number },
  ) => Promise<
    | (import('mongoose').FlattenMaps<{
        [x: string]: unknown;
        user: string;
        tag: string;
        description?: string | undefined;
        position: number;
        count: number;
        createdAt?: Date | undefined;
      }> & {
        _id: import('mongoose').Types.ObjectId;
      } & {
        __v: number;
      })
    | null
  >;
  deleteConversationTag: (
    user: string,
    tag: string,
  ) => Promise<
    | (import('mongoose').FlattenMaps<{
        [x: string]: unknown;
        user: string;
        tag: string;
        description?: string | undefined;
        position: number;
        count: number;
        createdAt?: Date | undefined;
      }> & {
        _id: import('mongoose').Types.ObjectId;
      } & {
        __v: number;
      })
    | null
  >;
  deleteConversationTags: (filter: Record<string, unknown>) => Promise<number>;
  bulkIncrementTagCounts: (user: string, tags: string[]) => Promise<void>;
  updateTagsForConversation: (
    user: string,
    conversationId: string,
    tags: string[],
    tenantId?: string | null,
  ) => Promise<string[]>;
  reconcileConversationTagCounts: (
    user: string,
    previousTags: string[],
    nextTags: string[],
    tenantId?: string | null,
  ) => Promise<void>;
} {
  function countKey(tag: string, tenantId?: string | null): string {
    return JSON.stringify([tag, tenantId ?? null]);
  }

  async function withCommittedCount<T extends IConversationTag>(tag: T): Promise<T> {
    const count = await mongoose.models.Conversation.countDocuments({
      user: tag.user,
      tags: tag.tag,
      ...optionalTenantFilter(tag.tenantId ?? null),
    });
    return { ...tag, count };
  }

  /**
   * Retrieves all conversation tags for a user.
   */
  async function getConversationTags(
    user: string,
    tenantId?: string | null,
  ): Promise<
    (import('mongoose').FlattenMaps<{
      [x: string]: unknown;
      user: string;
      tag: string;
      description?: string | undefined;
      position: number;
      count: number;
      createdAt?: Date | undefined;
    }> & {
      _id: import('mongoose').Types.ObjectId;
    } & {
      __v: number;
    })[]
  > {
    try {
      const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
      const scope = { user, ...optionalTenantFilter<IConversationTag>(tenantId) };
      const [tags, counts] = await Promise.all([
        ConversationTag.find(scope).sort({ position: 1 }).lean(),
        mongoose.models.Conversation.aggregate<{
          _id: { tag: string; tenantId: string | null };
          count: number;
        }>([
          { $match: { ...scope, 'tags.0': { $exists: true } } },
          { $project: { tenantId: 1, tags: { $setUnion: ['$tags', []] } } },
          { $unwind: '$tags' },
          { $match: { tags: { $type: 'string', $ne: '' } } },
          {
            $group: {
              _id: { tag: '$tags', tenantId: { $ifNull: ['$tenantId', null] } },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);
      const byTag = new Map(
        counts.map(({ _id, count }) => [countKey(_id.tag, _id.tenantId), count]),
      );
      const catalogKeys = new Set(tags.map((tag) => countKey(tag.tag, tag.tenantId)));
      const missing = counts.filter(({ _id }) => !catalogKeys.has(countKey(_id.tag, _id.tenantId)));

      // Conversation tags are authoritative. Recover catalog metadata even when a
      // post-commit update failed; legacy cached counters never supply public counts.
      for (let offset = 0; offset < missing.length; offset += 100) {
        await tenantSafeBulkWrite(
          ConversationTag,
          missing.slice(offset, offset + 100).map(({ _id }) => ({
            updateOne: {
              filter: { user, tag: _id.tag, ...optionalTenantFilter(_id.tenantId) },
              update: { $setOnInsert: { position: 0 } },
              upsert: true,
            },
          })),
        );
      }
      const catalog =
        missing.length > 0 ? await ConversationTag.find(scope).sort({ position: 1 }).lean() : tags;
      return catalog.map((tag) => ({
        ...tag,
        count: byTag.get(countKey(tag.tag, tag.tenantId)) ?? 0,
      }));
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
  ): Promise<
    | (import('mongoose').FlattenMaps<{
        [x: string]: unknown;
        user: string;
        tag: string;
        description?: string | undefined;
        position: number;
        count: number;
        createdAt?: Date | undefined;
      }> & {
        _id: import('mongoose').Types.ObjectId;
      } & {
        __v: number;
      })
    | null
  > {
    try {
      const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
      const Conversation = mongoose.models.Conversation;
      const { tag, description, addToConversation, conversationId } = data;

      const existingTag = await ConversationTag.findOne({ user, tag }).lean();
      if (existingTag) {
        return withCommittedCount(existingTag);
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

      return newTag == null ? null : withCommittedCount(newTag);
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
  ): Promise<
    | (import('mongoose').FlattenMaps<{
        [x: string]: unknown;
        user: string;
        tag: string;
        description?: string | undefined;
        position: number;
        count: number;
        createdAt?: Date | undefined;
      }> & {
        _id: import('mongoose').Types.ObjectId;
      } & {
        __v: number;
      })
    | null
  > {
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

      const updatedTag = await ConversationTag.findOneAndUpdate({ user, tag: oldTag }, updateData, {
        new: true,
        lean: true,
      });
      return updatedTag == null ? null : withCommittedCount(updatedTag);
    } catch (error) {
      logger.error('[updateConversationTag] Error updating conversation tag', error);
      throw new Error('Error updating conversation tag');
    }
  }

  /**
   * Deletes a conversation tag.
   */
  async function deleteConversationTag(
    user: string,
    tag: string,
  ): Promise<
    | (import('mongoose').FlattenMaps<{
        [x: string]: unknown;
        user: string;
        tag: string;
        description?: string | undefined;
        position: number;
        count: number;
        createdAt?: Date | undefined;
      }> & {
        _id: import('mongoose').Types.ObjectId;
      } & {
        __v: number;
      })
    | null
  > {
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

      return withCommittedCount(deletedTag);
    } catch (error) {
      logger.error('[deleteConversationTag] Error deleting conversation tag', error);
      throw new Error('Error deleting conversation tag');
    }
  }

  /**
   * Updates tags for a specific conversation.
   */
  async function updateTagsForConversation(
    user: string,
    conversationId: string,
    tags: string[],
    tenantId?: string | null,
  ): Promise<string[]> {
    try {
      const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
      const Conversation = mongoose.models.Conversation;
      const tenantFilter = optionalTenantFilter<Record<string, unknown>>(tenantId);

      const conversation = await Conversation.findOne({
        user,
        conversationId,
        ...tenantFilter,
      }).lean();
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
            filter: { user, tag, ...tenantFilter },
            update: { $inc: { count: 1 } },
            upsert: true,
          },
        });
      }

      for (const tag of removedTags) {
        bulkOps.push({
          updateOne: {
            filter: { user, tag, ...tenantFilter },
            update: { $inc: { count: -1 } },
          },
        });
      }

      if (bulkOps.length > 0) {
        await tenantSafeBulkWrite(ConversationTag, bulkOps);
      }

      const updatedConversation = (
        await Conversation.findOneAndUpdate(
          { user, conversationId, ...tenantFilter },
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

  /** Maintains legacy cached deltas after a metadata commit. Public reads recover
   * missing catalog entries and derive counts independently of these writes. */
  async function reconcileConversationTagCounts(
    user: string,
    previousTags: string[],
    nextTags: string[],
    tenantId?: string | null,
  ): Promise<void> {
    const ConversationTag = mongoose.models.ConversationTag as Model<IConversationTag>;
    const tenantFilter = optionalTenantFilter<IConversationTag>(tenantId);
    const oldTags = new Set(previousTags);
    const newTags = new Set(nextTags);
    const bulkOps: Array<{
      updateOne: {
        filter: FilterQuery<IConversationTag>;
        update: Record<string, unknown>;
        upsert?: boolean;
      };
    }> = [];

    for (const tag of [...newTags].filter((value) => !oldTags.has(value))) {
      bulkOps.push({
        updateOne: {
          filter: { user, tag, ...tenantFilter },
          update: { $inc: { count: 1 } },
          upsert: true,
        },
      });
    }
    for (const tag of [...oldTags].filter((value) => !newTags.has(value))) {
      bulkOps.push({
        updateOne: {
          filter: { user, tag, ...tenantFilter },
          update: { $inc: { count: -1 } },
          /** Signed deltas must commute when successful metadata writes reconcile out
           * of order. Retaining a temporary negative row lets a later increment
           * cancel it instead of manufacturing a stale positive count. */
          upsert: true,
        },
      });
    }
    if (bulkOps.length > 0) {
      await tenantSafeBulkWrite(ConversationTag, bulkOps);
    }
  }

  /**
   * Increments tag counts for existing tags only.
   */
  async function bulkIncrementTagCounts(user: string, tags: string[]): Promise<void> {
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

      const result = await tenantSafeBulkWrite(ConversationTag, bulkOps);
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
    reconcileConversationTagCounts,
  };
}

export type ConversationTagMethods = ReturnType<typeof createConversationTagMethods>;
