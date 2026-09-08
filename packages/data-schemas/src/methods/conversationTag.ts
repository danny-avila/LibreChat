import type { Model } from 'mongoose';
import type { TagRecord } from '~/tags/membership';
import type { IConversation } from '~/types';
import {
  getOrCreateTag,
  ensureTagIndexes,
  cleanConversationTagMembership,
  ownedTagIds,
  resolveTagNames,
  tagScope,
} from '~/tags/membership';
import { getTenantId } from '~/config/tenantContext';

export class ConversationTagUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversationTagUpdateError';
  }
}

interface TagInput {
  tag: string;
  description?: string;
  addToConversation?: boolean;
  conversationId?: string;
}
interface TagUpdate {
  tag?: string;
  description?: string;
  position?: number;
}

/** Counts are read from membership; retained for existing deletion callers. */
export async function decrementTagCounts(
  _mongoose: typeof import('mongoose'),
  _user: string,
  _tags: string[],
  _tenantId?: string | null,
): Promise<void> {}

export function createConversationTagMethods(mongoose: typeof import('mongoose')): {
  getConversationTags: (user: string, tenantId?: string | null) => Promise<TagRecord[]>;
  createConversationTag: (
    user: string,
    data: TagInput,
    tenantId?: string | null,
  ) => Promise<TagRecord | null>;
  updateConversationTag: (
    user: string,
    name: string,
    data: TagUpdate,
    tenantId?: string | null,
    byId?: boolean,
  ) => Promise<TagRecord | null>;
  deleteConversationTag: (
    user: string,
    name: string,
    tenantId?: string | null,
    byId?: boolean,
  ) => Promise<TagRecord | null>;
  deleteConversationTags: (filter: Record<string, unknown>) => Promise<number>;
  updateTagsForConversation: (
    user: string,
    conversationId: string,
    names: string[],
    tenantId?: string | null,
    byId?: boolean,
  ) => Promise<string[]>;
  bulkIncrementTagCounts: (
    user: string,
    names: string[],
    tenantId?: string | null,
  ) => Promise<void>;
} {
  const Tag = () => mongoose.models.ConversationTag as Model<TagRecord>;
  const Conversation = () => mongoose.models.Conversation as Model<IConversation>;

  async function getConversationTags(
    user: string,
    tenantId: string | null = getTenantId() ?? null,
  ): Promise<TagRecord[]> {
    const scope = tagScope(user, tenantId);
    const [catalog, counts] = await Promise.all([
      Tag().find(scope).sort({ position: 1, _id: 1 }).lean(),
      Conversation().aggregate<{ _id: string; count: number }>([
        { $match: scope },
        { $project: { tagIds: { $setUnion: [{ $ifNull: ['$tagIds', []] }, []] } } },
        { $unwind: '$tagIds' },
        { $group: { _id: '$tagIds', count: { $sum: 1 } } },
      ]),
    ]);
    const byId = new Map(counts.map((row) => [row._id, row.count]));
    return catalog.map((tag) => ({ ...tag, count: byId.get(String(tag._id)) ?? 0 }));
  }

  async function withCount(
    tag: TagRecord | null,
    tenantId: string | null,
  ): Promise<TagRecord | null> {
    if (!tag) return null;
    return {
      ...tag,
      count: await Conversation().countDocuments({
        ...tagScope(tag.user, tenantId),
        tagIds: String(tag._id),
      }),
    };
  }

  async function createConversationTag(
    user: string,
    data: TagInput,
    tenantId: string | null = getTenantId() ?? null,
  ): Promise<TagRecord | null> {
    const tag = await getOrCreateTag(
      mongoose,
      user,
      { tag: data.tag, description: data.description },
      tenantId,
    );
    const id = String(tag._id);
    const scope = tagScope(user, tenantId);
    if (data.addToConversation && data.conversationId) {
      const conversation = await Conversation().findOneAndUpdate(
        { ...scope, conversationId: data.conversationId },
        { $addToSet: { tagIds: id } },
        { new: true, lean: true },
      );
      if (!conversation) throw new Error('Conversation not found');
      const [projected] = await cleanConversationTagMembership(mongoose, [conversation]);
      if (!projected.tagIds?.includes(id)) return null;
    }
    return withCount(tag, tenantId);
  }

  function identity(value: string, byId: boolean): { _id: string } | { tag: string } {
    if (!byId) return { tag: value };
    if (!/^[a-f\d]{24}$/i.test(value)) throw new Error('Invalid tag ID');
    return { _id: value };
  }

  async function updateConversationTag(
    user: string,
    value: string,
    data: TagUpdate,
    tenantId: string | null = getTenantId() ?? null,
    byId = false,
  ): Promise<TagRecord | null> {
    const scope = tagScope(user, tenantId);
    if (data.description !== undefined && typeof data.description !== 'string')
      throw new ConversationTagUpdateError('Invalid description');
    if (data.tag !== undefined && (typeof data.tag !== 'string' || !data.tag.length))
      throw new ConversationTagUpdateError('Invalid tag name');
    await ensureTagIndexes(mongoose);
    const existing = await Tag()
      .findOne({ ...scope, ...identity(value, byId) })
      .lean();
    if (!existing) return null;
    if (data.position !== undefined && data.tag !== undefined && data.tag !== existing.tag) {
      throw new ConversationTagUpdateError('Rename and position changes must be sent separately');
    }
    const update: TagUpdate = {};
    if (data.tag !== undefined) update.tag = data.tag;
    if (data.description !== undefined) update.description = data.description;
    if (data.position !== undefined) {
      if (!Number.isSafeInteger(data.position) || data.position < 0)
        throw new ConversationTagUpdateError('Invalid position');
      update.position = data.position;
    }
    const tag = await Tag().findOneAndUpdate(
      { ...scope, _id: existing._id },
      { $set: update },
      { new: true, lean: true },
    );
    if (!tag) return null;
    if (data.position !== undefined && data.position !== existing.position) {
      const movingDown = existing.position < data.position;
      await Tag().updateMany(
        {
          ...scope,
          _id: { $ne: tag._id },
          position: movingDown
            ? { $gt: existing.position, $lte: data.position }
            : { $gte: data.position, $lt: existing.position },
        },
        { $inc: { position: movingDown ? -1 : 1 } },
      );
    }
    return withCount(tag, tenantId);
  }

  async function deleteConversationTag(
    user: string,
    value: string,
    tenantId: string | null = getTenantId() ?? null,
    byId = false,
  ): Promise<TagRecord | null> {
    const scope = tagScope(user, tenantId);
    const deleted = await Tag()
      .findOneAndDelete({ ...scope, ...identity(value, byId) })
      .lean();
    if (!deleted) {
      if (byId)
        await Conversation().updateMany(
          { ...scope, tagIds: value },
          { $pullAll: { tagIds: [value] } },
          { timestamps: false },
        );
      return null;
    }
    await Conversation().updateMany(
      { ...scope, tagIds: String(deleted._id) },
      { $pullAll: { tagIds: [String(deleted._id)] } },
      { timestamps: false },
    );
    await Tag().updateMany(
      { ...scope, position: { $gt: deleted.position } },
      { $inc: { position: -1 } },
    );
    return deleted;
  }

  async function updateTagsForConversation(
    user: string,
    conversationId: string,
    values: string[],
    tenantId: string | null = getTenantId() ?? null,
    byId = false,
  ): Promise<string[]> {
    const scope = { ...tagScope(user, tenantId), conversationId };
    if (!(await Conversation().exists(scope))) throw new Error('Conversation not found');
    const tagIds = byId
      ? await ownedTagIds(mongoose, user, values, tenantId)
      : await resolveTagNames(mongoose, user, values, tenantId);
    const conversation = await Conversation().findOneAndUpdate(
      scope,
      { $set: { tagIds } },
      { new: true, lean: true },
    );
    if (!conversation) throw new Error('Conversation not found');
    const [projected] = await cleanConversationTagMembership(mongoose, [conversation]);
    return (byId ? projected.tagIds : projected.tags) ?? [];
  }

  async function deleteConversationTags(filter: Record<string, unknown>): Promise<number> {
    return (await Tag().deleteMany(filter)).deletedCount;
  }

  /** Import membership is persisted by bulkSaveConvos; no delta cache remains. */
  async function bulkIncrementTagCounts(
    _user: string,
    _names: string[],
    _tenantId?: string | null,
  ): Promise<void> {}

  return {
    getConversationTags,
    createConversationTag,
    updateConversationTag,
    deleteConversationTag,
    deleteConversationTags,
    updateTagsForConversation,
    bulkIncrementTagCounts,
  };
}
export type ConversationTagMethods = ReturnType<typeof createConversationTagMethods>;
