import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import { checkpointOwnerNamespacePrefix } from '../../stream/checkpoints';
import { resolveCheckpointerConfig } from './config';

export interface ActorCheckpointScope {
  _id: string;
  owner: string;
  user: string;
  tenantId?: string;
  revision: string;
  threadId: string;
  checkpointNs: string;
}

export function actorCheckpointStorage(cfg?: TCheckpointerConfig) {
  const resolved = resolveCheckpointerConfig(cfg);
  const db = mongoose.connection.db;
  if (resolved.type === 'memory' || !db || mongoose.connection.readyState !== 1) {
    throw new Error('Actor checkpoint ownership requires Mongo storage');
  }
  return {
    db,
    resolved,
    scopes: db.collection<ActorCheckpointScope>(
      `${resolved.checkpointCollectionName}_actor_owners`,
    ),
  };
}

export function actorCheckpointScopeId(threadId: string, checkpointNs: string): string {
  return createHash('sha256')
    .update(JSON.stringify([threadId, checkpointNs]))
    .digest('hex');
}

export async function getActorCheckpointScope(
  threadId: string,
  checkpointNs: string,
  cfg?: TCheckpointerConfig,
): Promise<ActorCheckpointScope | null> {
  return actorCheckpointStorage(cfg).scopes.findOne({
    _id: actorCheckpointScopeId(threadId, checkpointNs),
  });
}

export async function getActorCheckpointScopes(
  threadIds: readonly string[],
  cfg?: TCheckpointerConfig,
): Promise<Map<string, ActorCheckpointScope>> {
  if (resolveCheckpointerConfig(cfg).type === 'memory') return new Map();
  const records = await actorCheckpointStorage(cfg)
    .scopes.find({ threadId: { $in: [...new Set(threadIds)] } })
    .toArray();
  return new Map(records.map((scope) => [scope._id, scope]));
}

/** Bind a fresh SDK scope before any checkpoint or pending-write upsert can occur. */
export async function registerActorCheckpointScope(
  user: string,
  tenantId: string | undefined,
  threadId: string,
  checkpointNs: string,
  cfg?: TCheckpointerConfig,
): Promise<void> {
  const { scopes, db, resolved } = actorCheckpointStorage(cfg);
  const owner = checkpointOwnerNamespacePrefix(user, tenantId);
  const _id = actorCheckpointScopeId(threadId, checkpointNs);
  const identity = { user, ...(tenantId == null ? {} : { tenantId }), revision: randomUUID() };
  const existing = await scopes.findOne({ _id });
  if (existing) {
    if (existing.owner !== owner) {
      throw new Error('Actor checkpoint namespace belongs to another owner');
    }
    const refreshed = await scopes.updateOne(existing, { $set: identity });
    if (refreshed.matchedCount !== 1) {
      throw new Error('Actor checkpoint registration changed concurrently');
    }
    return;
  }
  const escaped = checkpointNs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scope = { thread_id: threadId, checkpoint_ns: { $regex: `^${escaped}(?:[|]|$)` } };
  const payload = await Promise.all([
    db.collection(resolved.checkpointCollectionName).findOne(scope, { projection: { _id: 1 } }),
    db
      .collection(resolved.checkpointWritesCollectionName)
      .findOne(scope, { projection: { _id: 1 } }),
  ]);
  if (payload.some(Boolean)) {
    throw new Error('Cannot claim an existing unregistered actor checkpoint namespace');
  }
  await scopes.updateOne(
    { _id, owner },
    { $setOnInsert: { _id, owner, threadId, checkpointNs }, $set: identity },
    { upsert: true },
  );
}

export async function acknowledgeActorCheckpointScope(
  scope: ActorCheckpointScope,
  cfg?: TCheckpointerConfig,
): Promise<void> {
  await actorCheckpointStorage(cfg).scopes.deleteOne(scope);
}

/** Bounded durable ownership lookup; acknowledge only after both payload collections are clean. */
export async function deleteOwnedActorCheckpointScopes(
  user: string,
  tenantId: string | undefined,
  conversationIds: readonly string[] | undefined,
  remove: (scopes: ActorCheckpointScope[]) => Promise<void>,
  cfg?: TCheckpointerConfig,
): Promise<void> {
  const { scopes } = actorCheckpointStorage(cfg);
  const owner = checkpointOwnerNamespacePrefix(user, tenantId);
  const ids = conversationIds == null ? undefined : [...new Set(conversationIds)];
  for (let offset = 0; offset < (ids?.length ?? 1); offset += 256) {
    const filter = {
      owner,
      ...(ids && { threadId: { $in: ids.slice(offset, offset + 256) } }),
    };
    for (;;) {
      const batch = await scopes.find(filter).limit(128).toArray();
      if (batch.length === 0) {
        break;
      }
      await remove(batch);
      await scopes.deleteMany({ owner, _id: { $in: batch.map((scope) => scope._id) } });
    }
  }
}
