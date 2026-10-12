import type {
  DeleteSkillCleanupStep,
  DeleteSkillResult,
  ISkillFile,
} from '@librechat/data-schemas';
import type { ISkillDeletion, ISkillUploadIntent } from '@librechat/data-schemas';
import type { Types } from 'mongoose';

type StoredSkillFile = ISkillFile & { _id: Types.ObjectId };

export interface SkillDeletionDeps {
  beginSkillDeletion: (id: string) => Promise<ISkillDeletion | null>;
  getSkillDeletion: (id: string) => Promise<ISkillDeletion | null>;
  listSkillFiles: (id: string) => Promise<StoredSkillFile[]>;
  listSkillUploadIntents: (id: string) => Promise<ISkillUploadIntent[]>;
  deleteBlob: (file: StoredSkillFile) => Promise<void>;
  deleteReservedBlob: (intent: ISkillUploadIntent) => Promise<void>;
  deleteSkillFileAfterBlob: (skillId: string, fileId: string) => Promise<boolean>;
  finalizeSkillDeletion: (id: string) => Promise<DeleteSkillResult>;
  completeSkillDeletion: (id: string) => Promise<void>;
  reopenSkillDeletion: (id: string) => Promise<void>;
  markSkillUploadIntentCleaned: (fileId: string) => Promise<void>;
}

export type SkillDeletionProgress = {
  found: boolean;
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
): Promise<SkillDeletionProgress> {
  const journal = (await deps.beginSkillDeletion(id)) ?? (await deps.getSkillDeletion(id));
  if (!journal) return { found: false, cleanupComplete: false, failedSteps: [] };
  await deps.reopenSkillDeletion(journal.skillId.toString());
  const failedSteps: DeleteSkillCleanupStep[] = [];
  const intents = await deps.listSkillUploadIntents(journal.skillId.toString());
  // A writer may still finish uploading or committing after this scan. An
  // operator can explicitly abandon an intent after verifying its writer died;
  // a timer alone must not infer that a slow upload is dead.
  if (intents.some((intent) => intent.state === 'uploading' || intent.state === 'committing')) {
    return { found: true, cleanupComplete: false, failedSteps: ['upload_intents'] };
  }
  const files = await deps.listSkillFiles(id);
  const currentFileIds = new Set(files.map((file) => file.file_id));
  const cleanedFileIds = new Set<string>();
  for (const file of files) {
    try {
      await deps.deleteBlob(file);
      await deps.deleteSkillFileAfterBlob(id, file.file_id);
      cleanedFileIds.add(file.file_id);
    } catch {
      failedSteps.push('skill_files');
    }
  }

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
    return { found: true, cleanupComplete: false, failedSteps };
  }
  const finalized = await deps.finalizeSkillDeletion(id);
  if (!finalized.cleanupComplete) {
    return {
      found: true,
      cleanupComplete: false,
      failedSteps: finalized.failedCleanupSteps,
    };
  }
  await deps.completeSkillDeletion(journal.skillId.toString());
  return { found: true, cleanupComplete: true, failedSteps: [] };
}
