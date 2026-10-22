import { randomUUID } from 'node:crypto';
import type {
  FileStorageMethods,
  FileStorageClaim,
  FileStorageScope,
  FileProvisionCommit,
} from '@librechat/data-schemas';

export type RawProvisionStorage = Pick<
  FileStorageMethods,
  'acquireFileProvision' | 'releaseFileProvision' | 'commitFileProvision'
>;
export type FileProvisionStorage = RawProvisionStorage & { recovery: FileProvisionRecovery };
export type FileDeleteStorage = FileProvisionStorage &
  Pick<FileStorageMethods, 'acquireFileDeletion' | 'releaseFileDeletion'>;

type StorageIdentity = {
  file_id: string;
  user?: { toString(): string };
  tenantId?: string | null;
};

export type FileProvisionResult<T> = {
  value: T;
  commit: Omit<FileProvisionCommit, 'claim'>;
};

type ProvisionRun<T> = {
  file: StorageIdentity;
  userId: string;
  storage: RawProvisionStorage;
  destination: string;
  upload: (claim: FileStorageClaim, onUploadStart: () => void) => Promise<FileProvisionResult<T>>;
};

export interface FileProvisionRecovery {
  run<T>(options: ProvisionRun<T>): Promise<T>;
  recover(scope: FileStorageScope, storage: RawProvisionStorage): Promise<void>;
}

/** The remote copy exists but its durable pointer is not confirmed. Keep the claim for recovery. */
export class FileProvisionPersistenceError extends Error {
  constructor(cause?: unknown) {
    super('File provisioning persistence was not confirmed', { cause });
    this.name = 'FileProvisionPersistenceError';
  }
}

/** Dispatch may have created a remote copy. Only operator-verified absence can release its claim. */
export class FileProvisionOutcomeUnknownError extends FileProvisionPersistenceError {
  constructor(cause?: unknown) {
    super(cause);
    this.name = 'FileProvisionOutcomeUnknownError';
    this.message = 'File provisioning outcome is unknown; manual recovery is required';
  }
}

/** Only explicit denials establish that storage did not accept the operation. */
export function isDefinitiveFileStorageFailure(error: unknown): boolean {
  let current = error;
  // RAG wraps the HTTP failure; inspect at most two nested causes.
  for (let depth = 0; depth < 3; depth++) {
    if (typeof current !== 'object' || current === null) return false;
    if ('code' in current) {
      switch (current.code) {
        case 'EACCES':
        case 'EPERM':
        case 'CODE_API_RATE_LIMITED':
          return true;
      }
    }
    if (
      'response' in current &&
      typeof current.response === 'object' &&
      current.response !== null &&
      'status' in current.response
    ) {
      switch (current.response.status) {
        case 400:
        case 401:
        case 403:
        case 404:
        case 413:
        case 415:
        case 422:
        case 429:
          return true;
        default:
          return false;
      }
    }
    if (!('cause' in current)) return false;
    current = current.cause;
  }
  return false;
}

type ProvisionEntry = {
  claim: FileStorageClaim;
  phase: 'upload' | 'commit' | 'release' | 'ambiguous';
  hasResult: boolean;
  value?: unknown;
  commit?: FileProvisionCommit;
  attempt?: Promise<unknown>;
  recovering?: boolean;
};

function scopeKey(scope: FileStorageScope): string {
  return JSON.stringify([scope.tenantId ?? null, scope.userId, scope.file_id]);
}

function fileScope(file: StorageIdentity, userId: string): FileStorageScope {
  return {
    file_id: file.file_id,
    userId: file.user?.toString() ?? userId,
    tenantId: file.tenantId,
  };
}

