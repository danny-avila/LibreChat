import { randomUUID } from 'node:crypto';
import type { ISkillUploadIntent } from '@librechat/data-schemas';
import type { SkillBlobReservation } from './reservation';

type ReserveInput = {
  skillId: string;
  author: string;
  fileId: string;
  source: string;
  storageKey: string;
  tenantId?: string;
  writerId: string;
};

export interface SkillUploadIntentDeps {
  reserveSkillUploadIntent: (input: ReserveInput) => Promise<ISkillUploadIntent>;
  transitionSkillUploadIntent: (
    fileId: string,
    writerId: string,
    from: ISkillUploadIntent['state'],
    to: ISkillUploadIntent['state'],
  ) => Promise<boolean>;
}

export interface SkillUploadOperation<T> {
  skillId: string;
  author: string;
  tenantId?: string;
  fileId: string;
  source: string;
  reservation: SkillBlobReservation;
  save: () => Promise<string>;
  persist: (filepath: string) => Promise<T>;
  isPersisted: () => Promise<boolean>;
  deleteReserved: (reservation: SkillBlobReservation, savedPath?: string) => Promise<void>;
}

/** Persist the future object location before bytes can reach external storage. */
export async function withSkillUploadIntent<T>(
  deps: SkillUploadIntentDeps,
  operation: SkillUploadOperation<T>,
): Promise<T> {
  const writerId = randomUUID();
  await deps.reserveSkillUploadIntent({
    skillId: operation.skillId,
    author: operation.author,
    tenantId: operation.tenantId,
    fileId: operation.fileId,
    source: operation.source,
    storageKey: operation.reservation.filepath,
    writerId,
  });
  let savedPath: string | undefined;
  let persistedResult: { value: T } | undefined;
  try {
    const filepath = await operation.save();
    savedPath = filepath;
    const claimed = await deps.transitionSkillUploadIntent(
      operation.fileId,
      writerId,
      'uploading',
      'committing',
    );
    if (!claimed) {
      throw Object.assign(new Error('Skill upload was cancelled'), { code: 'SKILL_DELETING' });
    }
    persistedResult = { value: await operation.persist(filepath) };
    const committed = await deps.transitionSkillUploadIntent(
      operation.fileId,
      writerId,
      'committing',
      'committed',
    );
    if (!committed) throw new Error('Skill upload commit acknowledgement failed');
    return persistedResult.value;
  } catch (error) {
    let persisted = false;
    try {
      persisted = await operation.isPersisted();
    } catch {
      // Ambiguous database failure: do not delete a blob that may be live.
      throw error;
    }
    if (persisted) {
      const committed = await deps.transitionSkillUploadIntent(
        operation.fileId,
        writerId,
        'committing',
        'committed',
      );
      if (committed && persistedResult) return persistedResult.value;
      throw error;
    }
    await deps.transitionSkillUploadIntent(operation.fileId, writerId, 'uploading', 'abandoned');
    await deps.transitionSkillUploadIntent(operation.fileId, writerId, 'committing', 'abandoned');
    try {
      await operation.deleteReserved(operation.reservation, savedPath);
    } catch {
      // The abandoned intent remains durable for the reconciler.
    }
    throw error;
  }
}
