import type { TFile } from 'librechat-data-provider';

/** A stored file as a download needs it: the recorded object key when one exists, else the URL or path. */
export type StoredFileRef = Pick<TFile, 'filepath'> & {
  source?: string;
  storageKey?: string | null;
};

/**
 * Resolves the argument for a strategy's `getDownloadStream`. S3 and CloudFront records carry
 * the object key since the region-aware storage keys landed; handing it over directly skips
 * re-deriving it from a presigned or CDN URL, which is only sound while that URL still parses.
 * Records without a key (local, Firebase, Azure, code output) fall through to `filepath` as before.
 */
export function resolveDownloadPath(file: StoredFileRef): string {
  return (file.source === 's3' || file.source === 'cloudfront') && file.storageKey
    ? file.storageKey
    : file.filepath;
}

/** Strip a local filepath's cache query; remote URLs must retain presigned query parameters. */
export function stripCacheBust(filepath: string): string {
  const queryIndex = filepath.indexOf('?');
  return queryIndex === -1 ? filepath : filepath.slice(0, queryIndex);
}
