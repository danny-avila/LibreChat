import type { DeleteFilesResponse } from 'librechat-data-provider';

/** What a delete pass reports back about the records it was given. */
export type FileDeletionOutcome = {
  deletedFileIds?: string[];
  failedFileIds?: string[];
};

export const PARTIAL_FILE_DELETION_MESSAGE = 'Some files could not be deleted';

/**
 * Shapes the body of a delete response. A record whose storage delete failed is not an error for
 * the request as a whole, so the outcome travels in the body rather than the status: clients read
 * `failedFileIds` to know what is still on disk, and treat everything else they asked for as gone.
 */
export const buildDeleteFilesResponse = (
  result: FileDeletionOutcome | null | undefined,
  successMessage: string,
): DeleteFilesResponse => {
  const deletedFileIds = result?.deletedFileIds ?? [];
  const failedFileIds = result?.failedFileIds ?? [];
  return {
    message: failedFileIds.length > 0 ? PARTIAL_FILE_DELETION_MESSAGE : successMessage,
    deletedFileIds,
    failedFileIds,
  };
};
