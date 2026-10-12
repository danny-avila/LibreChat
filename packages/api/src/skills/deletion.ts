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

/**
 * Every externally stored object has a persistent Mongo reference until its
 * provider and RAG cleanup succeeds. Failures remain retryable after restart.
 */
export async function runSkillDeletion(
  id: string,
  deps: SkillDeletionDeps,
  fileCleanupConcurrency: number = DEFAULT_SKILL_DELETION_CLEANUP_CONCURRENCY,
): Promise<SkillDeletionProgress> {
  const journal = (await deps.beginSkillDeletion(id)) ?? (await deps.getSkillDeletion(id));
  if (!journal) {
    return {
      found: false,
      deleted: false,
      skillAbsent: true,
      cleanupComplete: true,
      failedSteps: [],
    };
  }
  await deps.reopenSkillDeletion(journal.skillId);
  const failedSteps: DeleteSkillCleanupStep[] = [];
  const intents = await deps.listSkillUploadIntents(journal.skillId);
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
  const files = await deps.listSkillFiles(id);
  const currentFileIds = new Set(files.map((file) => file.file_id));
  const cleanedFileIds = new Set<string>();
  const limit = createConcurrencyLimiter(fileCleanupConcurrency);
  await Promise.all(
    files.map((file) =>
      limit(async () => {
        try {
          await deps.deleteBlob(file);
          await deps.deleteSkillFileAfterBlob(id, file.file_id);
          cleanedFileIds.add(file.file_id);
        } catch {
          failedSteps.push('skill_files');
        }
      }),
    ),
  );

  for (const intent of intents) {
    if (intent.state === 'committed') {
      if (intent.cleanedAt) continue;
      if (currentFileIds.has(intent.fileId) && !cleanedFileIds.has(intent.fileId)) {
        // Keep the intent with its current row for the next retry.
        continue;
      }
      try {
        if (!cleanedFileIds.has(intent.fileId)) {
          await deps.deleteReservedBlob(intent);
        }
        await deps.markSkillUploadIntentCleaned(intent.fileId);
      } catch {
        failedSteps.push('upload_intents');
      }
      continue;
    }
    try {
      await deps.deleteReservedBlob(intent);
      // Keep abandoned intents as tombstones: a zombie upload can finish
      // after this cleanup and must be discovered on the next sweep.
    } catch {
      failedSteps.push('upload_intents');
    }
  }

  if (failedSteps.length > 0) {
    return {
      found: true,
      deleted: false,
      skillAbsent: journal.completedAt != null,
      cleanupComplete: false,
      failedSteps,
    };
  }
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
  await deps.completeSkillDeletion(journal.skillId);
  return {
    found: true,
    deleted: finalized.deleted,
    skillAbsent: finalized.skillAbsent,
    cleanupComplete: true,
    failedSteps: [],
  };
}