/** App-lifetime recovery only. Unknown claims, including those lost on restart, need manual recovery. */
export function createFileProvisionRecovery(): FileProvisionRecovery {
  const files = new Map<string, Map<string, ProvisionEntry>>();

  function remove(key: string, destination: string, entry: ProvisionEntry): void {
    const entries = files.get(key);
    if (entries?.get(destination) !== entry) return;
    entries.delete(destination);
    if (entries.size === 0) files.delete(key);
  }

  async function release(entry: ProvisionEntry, storage: RawProvisionStorage): Promise<void> {
    try {
      if (!(await storage.releaseFileProvision(entry.claim))) {
        throw new FileProvisionPersistenceError();
      }
    } catch (error) {
      if (error instanceof FileProvisionPersistenceError) throw error;
      throw new FileProvisionPersistenceError(error);
    }
  }

  async function settle(
    key: string,
    destination: string,
    entry: ProvisionEntry,
    storage: RawProvisionStorage,
  ): Promise<unknown> {
    if (entry.phase === 'ambiguous') throw new FileProvisionOutcomeUnknownError();
    if (entry.phase === 'commit' && entry.commit) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // Storage receives a copy so a failed adapter cannot alter the recovery payload.
          await confirmFileProvision(storage, structuredClone(entry.commit));
          entry.phase = 'release';
          break;
        } catch (error) {
          if (attempt === 1) throw error;
        }
      }
    }
    await release(entry, storage);
    remove(key, destination, entry);
    return entry.value;
  }

  function retry(
    key: string,
    destination: string,
    entry: ProvisionEntry,
    storage: RawProvisionStorage,
  ): Promise<unknown> {
    if (entry.attempt) return entry.attempt;
    entry.recovering = true;
    entry.attempt = settle(key, destination, entry, storage).finally(() => {
      entry.attempt = undefined;
      entry.recovering = false;
    });
    return entry.attempt;
  }

  async function run<T>(options: ProvisionRun<T>): Promise<T> {
    const { file, userId, storage, destination, upload } = options;
    const scope = fileScope(file, userId);
    const key = scopeKey(scope);
    let entries = files.get(key);
    const existing = entries?.get(destination);
    if (existing) {
      const reusable = existing.phase !== 'release' || existing.hasResult;
      const value = await (existing.attempt ?? retry(key, destination, existing, storage));
      // Only values from this exact scope and destination cross the internal generic map.
      if (reusable) return value as T;
      return run(options);
    }
    if (!entries) {
      entries = new Map();
      files.set(key, entries);
    }
    const entry: ProvisionEntry = {
      claim: Object.freeze({ ...scope, token: randomUUID() }),
      phase: 'upload',
      hasResult: false,
    };
    entries.set(destination, entry);
    const execute = async (): Promise<T> => {
      try {
        if (!(await storage.acquireFileProvision(entry.claim))) {
          throw new Error('File provisioning conflicts with deletion or a missing record');
        }
      } catch (error) {
        remove(key, destination, entry);
        throw error;
      }
      let result: FileProvisionResult<T>;
      let uploadStarted = false;
      try {
        result = await upload(entry.claim, () => {
          uploadStarted = true;
        });
      } catch (error) {
        if (uploadStarted && !isDefinitiveFileStorageFailure(error)) {
          entry.phase = 'ambiguous';
          throw new FileProvisionOutcomeUnknownError(error);
        }
        entry.phase = 'release';
        try {
          await release(entry, storage);
          remove(key, destination, entry);
        } catch {
          // Preserve the upload error while retaining release-only recovery.
        }
        throw error;
      }
      entry.value = result.value;
      entry.hasResult = true;
      entry.commit = { ...structuredClone(result.commit), claim: entry.claim };
      entry.phase = 'commit';
      await settle(key, destination, entry, storage);
      return result.value;
    };
    entry.attempt = execute().finally(() => {
      entry.attempt = undefined;
    });
    return entry.attempt as Promise<T>;
  }

  return {
    run,
    async recover(scope, storage) {
      const key = scopeKey(scope);
      const entries = files.get(key);
      if (!entries) return;
      const attempts: Promise<unknown>[] = [];
      for (const [destination, entry] of entries) {
        if (entry.phase === 'upload' || (entry.attempt && !entry.recovering)) continue;
        attempts.push(retry(key, destination, entry, storage));
      }
      await Promise.all(attempts);
    },
  };
}

/** A durable claim spans upload, pointer persistence and release. */
export function withFileProvisioning<T>({
  operation,
  storage,
  ...options
}: Omit<ProvisionRun<T>, 'upload' | 'storage'> & {
  storage: FileProvisionStorage;
  operation: (
    claim: FileStorageClaim,
    onUploadStart: () => void,
  ) => Promise<FileProvisionResult<T>>;
}): Promise<T> {
  return storage.recovery.run({ ...options, storage, upload: operation });
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
  operation: (
    primaryDeleted: (confirmed?: boolean) => void,
    onOutcomeUnknown: () => void,
  ) => Promise<T>;
}): Promise<T> {
  const scope = fileScope(file, userId);
  await storage.recovery.recover(scope, storage);
  const claim = { ...scope, updatedAt: file.updatedAt, token: randomUUID() };
  const acquired = await storage.acquireFileDeletion(claim);
  if (!acquired) throw new Error('File deletion conflicts with active storage work');
  let retainDeletion = acquired.resumed;
  let primaryConfirmed = false;
  let uncertain = false;
  const release = async () => {
    if (!(await storage.releaseFileDeletion({ ...claim, retainDeletion }))) {
      throw new Error('File deletion claim could not be released');
    }
  };
  let value: T;
  try {
    value = await operation(
      (confirmed = true) => {
        retainDeletion = true;
        primaryConfirmed = primaryConfirmed || confirmed;
      },
      () => {
        uncertain = true;
        retainDeletion = true;
      },
    );
  } catch (error) {
    if (
      retainDeletion &&
      !acquired.resumed &&
      !primaryConfirmed &&
      !uncertain &&
      isDefinitiveFileStorageFailure(error)
    ) {
      retainDeletion = false;
    }
    try {
      await release();
    } catch {
      // The operation error remains primary.
    }
    throw error;
  }
  await release();
  return value;
}

/** A missing or replaced claim cannot publish a newly uploaded copy. */
export async function confirmFileProvision(
  storage: Pick<RawProvisionStorage, 'commitFileProvision'>,
  data: FileProvisionCommit,
): Promise<void> {
  try {
    if (!(await storage.commitFileProvision(data))) throw new FileProvisionPersistenceError();
  } catch (error) {
    if (error instanceof FileProvisionPersistenceError) throw error;
    throw new FileProvisionPersistenceError(error);
  }
}
