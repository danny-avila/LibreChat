import { FileSources } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest, StrategyFunctions } from '~/types';
import { getFileStream, isAttachmentObjectNotFoundError } from './utils';
import { runGuardedEncode } from './memoryGuard';

const blobStorageSources = new Set<string>([
  FileSources.azure_blob,
  FileSources.s3,
  FileSources.firebase,
  FileSources.cloudfront,
]);

export class AttachmentStorageError extends Error {
  readonly code = 'ATTACHMENT_STORAGE_ERROR';

  constructor() {
    super('An attached file could not be read from storage. Try again or upload it again.');
    this.name = 'AttachmentStorageError';
  }
}

export async function tryEncodeImageFromStorage(
  req: ServerRequest,
  file: IMongoFile,
  encodingMethods: Record<string, StrategyFunctions>,
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<[IMongoFile, string | null] | null> {
  const source = file.source ?? FileSources.local;
  if (!blobStorageSources.has(source)) {
    return null;
  }

  try {
    const processedFile = await runGuardedEncode(file.bytes ?? 0, () =>
      getFileStream(req, file, encodingMethods, getStrategyFunctions),
    );
    return [file, processedFile?.content ?? null];
  } catch (error) {
    if (isAttachmentObjectNotFoundError(error)) {
      throw error;
    }
    if (typeof error === 'object' && error != null && 'bufferedData' in error) {
      delete (error as { bufferedData?: unknown }).bufferedData;
    }
    throw new AttachmentStorageError();
  }
}
