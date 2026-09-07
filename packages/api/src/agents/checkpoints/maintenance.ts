import mongoose from 'mongoose';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { ActorCheckpointScope } from './ownership';
import { checkpointOwnerNamespacePrefix } from '../../stream/checkpoints';
import { actorCheckpointStorage } from './ownership';
import { resolveCheckpointerConfig } from './config';

interface ActorCheckpointMaintenanceDeps {
  hasActiveGeneration: (user: string, threadId: string, tenantId?: string) => Promise<boolean>;
}

/** Reclaim payload-free orphans, without making ownership depend on a TTL index. */
export function createActorCheckpointMaintenance(deps: ActorCheckpointMaintenanceDeps) {
  const cursors = new Map<string, string>();
  return async (cfg?: TCheckpointerConfig): Promise<number> => {
    if (resolveCheckpointerConfig(cfg).type === 'memory') return 0;
    const { db, scopes, resolved } = actorCheckpointStorage(cfg);
    const key = resolved.checkpointCollectionName;
    const after = cursors.get(key);
    const batch = await scopes
      .find(after == null ? {} : { _id: { $gt: after } })
      .sort({ _id: 1 })
      .limit(25)
      .toArray();
    if (batch.length === 0) {
      cursors.delete(key);
      return 0;
    }
    const conversations = db.collection(
      mongoose.models.Conversation?.collection.name ?? 'conversations',
    );
    async function hasPersistence(scope: ActorCheckpointScope): Promise<boolean> {
      const escaped = scope.checkpointNs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const filter = {
        thread_id: scope.threadId,
        checkpoint_ns: { $regex: `^${escaped}(?:[|]|$)` },
      };
      const rows = await Promise.all([
        conversations.findOne(
          { user: scope.user, tenantId: scope.tenantId ?? null, conversationId: scope.threadId },
          { projection: { _id: 1 } },
        ),
        db
          .collection(resolved.checkpointCollectionName)
          .findOne(filter, { projection: { _id: 1 } }),
        db
          .collection(resolved.checkpointWritesCollectionName)
          .findOne(filter, { projection: { _id: 1 } }),
      ]);
      return rows.some(Boolean);
    }
    const results = await Promise.allSettled(
      batch.map(async (scope) => {
        if (
          !scope.user ||
          !scope.revision ||
          scope.owner !== checkpointOwnerNamespacePrefix(scope.user, scope.tenantId)
        ) {
          return 0;
        }
        if (await hasPersistence(scope)) return 0;
        if (await deps.hasActiveGeneration(scope.user, scope.threadId, scope.tenantId)) return 0;
        if (await hasPersistence(scope)) return 0;
        return (await scopes.deleteOne(scope)).deletedCount;
      }),
    );
    cursors.set(key, batch[batch.length - 1]._id);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    return results.reduce(
      (count, result) => count + (result.status === 'fulfilled' ? result.value : 0),
      0,
    );
  };
}
