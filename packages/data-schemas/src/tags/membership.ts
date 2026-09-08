import type { FilterQuery, Model, Types } from 'mongoose';
import type { IConversation } from '~/types';
import { createIndexesWithRetry } from '~/utils/retry';
import { getTenantId } from '~/config/tenantContext';

export interface TagRecord {
  _id: Types.ObjectId;
  user: string;
  tenantId?: string;
  tag: string;
  description?: string;
  position: number;
  count: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export function tagScope(
  user: string,
  tenantId: string | null = getTenantId() ?? null,
): {
  user: string;
  tenantId: string | { $exists: false };
} {
  return { user, tenantId: tenantId ?? { $exists: false } };
}

const indexBuilds = new WeakMap<object, Promise<void>>();
export function ensureTagIndexes(mongoose: typeof import('mongoose')): Promise<void> {
  const model = mongoose.models.ConversationTag;
  let pending = indexBuilds.get(model);
  if (!pending) {
    pending = createIndexesWithRetry(model).catch((error) => {
      indexBuilds.delete(model);
      throw error;
    });
    indexBuilds.set(model, pending);
  }
  return pending;
}

/** Name commands bind to the current catalog identity once, before membership is written. */
export async function resolveTagNames(
  mongoose: typeof import('mongoose'),
  user: string,
  names: string[],
  tenantId: string | null = getTenantId() ?? null,
  create = true,
): Promise<string[]> {
  if (!names.length) return [];
  if (names.some((name) => typeof name !== 'string' || !name.length)) {
    throw new Error('Invalid tag name');
  }
  const uniqueNames = [...new Set(names)];
  const Tag = mongoose.models.ConversationTag as Model<TagRecord>;
  const scope = tagScope(user, tenantId);
  if (create) await ensureTagIndexes(mongoose);
  const existing = await Tag.find({ ...scope, tag: { $in: uniqueNames } }).lean();
  const byName = new Map(existing.map((tag) => [tag.tag, String(tag._id)]));
  if (create) {
    for (const tag of uniqueNames) {
      if (byName.has(tag)) continue;
      const row = await getOrCreateTag(mongoose, user, { tag }, tenantId);
      byName.set(tag, String(row._id));
    }
  }
  return uniqueNames.flatMap((name) => {
    const id = byName.get(name);
    return id == null ? [] : [id];
  });
}

/** Creation is idempotent and never changes an existing label's metadata. */
export async function getOrCreateTag(
  mongoose: typeof import('mongoose'),
  user: string,
  data: { tag: string; description?: string },
  tenantId: string | null = getTenantId() ?? null,
): Promise<TagRecord> {
  if (typeof data.tag !== 'string' || !data.tag.length) throw new Error('Invalid tag name');
  if (data.description !== undefined && typeof data.description !== 'string')
    throw new Error('Invalid description');
  await ensureTagIndexes(mongoose);
  const Tag = mongoose.models.ConversationTag as Model<TagRecord>;
  const scope = tagScope(user, tenantId);
  const existing = await Tag.findOne({ ...scope, tag: data.tag }).lean();
  if (existing) return existing;
  const last = await Tag.findOne(scope).sort({ position: -1 }).select('position').lean();
  try {
    const row = await Tag.findOneAndUpdate(
      { ...scope, tag: data.tag },
      {
        $setOnInsert: {
          ...data,
          user,
          position: (last?.position ?? -1) + 1,
          ...(tenantId === null ? {} : { tenantId }),
        },
      },
      { upsert: true, new: true, lean: true },
    );
    if (!row) throw new Error('Tag creation did not return a document');
    return row;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 11000) throw error;
    const row = await Tag.findOne({ ...scope, tag: data.tag }).lean();
    if (!row) throw error;
    return row;
  }
}

export async function ownedTagIds(
  mongoose: typeof import('mongoose'),
  user: string,
  ids: string[],
  tenantId: string | null = getTenantId() ?? null,
  requireAll = true,
): Promise<string[]> {
  if (ids.some((id) => !/^[a-f\d]{24}$/i.test(id))) throw new Error('Invalid tag ID');
  const uniqueIds = [...new Set(ids.map((id) => id.toLowerCase()))];
  if (!uniqueIds.length) return [];
  const Tag = mongoose.models.ConversationTag as Model<TagRecord>;
  const rows = await Tag.find({ ...tagScope(user, tenantId), _id: { $in: uniqueIds } })
    .select('_id')
    .lean();
  if (requireAll && rows.length !== uniqueIds.length) throw new Error('Tag not found');
  const found = new Set(rows.map((row) => String(row._id)));
  return uniqueIds.filter((id) => found.has(id));
}

/** Batch projection deliberately omits dangling and foreign identities. */
export async function hydrateConversationTags<
  T extends Pick<IConversation, 'user' | 'tenantId' | 'tags'> & { tagIds?: string[] },
>(mongoose: typeof import('mongoose'), conversations: T[]): Promise<T[]> {
  const scopes = new Map<string, FilterQuery<TagRecord>>();
  for (const conversation of conversations) {
    if (!conversation.user || !conversation.tagIds?.length) continue;
    const key = JSON.stringify([conversation.user, conversation.tenantId ?? null]);
    scopes.set(key, tagScope(conversation.user, conversation.tenantId ?? null));
  }
  if (!scopes.size)
    return conversations.map((conversation) => ({ ...conversation, tags: [], tagIds: [] }));
  const ids = [...new Set(conversations.flatMap((conversation) => conversation.tagIds ?? []))];
  const Tag = mongoose.models.ConversationTag as Model<TagRecord>;
  const rows = await Tag.find({ $or: [...scopes.values()], _id: { $in: ids } }).lean();
  const byId = new Map(rows.map((row) => [String(row._id), row]));
  return conversations.map((conversation) => {
    const tags: string[] = [];
    const tagIds: string[] = [];
    for (const id of new Set(conversation.tagIds ?? [])) {
      const tag = byId.get(id);
      if (!tag || tag.user !== conversation.user || tag.tenantId !== conversation.tenantId)
        continue;
      tags.push(tag.tag);
      tagIds.push(id);
    }
    return { ...conversation, tags, tagIds };
  });
}

export async function searchTagIds(
  mongoose: typeof import('mongoose'),
  user: string,
  search: string,
  tenantId: string | null = getTenantId() ?? null,
): Promise<string[]> {
  const Tag = mongoose.models.ConversationTag as Model<TagRecord> &
    Pick<import('~/models/plugins/mongoMeili').SchemaWithMeiliMethods, 'meiliSearch'>;
  const results = await Tag.meiliSearch(search, {
    filter: `user = ${JSON.stringify(user)}`,
    limit: 1000,
    attributesToRetrieve: ['_id'],
  });
  const ids = results.hits.flatMap((hit) =>
    typeof hit._id === 'string' && /^[a-f\d]{24}$/i.test(hit._id) ? [hit._id] : [],
  );
  if (!ids.length) return [];
  const tags = await Tag.find({ ...tagScope(user, tenantId), _id: { $in: ids } })
    .select('_id')
    .lean();
  return tags.map((tag) => String(tag._id));
}
