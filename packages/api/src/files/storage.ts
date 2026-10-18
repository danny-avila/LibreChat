import { FileSources } from 'librechat-data-provider';

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

/** Keep the primary readable until every secondary has settled successfully or is already absent. */
export function createDeleteFileWithSecondaryStorage<TRequest, TFile extends StorageFile, TClient>({
  source,
  deleteFile,
  getDeleteFile,
  logger,
}: {
  source: string;
  deleteFile: DeleteStorageFile<TRequest, TFile, TClient>;
  getDeleteFile: (source: string) => DeleteStorageFile<TRequest, TFile>;
  logger: { warn: (message: string, error: unknown) => void };
}): DeleteStorageFile<TRequest, TFile, TClient> {
  return async (req, file, client) => {
    const secondaries: Array<DeleteStorageFile<TRequest, TFile>> = [];
    if (file.embedded === true && source !== FileSources.vectordb) {
      secondaries.push(getDeleteFile(FileSources.vectordb));
    }
    const hasCodeEnvRef = file.metadata?.codeEnvRef != null || file.metadata?.codeEnvRefs != null;
    if (hasCodeEnvRef && source !== FileSources.execute_code) {
      secondaries.push(getDeleteFile(FileSources.execute_code));
    }

    const remove = async (operation: () => Promise<unknown>): Promise<void> => {
      try {
        await operation();
      } catch (error) {
        if (!isMissingStorageError(error)) {
          throw error;
        }
        logger.warn('File storage was already missing during delete', getSafeErrorMetadata(error));
      }
    };

    const results = await Promise.allSettled(
      secondaries.map((deleteSecondary) => remove(() => deleteSecondary(req, file))),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        throw result.reason;
      }
    }
    await remove(() => deleteFile(req, file, client));
  };
}
