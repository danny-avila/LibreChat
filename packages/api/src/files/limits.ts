import { megabyte, mergeFileConfig } from 'librechat-data-provider';
import type { UserStorageUsageParams } from '@librechat/data-schemas';
import type { RequestTenantSource } from '~/middleware/tenant';
import type { ServerRequest } from '~/types';
import { resolveRequestTenantId } from '~/middleware/tenant';

export const FILE_STORAGE_LIMIT_ERROR_CODE = 'FILE_STORAGE_LIMIT_EXCEEDED';

export class FileStorageLimitError extends Error {
  readonly code: typeof FILE_STORAGE_LIMIT_ERROR_CODE = FILE_STORAGE_LIMIT_ERROR_CODE;
  readonly status = 413 as const;
  readonly storageLimit: number;
  readonly currentUsage: number;

  /**
   * Reports observed usage alongside the cap. A user who is already over the
   * limit — because an admin lowered it or enabled quotas on an existing
   * account — otherwise has no way to tell how much they must free before any
   * write succeeds again.
   */
  constructor(storageLimit: number, currentUsage: number) {
    super(
      `storage limit exceeded. You are using ${formatBytes(currentUsage)} of your ${formatBytes(storageLimit)} storage limit. Delete files or ask an admin to raise the limit.`,
    );
    this.name = 'FileStorageLimitError';
    this.storageLimit = storageLimit;
    this.currentUsage = currentUsage;
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
  usageByScope: Map<string, StorageUsageEntry>;
};

type StorageUsageEntry = {
  params: UserStorageUsageParams;
  currentUsage: number;
};

type RecordFileStorageUsageOptions = {
  fileId?: UserStorageUsageParams['excludeFileId'];
  skillFile?: UserStorageUsageParams['excludeSkillFile'];
};

type StorageLimitRequest = {
  config?: ServerRequest['config'];
  /** Tenant resolved by request middleware; preferred over user.tenantId when present. */
  tenantId?: string;
  user?: {
    id?: string;
    tenantId?: string;
  };
  fileStorageLimitCache?: FileStorageLimitCache;
};

function formatBytes(bytes: number): string {
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
  req.fileStorageLimitCache ??= {
    storageLimitLoaded: false,
    usageByScope: new Map<string, StorageUsageEntry>(),
  };
  return req.fileStorageLimitCache;
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

function idsMatch(
  left?: { toString: () => string } | string | null,
  right?: { toString: () => string } | string | null,
): boolean {
  return left != null && right != null && left.toString() === right.toString();
}

function skillFilesMatch(
  excludeSkillFile: UserStorageUsageParams['excludeSkillFile'],
  skillFile: UserStorageUsageParams['excludeSkillFile'],
): boolean {
  if (!excludeSkillFile || !skillFile) {
    return false;
  }
  if (idsMatch(excludeSkillFile.id, skillFile.id)) {
    return true;
  }
  return (
    idsMatch(excludeSkillFile.skillId, skillFile.skillId) &&
    excludeSkillFile.relativePath != null &&
    excludeSkillFile.relativePath === skillFile.relativePath
  );
}

function isExcludedFromScope(
  params: UserStorageUsageParams,
  options: RecordFileStorageUsageOptions,
): boolean {
  return (
    idsMatch(params.excludeFileId, options.fileId) ||
    skillFilesMatch(params.excludeSkillFile, options.skillFile)
  );
}

type SkillFileReplacementParams = {
  /** Row about to be overwritten, or null/undefined when this is a fresh write. */
  existingFile?: { author?: { toString(): string } | null } | null;
  /** Authenticated requester, whose ledger the replaced row is charged to. */
  requesterId?: { toString(): string } | null;
  skillId: NonNullable<UserStorageUsageParams['excludeSkillFile']>['skillId'];
  relativePath: string;
};

/**
 * Exclusion for a skill file the requester is replacing. Only the requester's own
 * rows may be discounted — a file authored by someone else is charged to that
 * author and stays in the usage total.
 */
export function getSkillFileReplacementExclusion({
  existingFile,
  requesterId,
  skillId,
  relativePath,
}: SkillFileReplacementParams): UserStorageUsageParams['excludeSkillFile'] {
  const author = existingFile?.author;
  if (author == null || requesterId == null) {
    return undefined;
  }

  if (author.toString() !== requesterId.toString()) {
    return undefined;
  }

  return { skillId, relativePath };
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

  /**
   * Ledger writes stamp this same resolved tenant (see `createFileWithStorageLimit`),
   * so query scope and write scope stay equal even when remote-agent auth supplies
   * `req.tenantId` for a user carrying no tenant of their own.
   */
  const usageParams: UserStorageUsageParams = {
    userId,
    tenantId: resolveRequestTenantId(req as RequestTenantSource),
    excludeFileId,
    excludeSkillFile,
  };
  const cache = getStorageLimitCache(req);
  const usageCacheKey = getUsageCacheKey(usageParams);
  let usageEntry = cache.usageByScope.get(usageCacheKey);
  if (usageEntry === undefined) {
    usageEntry = {
      params: usageParams,
      currentUsage: await getUserStorageUsage(usageParams),
    };
    cache.usageByScope.set(usageCacheKey, usageEntry);
  }

  if (usageEntry.currentUsage + bytes <= storageLimit) {
    return;
  }

  throw new FileStorageLimitError(storageLimit, usageEntry.currentUsage);
}

export function recordFileStorageUsage(
  req: StorageLimitRequest,
  incomingBytes?: number | null,
  options: RecordFileStorageUsageOptions = {},
): void {
  const bytes = normalizeIncomingBytes(incomingBytes);
  if (bytes === 0) {
    return;
  }

  const cache = getStorageLimitCache(req);
  cache.usageByScope.forEach((entry) => {
    if (isExcludedFromScope(entry.params, options)) {
      return;
    }
    entry.currentUsage += bytes;
  });
}
