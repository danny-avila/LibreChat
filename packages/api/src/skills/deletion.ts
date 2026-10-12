import type { DeleteSkillResult, ISkillFile } from '@librechat/data-schemas';
import type { ISkillDeletion, ISkillUploadIntent } from '@librechat/data-schemas';
import type { Types } from 'mongoose';

type StoredSkillFile = ISkillFile & { _id: Types.ObjectId };

export interface SkillDeletionDeps {
  beginSkillDeletion: (id: string) => Promise<ISkillDeletion | null>;
  getSkillDeletion: (id: string) => Promise<ISkillDeletion | null>;
  listSkillFiles: (id: string) => Promise<StoredSkillFile[]>;
  listSkillUploadIntents: (id: Types.ObjectId) => Promise<ISkillUploadIntent[]>;
  deleteBlob: (file: StoredSkillFile) => Promise<void>;
  deleteReservedBlob: (intent: ISkillUploadIntent) => Promise<void>;
  deleteSkillFileAfterBlob: (skillId: string, fileId: string) => Promise<boolean>;
  finalizeSkillDeletion: (id: string) => Promise<DeleteSkillResult>;
  completeSkillDeletion: (id: Types.ObjectId) => Promise<void>;
  reopenSkillDeletion: (id: Types.ObjectId) => Promise<void>;
  markSkillUploadIntentCleaned: (fileId: string) => Promise<void>;
}

export type SkillDeletionProgress = {
  found: boolean;
  cleanupComplete: boolean;
  failedSteps: string[];
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
  await deps.reopenSkillDeletion(journal.skillId);
  const failedSteps: string[] = [];
  const intents = await deps.listSkillUploadIntents(journal.skillId);
  // A writer may still finish uploading or committing after this scan. An
  // operator can explicitly abandon an intent after verifying its writer died;
  // a timer alone must not infer that a slow upload is dead.
  if (intents.some((intent) => intent.state === 'uploading' || intent.state === 'committing')) {
    return { found: true, cleanupComplete: false, failedSteps: ['upload_intents'] };
  }
  const files = await deps.listSkillFiles(id);
  for (const file of files) {
    try {
      await deps.deleteBlob(file);
      await deps.deleteSkillFileAfterBlob(id, file.file_id);
    } catch {
      failedSteps.push('skill_files');
    }
  }

  for (const intent of intents) {
    if (intent.state === 'committed') {
      if (intent.cleanedAt) continue;
      try {
        await deps.deleteReservedBlob(intent);
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
  await deps.completeSkillDeletion(journal.skillId);
  return { found: true, cleanupComplete: true, failedSteps: [] };
}
