import { FileSources } from 'librechat-data-provider';
import type { SaveURLResult } from './types';
import { extractKeyFromS3Url, getStorageMetadataForKey } from './s3/crud';

type StorageMetadataInput = {
  filepath?: string | null;
  source?: string | null;
  storageKey?: string | null;
  storageRegion?: string | null;
};

export function getStorageMetadata({
  filepath,
  source,
  storageKey,
  storageRegion,
}: StorageMetadataInput): Pick<SaveURLResult, 'storageKey' | 'storageRegion'> {
  if (source !== FileSources.s3 && source !== FileSources.cloudfront) {
    return {};
  }

  const key = storageKey || (filepath ? extractKeyFromS3Url(filepath) : '');
  if (!key) {
    return {};
  }

  return {
    ...getStorageMetadataForKey(key),
    ...(storageRegion ? { storageRegion } : {}),
  };
}
