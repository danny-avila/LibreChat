import { getSafeErrorMetadata } from '~/utils/errors';

export type StoredUploadRef = {
  file_id: string;
  filepath: string;
  source: string;
  storageKey?: string;
  storageRegion?: string;
  /** Owner of the stored object; defaults to the requesting user. */
  user?: string;
  tenantId?: string;
};

export type StoredUploadCleanup = {
  stored: StoredUploadRef;
  /** Looks up the strategy's delete function; called only after a failure. */
  resolveDeleteFile: () => ((req: never, file: StoredUploadRef) => Promise<unknown>) | undefined;
  req: { user?: { id?: string; tenantId?: string } };
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
      /* Storage strategies validate ownership and tenant against the object key. */
      const ref: StoredUploadRef = {
        user: req.user?.id,
        tenantId: req.user?.tenantId,
        ...stored,
      };
      await resolveDeleteFile()?.(req as never, ref);
    } catch (cleanupError) {
      logger.error(
        '[withStoredUploadCleanup] Failed to delete stored upload',
        getSafeErrorMetadata(cleanupError),
      );
    }
    throw error;
  }
}
