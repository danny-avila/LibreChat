import { FileSources } from 'librechat-data-provider';

import type { ClearFileEmbeddingsParams } from '@librechat/data-schemas';

import { getSafeErrorMetadata } from '../utils/errors';

const MISSING_STORAGE_CODES = new Set<string | number>([
  404,
  '404',
  'ENOENT',
  'NoSuchKey',
  'NotFound',
  'ResourceNotFound',
]);

type StorageFile = {
  file_id?: string;
  user?: { toString(): string };
  tenantId?: string;
  updatedAt?: Date | string;
  embedded?: boolean;
  metadata?: Record<string, unknown>;
};

type DeleteStorageFile<TRequest, TFile, TClient = never> = (
  req: TRequest,
  file: TFile,
  client?: TClient,
) => Promise<unknown>;

export function isMissingStorageError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }
  const response = 'response' in error ? error.response : undefined;
  const codes = [
    'code' in error ? error.code : undefined,
    'status' in error ? error.status : undefined,
    'statusCode' in error ? error.statusCode : undefined,
    response != null && typeof response === 'object' && 'status' in response
      ? response.status
      : undefined,
  ];
  if (
    codes.some(
      (code) =>
        (typeof code === 'string' || typeof code === 'number') && MISSING_STORAGE_CODES.has(code),
    )
  ) {
    return true;
  }
  return (
    'message' in error &&
    typeof error.message === 'string' &&
    /(?:file|object|blob|key|resource) (?:not found|does not exist)|no such (?:file|key)/i.test(
      error.message,
    )
  );
}

function readEmbeddedEntities(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((entity): entity is string => typeof entity === 'string')
  ) {
    throw new Error('Invalid file embedding snapshot');
  }
  return value;
}

/** Keep the primary readable until every secondary has settled successfully or is already absent. */
export function createDeleteFileWithSecondaryStorage<
  TRequest extends { user: { id: string; tenantId?: string } },
  TFile extends StorageFile,
  TClient,
>({
  source,
  deleteFile,
  getDeleteFile,
  clearFileEmbeddings,
  logger,
}: {
  source: string;
  deleteFile: DeleteStorageFile<TRequest, TFile, TClient>;
  getDeleteFile: (source: string) => DeleteStorageFile<TRequest, TFile>;
  clearFileEmbeddings: (data: ClearFileEmbeddingsParams) => Promise<boolean>;
  logger: { warn: (message: string, error: unknown) => void };
}): DeleteStorageFile<TRequest, TFile, TClient> {
  return async (req, file, client) => {
    const secondaries: Array<DeleteStorageFile<TRequest, TFile>> = [];
    let vectorIndex = -1;
    if (file.embedded === true && source !== FileSources.vectordb) {
      vectorIndex = secondaries.length;
      secondaries.push(getDeleteFile(FileSources.vectordb));
    }
    const hasCodeEnvRef = file.metadata?.codeEnvRef != null || file.metadata?.codeEnvRefs != null;
    if (hasCodeEnvRef && source !== FileSources.execute_code) {
      secondaries.push(getDeleteFile(FileSources.execute_code));
    }

    const remove = async (operation: () => Promise<unknown>): Promise<unknown> => {
      try {
        return await operation();
      } catch (error) {
        if (!isMissingStorageError(error)) {
          throw error;
        }
        logger.warn('File storage was already missing during delete', getSafeErrorMetadata(error));
        return { deleted: true };
      }
    };

    const results = await Promise.allSettled(
      secondaries.map((deleteSecondary) => remove(() => deleteSecondary(req, file))),
    );
    const vectors = results[vectorIndex];
    if (
      vectors?.status === 'fulfilled' &&
      vectors.value != null &&
      typeof vectors.value === 'object' &&
      'deleted' in vectors.value &&
      vectors.value.deleted === true
    ) {
      try {
        if (
          !file.file_id ||
          !(await clearFileEmbeddings({
            file_id: file.file_id,
            userId: file.user?.toString() ?? req.user.id,
            tenantId: file.tenantId,
            updatedAt: file.updatedAt,
            embeddedEntities: readEmbeddedEntities(file.metadata?.embeddedEntities),
          }))
        ) {
          throw new Error('Embedding snapshot changed');
        }
      } catch (error) {
        throw new Error('File embedding reconciliation failed', { cause: error });
      }
      file.embedded = false;
      file.metadata = { ...file.metadata, searchDestination: true };
      delete file.metadata.embeddedEntities;
    }
    for (const result of results) {
      if (result.status === 'rejected') {
        throw result.reason;
      }
    }
    await remove(() => deleteFile(req, file, client));
  };
}
