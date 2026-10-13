import { DEFAULT_SKILL_DELETION_CLEANUP_CONCURRENCY } from 'librechat-data-provider';
import type {
  DeleteSkillCleanupStep,
  DeleteSkillResult,
  SkillDeletionFileRecord,
  SkillDeletionRecord,
  SkillUploadIntentRecord,
} from '@librechat/data-schemas';
import { createConcurrencyLimiter } from '~/utils/promise';

export interface SkillDeletionDeps {
  beginSkillDeletion: (id: string) => Promise<SkillDeletionRecord | null>;
  getSkillDeletion: (id: string) => Promise<SkillDeletionRecord | null>;
  listSkillFiles: (id: string) => Promise<SkillDeletionFileRecord[]>;
  listSkillUploadIntents: (id: string) => Promise<SkillUploadIntentRecord[]>;
  deleteBlob: (file: SkillDeletionFileRecord) => Promise<void>;
  deleteReservedBlob: (intent: SkillUploadIntentRecord) => Promise<void>;
  deleteSkillFileAfterBlob: (skillId: string, fileId: string) => Promise<boolean>;
  finalizeSkillDeletion: (id: string) => Promise<DeleteSkillResult>;
  completeSkillDeletion: (id: string) => Promise<void>;
  reopenSkillDeletion: (id: string) => Promise<void>;
  markSkillUploadIntentCleaned: (fileId: string) => Promise<void>;
}

export type SkillDeletionProgress = {
  found: boolean;
  deleted: boolean;
  skillAbsent: boolean;
  cleanupComplete: boolean;
  failedSteps: DeleteSkillCleanupStep[];
};

export class SkillDeletionClaimLostError extends Error {
  constructor() {
    super('Skill deletion claim was lost');
    this.name = 'SkillDeletionClaimLostError';
  }
}

/**
 * Every externally stored object has a persistent Mongo reference until its
 * provider and RAG cleanup succeeds. Failures remain retryable after restart.
 */
export async function runSkillDeletion(
  id: string,
  deps: SkillDeletionDeps,
  fileCleanupConcurrency: number = DEFAULT_SKILL_DELETION_CLEANUP_CONCURRENCY,
  assertClaim: () => Promise<void> = async () => undefined,
  loadedJournal?: SkillDeletionRecord,
): Promise<SkillDeletionProgress> {
  await assertClaim();
  const journal =
    loadedJournal ?? (await deps.beginSkillDeletion(id)) ?? (await deps.getSkillDeletion(id));
  if (!journal) {
    return {
      found: false,
      deleted: false,
      skillAbsent: true,
      cleanupComplete: true,
      failedSteps: [],
    };
  }
  const failedSteps: DeleteSkillCleanupStep[] = [];
  const [intents, files] = await Promise.all([
    deps.listSkillUploadIntents(journal.skillId),
    deps.listSkillFiles(id),
  ]);
  const requiresFullCleanup =
    files.length > 0 ||
    intents.some(
      (intent) =>
        intent.state === 'uploading' ||
        intent.state === 'committing' ||
        (intent.state === 'committed' && !intent.cleanedAt),
    );
  if (journal.completedAt && requiresFullCleanup) {
    await assertClaim();
    await deps.reopenSkillDeletion(journal.skillId);
  }
  // A writer may still finish uploading or committing after this scan. An
  // operator can inspect and recover an intent with `recover-skill-upload`
  // after draining writers; a timer must not infer that a slow upload is dead.
  if (intents.some((intent) => intent.state === 'uploading' || intent.state === 'committing')) {
    return {
      found: true,
      deleted: false,
      skillAbsent: journal.completedAt != null,
      cleanupComplete: false,
      failedSteps: ['upload_intents'],
    };
  }
  const currentFileIds = new Set(files.map((file) => file.file_id));
  const cleanedFileIds = new Set<string>();
  const limit = createConcurrencyLimiter(fileCleanupConcurrency);
  const fileResults = await Promise.allSettled(
    files.map((file) =>
      limit(async () => {
        await assertClaim();
        try {
          await deps.deleteBlob(file);
        } catch {
          failedSteps.push('skill_files');
          return;
        }
        await assertClaim();
        try {
          await deps.deleteSkillFileAfterBlob(id, file.file_id);
          cleanedFileIds.add(file.file_id);
        } catch {
          failedSteps.push('skill_files');
        }
      }),
    ),
  );
  const rejectedFile = fileResults.find((result) => result.status === 'rejected');
  if (rejectedFile?.status === 'rejected') throw rejectedFile.reason;

  const intentResults = await Promise.allSettled(
    intents.map((intent) =>
      limit(async () => {
        if (intent.state === 'committed') {
          if (intent.cleanedAt) return;
          if (currentFileIds.has(intent.fileId) && !cleanedFileIds.has(intent.fileId)) {
            // Keep the intent with its current row for the next retry.
            return;
          }
          await assertClaim();
          try {
            if (!cleanedFileIds.has(intent.fileId)) {
              await deps.deleteReservedBlob(intent);
            }
          } catch {
            failedSteps.push('upload_intents');
            return;
          }
          await assertClaim();
          try {
            await deps.markSkillUploadIntentCleaned(intent.fileId);
          } catch {
            failedSteps.push('upload_intents');
          }
          return;
        }
        await assertClaim();
        try {
          await deps.deleteReservedBlob(intent);
          // Keep abandoned intents as tombstones: a zombie upload can finish
          // after this cleanup and must be discovered on the next sweep.
        } catch {
          failedSteps.push('upload_intents');
        }
      }),
    ),
  );
  const rejectedIntent = intentResults.find((result) => result.status === 'rejected');
  if (rejectedIntent?.status === 'rejected') throw rejectedIntent.reason;

  if (failedSteps.length > 0) {
    return {
      found: true,
      deleted: false,
      skillAbsent: journal.completedAt != null,
      cleanupComplete: false,
      failedSteps,
    };
  }
  if (journal.completedAt && !requiresFullCleanup) {
    return {
      found: true,
      deleted: true,
      skillAbsent: true,
      cleanupComplete: true,
      failedSteps: [],
    };
  }
  await assertClaim();
  const finalized = await deps.finalizeSkillDeletion(id);
  if (!finalized.cleanupComplete) {
    return {
      found: true,
      deleted: finalized.deleted,
      skillAbsent: finalized.skillAbsent,
      cleanupComplete: false,
      failedSteps: finalized.failedCleanupSteps,
    };
  }
  await assertClaim();
  await deps.completeSkillDeletion(journal.skillId);
  return {
    found: true,
    deleted: finalized.deleted,
    skillAbsent: finalized.skillAbsent,
    cleanupComplete: true,
    failedSteps: [],
  };
}
