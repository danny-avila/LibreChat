import { LocalStorageKeys } from 'librechat-data-provider';

/**
 * The id of the import the panel should rejoin. A confirmed import runs in
 * the background for minutes; without this the panel forgets it the moment
 * it unmounts, and there is no endpoint to list a user's jobs to recover
 * from. Reads and writes are guarded because `localStorage` throws in
 * private-browsing and storage-disabled contexts.
 */
export function readActiveJobId(): string | null {
  try {
    return window.localStorage.getItem(LocalStorageKeys.IMPORT_JOB_ID);
  } catch {
    return null;
  }
}

export function writeActiveJobId(jobId: string | null): void {
  try {
    if (jobId == null) {
      window.localStorage.removeItem(LocalStorageKeys.IMPORT_JOB_ID);
      return;
    }
    window.localStorage.setItem(LocalStorageKeys.IMPORT_JOB_ID, jobId);
  } catch {
    return;
  }
}
