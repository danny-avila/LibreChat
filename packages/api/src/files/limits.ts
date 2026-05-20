import { megabyte, mergeFileConfig } from 'librechat-data-provider';
import type { UserStorageUsageParams } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';

export const FILE_STORAGE_LIMIT_ERROR_CODE = 'FILE_STORAGE_LIMIT_EXCEEDED';

export class FileStorageLimitError extends Error {
  readonly code = FILE_STORAGE_LIMIT_ERROR_CODE;
  readonly status = 413;

  constructor(storageLimit: number) {
    super(
      `storage limit exceeded. Delete files or ask an admin to raise your storage limit (${formatStorageLimit(storageLimit)}).`,
    );
    this.name = 'FileStorageLimitError';
  }
}

export type GetUserStorageUsage = (params: UserStorageUsageParams) => Promise<number>;

export type AssertFileStorageLimitParams = {
  req: ServerRequest;
  incomingBytes?: number | null;
  getUserStorageUsage: GetUserStorageUsage;
  excludeFileId?: UserStorageUsageParams['excludeFileId'];
  excludeSkillFile?: UserStorageUsageParams['excludeSkillFile'];
};

type FileStorageLimitCache = {
  storageLimitLoaded: boolean;
  storageLimit?: number;
  committedBytes: number;
  usageByScope: Map<string, number>;
};

type StorageLimitRequest = {
  config?: ServerRequest['config'];
  user?: {
    id?: string;
    tenantId?: string;
  };
  fileStorageLimitCache?: FileStorageLimitCache;
};

function formatStorageLimit(bytes: number): string {
  if (bytes >= megabyte) {
    return `${Math.floor(bytes / megabyte)}MB`;
  }

  return `${bytes} bytes`;
}

function normalizeIncomingBytes(incomingBytes?: number | null): number {
  const bytes = Number(incomingBytes ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 0;
  }
  return bytes;
}

function getStorageLimitCache(req: StorageLimitRequest): FileStorageLimitCache {
  const storageReq = req as StorageLimitRequest;
  storageReq.fileStorageLimitCache ??= {
    storageLimitLoaded: false,
    committedBytes: 0,
    usageByScope: new Map<string, number>(),
  };
  return storageReq.fileStorageLimitCache;
}

function getStorageLimit(req: StorageLimitRequest): number | undefined {
  const cache = getStorageLimitCache(req);
  if (!cache.storageLimitLoaded) {
    cache.storageLimit = mergeFileConfig(req.config?.fileConfig).storageLimit;
    cache.storageLimitLoaded = true;
  }
  return cache.storageLimit;
}

function getUsageCacheKey(params: UserStorageUsageParams): string {
  return JSON.stringify({
    userId: params.userId.toString(),
    tenantId: params.tenantId ?? null,
    excludeFileId: params.excludeFileId ?? null,
    excludeSkillFile: params.excludeSkillFile
      ? {
          id: params.excludeSkillFile.id?.toString() ?? null,
          skillId: params.excludeSkillFile.skillId?.toString() ?? null,
          relativePath: params.excludeSkillFile.relativePath ?? null,
        }
      : null,
  });
}

export function isFileStorageLimitError(error: unknown): error is FileStorageLimitError {
  return (
    error instanceof Error &&
    (error as Error & { code?: string }).code === FILE_STORAGE_LIMIT_ERROR_CODE
  );
}

/**
 * Soft quota gate: prevents writes once observed usage reaches the cap.
 * Concurrent requests can still pass before each has committed its ledger row.
 */
export async function assertFileStorageLimit({
  req,
  incomingBytes,
  getUserStorageUsage,
  excludeFileId,
  excludeSkillFile,
}: AssertFileStorageLimitParams): Promise<void> {
  const storageLimit = getStorageLimit(req);
  if (storageLimit === undefined) {
    return;
  }

  const bytes = normalizeIncomingBytes(incomingBytes);
  const userId = req.user?.id;
  if (!userId) {
    throw new Error('Unable to determine user for storage limit check');
  }

  const usageParams: UserStorageUsageParams = {
    userId,
    tenantId: req.user?.tenantId,
    excludeFileId,
    excludeSkillFile,
  };
  const cache = getStorageLimitCache(req);
  const usageCacheKey = getUsageCacheKey(usageParams);
  let currentUsage = cache.usageByScope.get(usageCacheKey);
  if (currentUsage === undefined) {
    currentUsage = await getUserStorageUsage(usageParams);
    cache.usageByScope.set(usageCacheKey, currentUsage);
  }

  if (currentUsage + cache.committedBytes + bytes <= storageLimit) {
    return;
  }

  throw new FileStorageLimitError(storageLimit);
}

export function recordFileStorageUsage(
  req: StorageLimitRequest,
  incomingBytes?: number | null,
): void {
  const bytes = normalizeIncomingBytes(incomingBytes);
  if (bytes === 0) {
    return;
  }

  const cache = getStorageLimitCache(req);
  cache.committedBytes += bytes;
}
