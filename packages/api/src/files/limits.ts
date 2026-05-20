import { megabyte, mergeFileConfig } from 'librechat-data-provider';
import type { UserStorageUsageParams } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';

export const FILE_STORAGE_LIMIT_ERROR_CODE = 'FILE_STORAGE_LIMIT_EXCEEDED';

export class FileStorageLimitError extends Error {
  code = FILE_STORAGE_LIMIT_ERROR_CODE;
  status = 413;

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

function formatStorageLimit(bytes: number): string {
  if (bytes >= megabyte) {
    return `${Math.floor(bytes / megabyte)}MB`;
  }

  return `${bytes} bytes`;
}

export function isFileStorageLimitError(error: unknown): error is FileStorageLimitError {
  return (
    error instanceof Error &&
    (error as Error & { code?: string }).code === FILE_STORAGE_LIMIT_ERROR_CODE
  );
}

export async function assertFileStorageLimit({
  req,
  incomingBytes,
  getUserStorageUsage,
  excludeFileId,
  excludeSkillFile,
}: AssertFileStorageLimitParams): Promise<void> {
  const storageLimit = mergeFileConfig(req.config?.fileConfig).storageLimit;
  if (storageLimit === undefined) {
    return;
  }

  const bytes = Math.max(0, incomingBytes ?? 0);
  const userId = req.user?.id;
  if (!userId) {
    throw new Error('Unable to determine user for storage limit check');
  }

  const currentUsage = await getUserStorageUsage({
    userId,
    tenantId: req.user?.tenantId,
    excludeFileId,
    excludeSkillFile,
  });

  if (currentUsage + bytes <= storageLimit) {
    return;
  }

  throw new FileStorageLimitError(storageLimit);
}
