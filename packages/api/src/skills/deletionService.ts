import { randomUUID } from 'node:crypto';
import type {
  AppConfig,
  DeleteSkillResult,
  SkillDeletionRecord,
  SkillUploadIntentRecord,
} from '@librechat/data-schemas';
import type { SkillDeletionDeps, SkillDeletionProgress } from './deletion';
import type { ServerRequest, StrategyFunctions } from '~/types';
import { runSkillDeletion, SkillDeletionClaimLostError } from './deletion';
import { getStorageMetadata } from '~/storage/metadata';

type Persistence = Omit<SkillDeletionDeps, 'deleteBlob' | 'deleteReservedBlob'> & {
  discoverUnjournaledDeletions: () => Promise<number>;
  listSkillDeletionTombstones: (limit: number) => Promise<SkillDeletionRecord[]>;
  claimSkillDeletion: (id: string, owner: string, leaseMs: number) => Promise<boolean>;
  refreshSkillDeletionClaim: (id: string, owner: string, leaseMs: number) => Promise<boolean>;
  noteSkillDeletionAttempt: (id: string) => Promise<void>;
  releaseSkillDeletionClaim: (id: string, owner: string) => Promise<void>;
  scheduleSkillDeletionRecheck: (id: string, owner: string, delayMs: number) => Promise<boolean>;
  listAbandonedSkillUploadIntents: (limit: number) => Promise<SkillUploadIntentRecord[]>;
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
  scheduleAbandonedSkillUploadIntentRecheck: (
    fileId: string,
    owner: string,
    delayMs: number,
  ) => Promise<boolean>;
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
    author: string;
    tenantId?: string;
  }) {
    const strategy = deps.getStrategyFunctions(file.source);
    if (!strategy.deleteFile) {
      throw new Error(`Skill storage backend ${file.source} has no deletion strategy`);
    }
    const ownerId = file.author;
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

  function pendingDeletion(found: boolean): SkillDeletionProgress {
    return {
      found,
      deleted: false,
      skillAbsent: !found,
      cleanupComplete: !found,
      failedSteps: [],
    };
  }

  function completedDeletion(): SkillDeletionProgress {
    return {
      found: true,
      deleted: true,
      skillAbsent: true,
      cleanupComplete: true,
      failedSteps: [],
    };
  }

  /** Each request or sweep item owns a distinct claim; same-owner reentry would bypass exclusion. */
  async function deleteWithClaim(
    skillId: string,
    claimLeaseMs: number,
  ): Promise<SkillDeletionProgress> {
    const journal =
      (await deps.persistence.beginSkillDeletion(skillId)) ??
      (await deps.persistence.getSkillDeletion(skillId));
    if (!journal) return pendingDeletion(false);
    const owner = randomUUID();
    if (!(await deps.persistence.claimSkillDeletion(skillId, owner, claimLeaseMs))) {
      // A completed tombstone may be deliberately deferred until its next cold audit.
      // Re-read it: another worker could have reopened it after the first lookup.
      if ((await deps.persistence.getSkillDeletion(skillId))?.completedAt) {
        return completedDeletion();
      }
      return pendingDeletion(true);
    }
    let lost = false;
    const assertClaim = async () => {
      if (lost) throw new SkillDeletionClaimLostError();
      try {
        const retained = await deps.persistence.refreshSkillDeletionClaim(
          skillId,
          owner,
          claimLeaseMs,
        );
        if (!retained) {
          lost = true;
          throw new SkillDeletionClaimLostError();
        }
      } catch (error) {
        lost = true;
        throw error;
      }
    };
    const heartbeat = setInterval(() => {
      void assertClaim().catch((error) =>
        deps.logger.error('[skill deletion] Claim heartbeat failed:', error),
      );
    }, claimLeaseMs / 4);
    heartbeat.unref?.();
    try {
      const config = await deps.loadConfig();
      const progress = await runSkillDeletion(
        skillId,
        {
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
        },
        config?.fileConfig?.skills?.deletionCleanupConcurrency,
        assertClaim,
      );
      if (progress.cleanupComplete) {
        await assertClaim();
        const scheduled = await deps.persistence.scheduleSkillDeletionRecheck(
          skillId,
          owner,
          config?.skillDeletion?.recheckIntervalMs ?? 3_600_000,
        );
        if (!scheduled) {
          lost = true;
          throw new SkillDeletionClaimLostError();
        }
      }
      return progress;
    } catch (error) {
      if (error instanceof SkillDeletionClaimLostError) return pendingDeletion(true);
      throw error;
    } finally {
      clearInterval(heartbeat);
      if (!lost) {
        try {
          await assertClaim();
          await deps.persistence.noteSkillDeletionAttempt(skillId);
        } catch (error) {
          deps.logger.error(`[skill deletion] Attempt timestamp failed for ${skillId}:`, error);
        }
      }
      try {
        await deps.persistence.releaseSkillDeletionClaim(skillId, owner);
      } catch (error) {
        deps.logger.error(`[skill deletion] Claim release failed for ${skillId}:`, error);
      }
    }
  }

  async function deleteSkillById(skillId: string) {
    return deleteWithClaim(skillId, 120_000);
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

  /** Completed tombstones remain eligible for cold audits: delayed writers may surface later. */
  function startSkillDeletionSweep(options: Partial<SkillDeletionSweepOptions> = {}) {
    const { sweepIntervalMs = 60_000, claimLeaseMs = 120_000, batchSize = 100 } = options;
    let running = false;
    async function sweepAbandonedIntents() {
      const intents = await deps.persistence.listAbandonedSkillUploadIntents(batchSize);
      for (const intent of intents) {
        const { fileId } = intent;
        const owner = randomUUID();
        if (
          !(await deps.persistence.claimAbandonedSkillUploadIntent(fileId, owner, claimLeaseMs))
        ) {
          continue;
        }
        let lost = false;
        const assertClaim = async () => {
          if (lost) throw new SkillDeletionClaimLostError();
          try {
            const retained = await deps.persistence.refreshAbandonedSkillUploadIntentClaim(
              fileId,
              owner,
              claimLeaseMs,
            );
            if (!retained) {
              lost = true;
              throw new SkillDeletionClaimLostError();
            }
          } catch (error) {
            lost = true;
            throw error;
          }
        };
        const heartbeat = setInterval(() => {
          void assertClaim().catch((error) =>
            deps.logger.error('[skill upload intent] Claim heartbeat failed:', error),
          );
        }, claimLeaseMs / 4);
        heartbeat.unref?.();
        try {
          const skillId = intent.skillId;
          await assertClaim();
          if (await deps.persistence.getSkillDeletion(skillId)) {
            // Whole-Skill deletion owns intents for this Skill.
            continue;
          }
          await assertClaim();
          if (await deps.persistence.skillFileExistsForIntent(skillId, fileId)) {
            deps.logger.warn(
              `[skill upload intent] ${fileId} still has a file row; retaining blob`,
            );
            continue;
          }
          await assertClaim();
          await deleteStoredBlob({
            filepath: intent.storageKey,
            source: intent.source,
            ...getStorageMetadata({ filepath: intent.storageKey, source: intent.source }),
            author: intent.author,
            tenantId: intent.tenantId,
          });
          await assertClaim();
          await deps.persistence.markSkillUploadIntentCleaned(fileId);
          await assertClaim();
          const config = await deps.loadConfig();
          if (
            !(await deps.persistence.scheduleAbandonedSkillUploadIntentRecheck(
              fileId,
              owner,
              config?.skillDeletion?.recheckIntervalMs ?? 3_600_000,
            ))
          ) {
            lost = true;
            throw new SkillDeletionClaimLostError();
          }
        } catch (error) {
          deps.logger.error(`[skill upload intent] Cleanup failed for ${fileId}:`, error);
        } finally {
          clearInterval(heartbeat);
          if (!lost) {
            try {
              await assertClaim();
              await deps.persistence.noteAbandonedSkillUploadIntentAttempt(fileId);
            } catch (error) {
              deps.logger.error(
                `[skill upload intent] Attempt timestamp failed for ${fileId}:`,
                error,
              );
            }
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
              const skillId = tombstone.skillId;
              try {
                const progress = await deleteWithClaim(skillId, claimLeaseMs);
                if (!progress.cleanupComplete) {
                  // A live upload is never timed out automatically. Operators must verify
                  // its writer is dead before explicitly abandoning the intent.
                  deps.logger.warn(
                    `[skill deletion] ${skillId} pending manual/retry cleanup: ${progress.failedSteps.join(', ')}`,
                  );
                }
              } catch (error) {
                deps.logger.error(`[skill deletion] Cleanup failed for ${skillId}:`, error);
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
