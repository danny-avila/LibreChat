import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { buildIndexWithRetry } from '~/utils/retry';

interface LegacyConversation {
  _id: Types.ObjectId;
  user: string;
  tenantId?: string;
  tags?: string[];
  tagIds?: string[];
}
interface CatalogRow {
  _id: Types.ObjectId;
  user: string;
  tenantId?: string;
  tag: string;
  renameTo?: string;
}
export interface ConversationTagMigrationResult {
  scanned: number;
  updated: number;
  createdTags: number;
}

function scopeKey(row: { user: string; tenantId?: string }, name: string): string {
  if (
    typeof row.user !== 'string' ||
    !row.user ||
    (row.tenantId !== undefined && typeof row.tenantId !== 'string')
  ) {
    throw new Error(
      'Tag migration found an invalid owner or tenant; no automatic conversion is safe',
    );
  }
  return JSON.stringify([row.user, row.tenantId ?? null, name]);
}
function names(row: LegacyConversation): string[] {
  if (row.tags === undefined) return [];
  if (
    !Array.isArray(row.tags) ||
    row.tags.some((name) => typeof name !== 'string' || !name.length)
  ) {
    throw new Error('Tag migration found malformed conversation tags');
  }
  return [...new Set(row.tags)];
}

/** Offline cutover only: all application writers must remain stopped throughout both passes. */
export async function migrateConversationTags(
  connection: Connection,
  { dryRun = true }: { dryRun?: boolean } = {},
): Promise<ConversationTagMigrationResult> {
  const conversations = connection.db!.collection<LegacyConversation>('conversations');
  const catalog = connection.db!.collection<CatalogRow>('conversationtags');
  const options = {
    projection: { _id: 1, user: 1, tenantId: 1, tags: 1, tagIds: 1 },
    readPreference: 'primary' as const,
  };
  const byName = new Map<string, string>();
  const byId = new Map<string, CatalogRow>();
  for await (const tag of catalog.find({})) {
    if (
      !(tag._id instanceof Types.ObjectId) ||
      typeof tag.tag !== 'string' ||
      !tag.tag ||
      tag.renameTo !== undefined
    ) {
      throw new Error('Tag migration requires valid catalog names and completed legacy renames');
    }
    const key = scopeKey(tag, tag.tag);
    if (byName.has(key))
      throw new Error('Tag migration found duplicate catalog names in one scope');
    byName.set(key, String(tag._id));
    byId.set(String(tag._id), tag);
  }
  const missing = new Map<string, CatalogRow>();
  const result = { scanned: 0, updated: 0, createdTags: 0 };
  for await (const conversation of conversations.find({}, options)) {
    result.scanned++;
    scopeKey(conversation, '');
    if (conversation.tagIds !== undefined) {
      if (
        !Array.isArray(conversation.tagIds) ||
        conversation.tagIds.some((id) => {
          const tag = byId.get(id);
          return !tag || tag.user !== conversation.user || tag.tenantId !== conversation.tenantId;
        })
      )
        throw new Error('Tag migration found dangling or foreign existing tag IDs');
      continue;
    }
    result.updated++;
    for (const name of names(conversation)) {
      const key = scopeKey(conversation, name);
      if (byName.has(key) || missing.has(key)) continue;
      missing.set(key, {
        _id: new Types.ObjectId(),
        user: conversation.user,
        ...(conversation.tenantId === undefined ? {} : { tenantId: conversation.tenantId }),
        tag: name,
      });
    }
  }
  result.createdTags = missing.size;
  if (dryRun) return result;
  for (const [key, tag] of missing) {
    await catalog.updateOne(
      { user: tag.user, tenantId: tag.tenantId ?? { $exists: false }, tag: tag.tag },
      {
        $setOnInsert: {
          ...tag,
          count: 0,
          position: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    byName.set(key, String(tag._id));
  }
  let batch: Array<{
    updateOne: {
      filter: { _id: Types.ObjectId; tagIds: { $exists: false } };
      update: { $set: { tagIds: string[] } };
    };
  }> = [];
  for await (const conversation of conversations.find({ tagIds: { $exists: false } }, options)) {
    const tagIds = names(conversation).map((name) => {
      const id = byName.get(scopeKey(conversation, name));
      if (!id)
        throw new Error('Catalog changed during tag migration; keep writers stopped and retry');
      return id;
    });
    batch.push({
      updateOne: {
        filter: { _id: conversation._id, tagIds: { $exists: false } },
        update: { $set: { tagIds } },
      },
    });
    if (batch.length === 500) {
      // eslint-disable-next-line no-restricted-syntax -- quiesced offline migration preserves timestamps and spans tenants
      await conversations.bulkWrite(batch, { ordered: true });
      batch = [];
    }
  }
  if (batch.length) {
    // eslint-disable-next-line no-restricted-syntax -- quiesced offline migration preserves timestamps and spans tenants
    await conversations.bulkWrite(batch, { ordered: true });
  }
  await buildIndexWithRetry(
    () => conversations.createIndex({ user: 1, tenantId: 1, tagIds: 1 }),
    'createIndex(conversation tag membership)',
  );
  await buildIndexWithRetry(
    () => catalog.createIndex({ tag: 1, user: 1, tenantId: 1 }, { unique: true }),
    'createIndex(conversation tag catalog)',
  );
  return result;
}

export async function assertConversationTagMigration(connection: Connection): Promise<void> {
  const row = await connection
    .db!.collection('conversations')
    .findOne(
      { tagIds: { $exists: false }, 'tags.0': { $exists: true } },
      { projection: { _id: 1 } },
    );
  if (row)
    throw new Error(
      'Conversation tag migration required. Stop all writers and run npm run migrate:conversation-tags before starting this version.',
    );
}
