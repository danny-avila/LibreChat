import mongoose from 'mongoose';
import { createHash, randomUUID } from 'crypto';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import { checkpointOwnerNamespacePrefix } from '../../stream/checkpoints';
import { resolveCheckpointerConfig } from '../checkpointer';

interface DeletionTarget {
  _id: string;
  version: string;
  threadId: string;
}

export interface CheckpointDeletion {
  conversationIds(): string[];
  remember(conversationIds: readonly string[]): Promise<void>;
  acknowledge(): Promise<void>;
}

const hash = (value: string | null) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Durable deletion intent preserves cascade identity after topology is removed.
 * These records contain no checkpoint payload and exist only during deletion,
 * not once per generation. They must survive until both drain and cleanup succeed. */
export async function openCheckpointDeletion(
  userId: string,
  tenantId: string | undefined,
  rootConversationId: string | undefined,
  cfg?: TCheckpointerConfig,
): Promise<CheckpointDeletion> {
  if (!userId) {
    throw new Error('Checkpoint deletion requires an owner');
  }
  const db = mongoose.connection.db;
  if (!db || mongoose.connection.readyState !== 1) {
    throw new Error('Checkpoint database is unavailable');
  }
  const resolved = resolveCheckpointerConfig(cfg);
  const collection = db.collection<DeletionTarget>(
    `${resolved.checkpointCollectionName}_deletions`,
  );
  const ownerPrefix = checkpointOwnerNamespacePrefix(userId, tenantId);
  const rootPrefix = `${ownerPrefix}${hash(rootConversationId ?? null)}:`;
  const prefix = rootConversationId == null ? ownerPrefix : rootPrefix;
  const retained = await collection.find({ _id: { $regex: `^${prefix}` } }).toArray();
  const targets = new Map(retained.map((target) => [target._id, target]));
  const version = randomUUID();
  const batchSize = 256;

  return {
    conversationIds: () => [...new Set([...targets.values()].map((target) => target.threadId))],
    async remember(conversationIds: readonly string[]) {
      for (let offset = 0; offset < conversationIds.length; offset += batchSize) {
        const batch = conversationIds.slice(offset, offset + batchSize).map((threadId) => ({
          _id: `${rootPrefix}${hash(threadId)}`,
          version,
          threadId,
        }));
        await collection.bulkWrite(
          batch.map((target) => ({
            updateOne: {
              filter: { _id: target._id },
              update: { $set: { version, threadId: target.threadId } },
              upsert: true,
            },
          })),
        );
        for (const target of batch) targets.set(target._id, target);
      }
    },
    async acknowledge() {
      const receipts = [...targets.values()];
      for (let offset = 0; offset < receipts.length; offset += batchSize) {
        await collection.deleteMany({
          $or: receipts.slice(offset, offset + batchSize).map(({ _id, version: captured }) => ({
            _id,
            version: captured,
          })),
        });
      }
    },
  };
}
