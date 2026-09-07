import mongoose from 'mongoose';
import { createHash, randomUUID } from 'crypto';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { AgentEventCheckpointReference } from '../checkpointer';
import { deleteOwnedAgentCheckpoints, deleteAgentEventCheckpointReference } from '../checkpointer';
import { checkpointOwnerNamespacePrefix } from '../../stream/checkpoints';
import { historicalActorReferences } from './pruning';
import { resolveCheckpointerConfig } from './config';

interface DeletionTarget {
  _id: string;
  version: string;
  threadId: string;
  checkpoint?: AgentEventCheckpointReference;
}

export interface CheckpointDeletion {
  conversationIds(): string[];
  remember(conversationIds: readonly string[]): Promise<void>;
  cleanup(): Promise<void>;
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

  async function persist(batch: DeletionTarget[]) {
    await collection.bulkWrite(
      batch.map((target) => ({
        updateOne: {
          filter: { _id: target._id },
          update: {
            $set: {
              version,
              threadId: target.threadId,
              ...(target.checkpoint && { checkpoint: target.checkpoint }),
            },
          },
          upsert: true,
        },
      })),
    );
    for (const target of batch) targets.set(target._id, target);
  }

  const conversationIds = () => [
    ...new Set([...targets.values()].map((target) => target.threadId)),
  ];
  return {
    conversationIds,
    async remember(ids: readonly string[]) {
      for (let offset = 0; offset < ids.length; offset += batchSize) {
        const threads = ids.slice(offset, offset + batchSize);
        let batch: DeletionTarget[] = threads.map((threadId) => ({
          _id: `${rootPrefix}${hash(threadId)}`,
          version,
          threadId,
        }));
        await persist(batch);
        batch = [];
        for await (const checkpoint of historicalActorReferences(userId, tenantId, threads)) {
          batch.push({
            _id: `${rootPrefix}${hash(checkpoint.threadId)}:${hash(JSON.stringify([checkpoint.checkpointNs, checkpoint.checkpointId]))}`,
            version,
            threadId: checkpoint.threadId,
            checkpoint,
          });
          if (batch.length === batchSize) {
            await persist(batch);
            batch = [];
          }
        }
        if (batch.length > 0) await persist(batch);
      }
    },
    async cleanup() {
      await deleteOwnedAgentCheckpoints(
        userId,
        tenantId,
        rootConversationId == null ? undefined : conversationIds(),
        cfg,
      );
      for (const target of targets.values()) {
        if (target.checkpoint != null) {
          await deleteAgentEventCheckpointReference(target.checkpoint, cfg, ownerPrefix);
        }
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
