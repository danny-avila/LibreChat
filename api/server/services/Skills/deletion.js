const { randomUUID } = require('node:crypto');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const { getStorageMetadata, runSkillDeletion } = require('@librechat/api');
const db = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

const SWEEP_INTERVAL_MS = 60_000;
const CLAIM_LEASE_MS = 120_000;

async function deleteStoredBlob(file, ownerId, tenantId) {
  const strategy = getStrategyFunctions(file.source);
  if (!strategy.deleteFile) {
    throw new Error(`Skill storage backend ${file.source} has no deletion strategy`);
  }
  const config = await getAppConfig({ baseOnly: true });
  await strategy.deleteFile(
    { config, user: { id: ownerId, _id: ownerId, tenantId } },
    {
      ...file,
      user: ownerId,
      tenantId,
    },
  );
}

async function deleteSkillById(skillId) {
  return runSkillDeletion(skillId, {
    beginSkillDeletion: db.beginSkillDeletion,
    getSkillDeletion: db.getSkillDeletion,
    listSkillFiles: db.listSkillFiles,
    listSkillUploadIntents: db.listSkillUploadIntents,
    deleteSkillFileAfterBlob: db.deleteSkillFileAfterBlob,
    finalizeSkillDeletion: db.finalizeSkillDeletion,
    completeSkillDeletion: db.completeSkillDeletion,
    reopenSkillDeletion: db.reopenSkillDeletion,
    markSkillUploadIntentCleaned: db.markSkillUploadIntentCleaned,
    deleteBlob: (file) => deleteStoredBlob(file, file.author.toString(), file.tenantId),
    deleteReservedBlob: (intent) =>
      deleteStoredBlob(
        {
          filepath: intent.storageKey,
          source: intent.source,
          ...getStorageMetadata({ filepath: intent.storageKey, source: intent.source }),
        },
        intent.author.toString(),
        intent.tenantId,
      ),
  });
}

/** Adapter for import/sync paths that still consume the legacy cascade result. */
async function deleteSkillForLegacy(skillId) {
  const progress = await deleteSkillById(skillId);
  return {
    deleted: progress.found && progress.cleanupComplete,
    skillAbsent: progress.found && progress.cleanupComplete,
    cleanupComplete: progress.found && progress.cleanupComplete,
    failedCleanupSteps: progress.failedSteps,
  };
}

/** Sweeps completed tombstones too: a delayed writer can surface after an earlier clean pass. */
function startSkillDeletionSweep() {
  const owner = randomUUID();
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      await runAsSystem(async () => {
        await db.discoverUnjournaledDeletions();
        const tombstones = await db.listSkillDeletionTombstones(100);
        for (const tombstone of tombstones) {
          const skillId = tombstone.skillId;
          if (!(await db.claimSkillDeletion(skillId, owner, CLAIM_LEASE_MS))) continue;
          const heartbeat = setInterval(() => {
            db.refreshSkillDeletionClaim(skillId, owner, CLAIM_LEASE_MS).catch((error) =>
              logger.error('[skill deletion] Claim heartbeat failed:', error),
            );
          }, CLAIM_LEASE_MS / 4);
          heartbeat.unref?.();
          try {
            const progress = await deleteSkillById(skillId.toString());
            if (!progress.cleanupComplete) {
              // An uploading/committing intent is deliberately not timed out.
              // Operator recovery for a dead writer: first stop/confirm the
              // writer is gone, inspect SkillFile by fileId, then CAS the
              // intent from committing -> committed if the row exists, or
              // uploading/committing -> abandoned if it does not. Never drop
              // the intent: abandoned keys are reswept indefinitely.
              logger.warn(
                `[skill deletion] ${skillId} pending manual/retry cleanup: ${progress.failedSteps.join(', ')}`,
              );
            }
            await db.noteSkillDeletionAttempt(skillId);
          } catch (error) {
            logger.error(`[skill deletion] Cleanup failed for ${skillId}:`, error);
          } finally {
            clearInterval(heartbeat);
            await db.releaseSkillDeletionClaim(skillId, owner);
          }
        }
      });
    } catch (error) {
      logger.error('[skill deletion] Sweep failed:', error);
    } finally {
      running = false;
    }
  }
  const interval = setInterval(tick, SWEEP_INTERVAL_MS);
  interval.unref?.();
  void tick();
  return { stop: () => clearInterval(interval), runOnce: tick };
}

module.exports = { deleteSkillById, deleteSkillForLegacy, startSkillDeletionSweep };
