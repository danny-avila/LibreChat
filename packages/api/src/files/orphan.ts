import { getSafeErrorMetadata } from '~/utils/errors';

export type StoredUploadRef = {
  file_id: string;
  filepath: string;
  source: string;
  storageKey?: string;
  storageRegion?: string;
};

export type StoredUploadCleanupDeps = {
  /** The strategy's delete function; absent when the strategy cannot delete. */
  deleteFile?: (req: never, file: StoredUploadRef) => Promise<unknown>;
  req: unknown;
  logger: { error: (message: string, meta?: unknown) => void };
};

/**
 * Runs the steps that follow a storage upload and removes the stored object when one fails,
 * since no file record exists yet for retention, expiry or erasure to find it through.
 * The original failure is rethrown; a failed cleanup is logged and never replaces it.
 */
export async function withStoredUploadCleanup<T>(
  stored: StoredUploadRef,
  deps: StoredUploadCleanupDeps,
  next: () => Promise<T>,
): Promise<T> {
  try {
    return await next();
  } catch (error) {
    if (deps.deleteFile != null) {
      try {
        await deps.deleteFile(deps.req as never, stored);
      } catch (cleanupError) {
        deps.logger.error(
          '[withStoredUploadCleanup] Failed to delete stored upload',
          getSafeErrorMetadata(cleanupError),
        );
      }
    }
    throw error;
  }
}
