import { randomUUID } from 'node:crypto';
import type {
  FileStorageMethods,
  FileStorageClaim,
  FileProvisionCommit,
} from '@librechat/data-schemas';

export type FileProvisionStorage = Pick<
  FileStorageMethods,
  'acquireFileProvision' | 'releaseFileProvision' | 'commitFileProvision'
>;
export type FileDeleteStorage = Pick<
  FileStorageMethods,
  'acquireFileDeletion' | 'releaseFileDeletion'
>;

/** The remote copy exists but its durable pointer is not confirmed. Keep the claim for recovery. */
export class FileProvisionPersistenceError extends Error {
  constructor(cause?: unknown) {
    super('File provisioning persistence was not confirmed', { cause });
    this.name = 'FileProvisionPersistenceError';
  }
}

type StorageIdentity = {
  file_id: string;
  user?: { toString(): string };
  tenantId?: string | null;
};

/** A durable claim spans the upload and its persistence, not just the last database check. */
export async function withFileProvisioning<T>({
  file,
  userId,
  operation,
  storage,
}: {
  file: StorageIdentity;
  userId: string;
  operation: (claim: FileStorageClaim) => Promise<T>;
  storage: FileProvisionStorage;
}): Promise<T> {
  const claim = {
    file_id: file.file_id,
    userId: file.user?.toString() ?? userId,
    tenantId: file.tenantId,
    token: randomUUID(),
  };
  if (!(await storage.acquireFileProvision(claim))) {
    throw new Error('File provisioning conflicts with deletion or a missing record');
  }
  let release = true;
  try {
    return await operation(claim);
  } catch (error) {
    if (error instanceof FileProvisionPersistenceError) release = false;
    throw error;
  } finally {
    if (release && !(await storage.releaseFileProvision(claim))) {
      throw new Error('File provisioning claim could not be released');
    }
  }
}

/** Successful primary removal leaves deletion intent until conditional metadata finalization. */
export async function withFileDeletion<T>({
  file,
  userId,
  storage,
  operation,
}: {
  file: StorageIdentity & { updatedAt?: Date | string };
  userId: string;
  storage: FileDeleteStorage;
  operation: (primaryDeleted: () => void) => Promise<T>;
}): Promise<T> {
  const claim = {
    file_id: file.file_id,
    userId: file.user?.toString() ?? userId,
    tenantId: file.tenantId,
    updatedAt: file.updatedAt,
    token: randomUUID(),
  };
  const acquired = await storage.acquireFileDeletion(claim);
  if (!acquired) throw new Error('File deletion conflicts with active storage work');
  let retainDeletion = acquired.resumed;
  try {
    return await operation(() => {
      retainDeletion = true;
    });
  } finally {
    if (!(await storage.releaseFileDeletion({ ...claim, retainDeletion }))) {
      throw new Error('File deletion claim could not be released');
    }
  }
}

/** A missing or replaced claim cannot publish a newly uploaded copy. */
export async function confirmFileProvision(
  storage: Pick<FileProvisionStorage, 'commitFileProvision'>,
  data: FileProvisionCommit,
): Promise<void> {
  try {
    if (!(await storage.commitFileProvision(data))) throw new FileProvisionPersistenceError();
  } catch (error) {
    if (error instanceof FileProvisionPersistenceError) throw error;
    throw new FileProvisionPersistenceError(error);
  }
}
