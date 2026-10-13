import { getSafeErrorMetadata } from '~/utils/errors';

export type StoredUploadRef = {
  file_id: string;
  filepath: string;
  source: string;
  storageKey?: string;
  storageRegion?: string;
};

export type StoredUploadCleanup = {
  stored: StoredUploadRef;
  /** Looks up the strategy's delete function; called only after a failure. */
  resolveDeleteFile: () => ((req: never, file: StoredUploadRef) => Promise<unknown>) | undefined;
  req: unknown;
  logger: { error: (message: string, meta?: unknown) => void };
};

/**
 * Runs the steps that follow a storage upload and removes the stored object when one fails,
 * since no file record exists yet for retention, expiry or erasure to find it through.
 * The original failure is rethrown; a failed cleanup is logged and never replaces it.
 */
export async function withStoredUploadCleanup<T>(
  { stored, resolveDeleteFile, req, logger }: StoredUploadCleanup,
  next: () => Promise<T>,
): Promise<T> {
  try {
    return await next();
  } catch (error) {
    try {
      await resolveDeleteFile()?.(req as never, stored);
    } catch (cleanupError) {
      logger.error(
        '[withStoredUploadCleanup] Failed to delete stored upload',
        getSafeErrorMetadata(cleanupError),
      );
    }
    throw error;
  }
}
