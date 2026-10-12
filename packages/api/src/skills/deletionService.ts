import { randomUUID } from 'node:crypto';
import type { AppConfig, DeleteSkillResult, ISkillDeletion } from '@librechat/data-schemas';
import type { SkillDeletionDeps, SkillDeletionProgress } from './deletion';
import type { ServerRequest, StrategyFunctions } from '~/types';
import { getStorageMetadata } from '~/storage/metadata';
import { runSkillDeletion } from './deletion';

type Persistence = Omit<SkillDeletionDeps, 'deleteBlob' | 'deleteReservedBlob'> & {
  discoverUnjournaledDeletions: () => Promise<number>;
  listSkillDeletionTombstones: (limit: number) => Promise<ISkillDeletion[]>;
  claimSkillDeletion: (id: string, owner: string, leaseMs: number) => Promise<boolean>;
  refreshSkillDeletionClaim: (id: string, owner: string, leaseMs: number) => Promise<boolean>;
  noteSkillDeletionAttempt: (id: string) => Promise<void>;
  releaseSkillDeletionClaim: (id: string, owner: string) => Promise<void>;
  listAbandonedSkillUploadIntents: (limit: number) => Promise<
    Array<{
      skillId: { toString(): string };
      fileId: string;
      source: string;
      storageKey: string;
      author: { toString(): string };
      tenantId?: string;
    }>
  >;
  claimAbandonedSkillUploadIntent: (
    fileId: string,
    owner: string,
    leaseMs: number,
  ) => Promise<boolean>;
  refreshAbandonedSkillUploadIntentClaim: (
    fileId: string,
    owner: string,
    leaseMs: number,
  ) => Promise<boolean>;
  noteAbandonedSkillUploadIntentAttempt: (fileId: string) => Promise<void>;
  releaseAbandonedSkillUploadIntentClaim: (fileId: string, owner: string) => Promise<void>;
  skillFileExistsForIntent: (skillId: string, fileId: string) => Promise<boolean>;
};

interface SkillDeletionServiceDeps {
  persistence: Persistence;
  loadConfig: () => Promise<AppConfig | undefined>;
  getStrategyFunctions: (source: string) => Partial<StrategyFunctions>;
  runAsSystem: <T>(callback: () => Promise<T>) => Promise<T>;
  logger: Pick<Console, 'error' | 'warn'>;
}

export interface SkillDeletionSweepOptions {
  sweepIntervalMs: number;
  claimLeaseMs: number;
  batchSize: number;
}

export interface SkillDeletionService {
  deleteSkillById: (skillId: string) => Promise<SkillDeletionProgress>;
  deleteSkillForLegacy: (
    skillId: string,
  ) => Promise<DeleteSkillResult & { blobCleanupManaged: boolean }>;
  startSkillDeletionSweep: (options?: Partial<SkillDeletionSweepOptions>) => {
    stop: () => void;
    runOnce: () => Promise<void>;
  };
}

/** The legacy server supplies storage, database, and context dependencies; it owns no worker logic. */
export function createSkillDeletionService(deps: SkillDeletionServiceDeps): SkillDeletionService {
  async function deleteStoredBlob(file: {
    filepath: string;
    source: string;
    storageKey?: string | null;
    storageRegion?: string | null;
    author: { toString(): string };
    tenantId?: string;
  }) {
    const strategy = deps.getStrategyFunctions(file.source);
    if (!strategy.deleteFile) {
      throw new Error(`Skill storage backend ${file.source} has no deletion strategy`);
    }
    const ownerId = file.author.toString();
    const config = await deps.loadConfig();
    await strategy.deleteFile(
      {
        config,
        user: { id: ownerId, _id: ownerId, tenantId: file.tenantId },
      } as unknown as ServerRequest,
      {
        filepath: file.filepath,
        storageKey: file.storageKey,
        storageRegion: file.storageRegion,
        user: ownerId,
        tenantId: file.tenantId,
      },
    );
  }

  async function deleteSkillById(skillId: string) {
    return runSkillDeletion(skillId, {
      ...deps.persistence,
      deleteBlob: deleteStoredBlob,
      deleteReservedBlob: (intent) =>
        deleteStoredBlob({
          filepath: intent.storageKey,
          source: intent.source,
          ...getStorageMetadata({ filepath: intent.storageKey, source: intent.source }),
          author: intent.author,
          tenantId: intent.tenantId,
        }),
    });
  }

  async function deleteSkillForLegacy(skillId: string) {
    const progress = await deleteSkillById(skillId);
    return {
      deleted: progress.deleted,
      skillAbsent: progress.skillAbsent,
      cleanupComplete: progress.cleanupComplete,
      failedCleanupSteps: progress.failedSteps,
      blobCleanupManaged: true,
    };
  }

  /** Completed tombstones remain eligible: a delayed writer may still surface after a clean pass. */
  function startSkillDeletionSweep(options: Partial<SkillDeletionSweepOptions> = {}) {
    const { sweepIntervalMs = 60_000, claimLeaseMs = 120_000, batchSize = 100 } = options;
    const owner = randomUUID();
    let running = false;
    async function sweepAbandonedIntents() {
      const intents = await deps.persistence.listAbandonedSkillUploadIntents(batchSize);
      for (const intent of intents) {
        const { fileId } = intent;
        if (
          !(await deps.persistence.claimAbandonedSkillUploadIntent(fileId, owner, claimLeaseMs))
        ) {
          continue;
        }
        const heartbeat = setInterval(() => {
          deps.persistence
            .refreshAbandonedSkillUploadIntentClaim(fileId, owner, claimLeaseMs)
            .catch((error) =>
              deps.logger.error('[skill upload intent] Claim heartbeat failed:', error),
            );
        }, claimLeaseMs / 4);
        heartbeat.unref?.();
        try {
          const skillId = intent.skillId.toString();
          if (await deps.persistence.getSkillDeletion(skillId)) {
            // Whole-Skill deletion owns intents for this Skill.
            continue;
          }
          if (await deps.persistence.skillFileExistsForIntent(skillId, fileId)) {
            deps.logger.warn(
              `[skill upload intent] ${fileId} still has a file row; retaining blob`,
            );
            continue;
          }
          await deleteStoredBlob({
            filepath: intent.storageKey,
            source: intent.source,
            ...getStorageMetadata({ filepath: intent.storageKey, source: intent.source }),
            author: intent.author,
            tenantId: intent.tenantId,
          });
          await deps.persistence.markSkillUploadIntentCleaned(fileId);
        } catch (error) {
          deps.logger.error(`[skill upload intent] Cleanup failed for ${fileId}:`, error);
        } finally {
          clearInterval(heartbeat);
          try {
            await deps.persistence.noteAbandonedSkillUploadIntentAttempt(fileId);
          } catch (error) {
            deps.logger.error(
              `[skill upload intent] Attempt timestamp failed for ${fileId}:`,
              error,
            );
          }
          try {
            await deps.persistence.releaseAbandonedSkillUploadIntentClaim(fileId, owner);
          } catch (error) {
            deps.logger.error(`[skill upload intent] Claim release failed for ${fileId}:`, error);
          }
        }
      }
    }
    async function tick() {
      if (running) return;
      running = true;
      try {
        await deps.runAsSystem(async () => {
          try {
            await deps.persistence.discoverUnjournaledDeletions();
            const tombstones = await deps.persistence.listSkillDeletionTombstones(batchSize);
            for (const tombstone of tombstones) {
              const skillId = tombstone.skillId.toString();
              if (!(await deps.persistence.claimSkillDeletion(skillId, owner, claimLeaseMs))) {
                continue;
              }
              const heartbeat = setInterval(() => {
                deps.persistence
                  .refreshSkillDeletionClaim(skillId, owner, claimLeaseMs)
                  .catch((error) =>
                    deps.logger.error('[skill deletion] Claim heartbeat failed:', error),
                  );
              }, claimLeaseMs / 4);
              heartbeat.unref?.();
              try {
                const progress = await deleteSkillById(skillId);
                if (!progress.cleanupComplete) {
                  // A live upload is never timed out automatically. Operators must verify
                  // its writer is dead before explicitly abandoning the intent.
                  deps.logger.warn(
                    `[skill deletion] ${skillId} pending manual/retry cleanup: ${progress.failedSteps.join(', ')}`,
                  );
                }
              } catch (error) {
                deps.logger.error(`[skill deletion] Cleanup failed for ${skillId}:`, error);
              } finally {
                clearInterval(heartbeat);
                try {
                  // Rotate failed records too, so poison rows cannot starve the bounded queue.
                  await deps.persistence.noteSkillDeletionAttempt(skillId);
                } catch (error) {
                  deps.logger.error(
                    `[skill deletion] Attempt timestamp failed for ${skillId}:`,
                    error,
                  );
                }
                try {
                  await deps.persistence.releaseSkillDeletionClaim(skillId, owner);
                } catch (error) {
                  deps.logger.error(`[skill deletion] Claim release failed for ${skillId}:`, error);
                }
              }
            }
          } finally {
            // Active Skills can own abandoned upload intents with no deletion tombstone.
            await sweepAbandonedIntents();
          }
        });
      } catch (error) {
        deps.logger.error('[skill deletion] Sweep failed:', error);
      } finally {
        running = false;
      }
    }
    const interval = setInterval(tick, sweepIntervalMs);
    interval.unref?.();
    void tick();
    return { stop: () => clearInterval(interval), runOnce: tick };
  }

  return { deleteSkillById, deleteSkillForLegacy, startSkillDeletionSweep };
}
