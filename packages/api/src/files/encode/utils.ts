import getStream from 'get-stream';
import { Providers } from '@librechat/agents';
import { FileSources, mergeFileConfig, getEndpointFileConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest, StrategyFunctions, ProcessedFile } from '~/types';
import { resolveDownloadPath } from '~/storage/path';

export class AttachmentObjectNotFoundError extends Error {
  readonly code = 'ATTACHMENT_OBJECT_NOT_FOUND';

  constructor(readonly fileId: string | undefined) {
    super('An attached file is no longer available. Remove it, upload it again, and retry.');
    this.name = 'AttachmentObjectNotFoundError';
  }
}

export function isAttachmentObjectNotFoundError(
  error: unknown,
): error is AttachmentObjectNotFoundError {
  return error instanceof AttachmentObjectNotFoundError;
}

function isStorageNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) {
    return false;
  }
  const storageError = error as {
    name?: string;
    code?: string;
    status?: number;
    statusCode?: number;
    response?: { status?: number };
    $metadata?: { httpStatusCode?: number };
  };
  return (
    storageError.name === 'NoSuchKey' ||
    storageError.code === 'NoSuchKey' ||
    storageError.code === 'ENOENT' ||
    storageError.status === 404 ||
    storageError.statusCode === 404 ||
    storageError.response?.status === 404 ||
    storageError.$metadata?.httpStatusCode === 404
  );
}

/**
 * Extracts the configured file size limit for a specific provider from fileConfig
 * @param req - The server request object containing config
 * @param params - Object containing provider and optional endpoint
 * @param params.provider - The provider to get the limit for
 * @param params.endpoint - Optional endpoint name for lookup
 * @returns The configured file size limit in bytes, or undefined if not configured
 */
export const getConfiguredFileSizeLimit = (
  req: ServerRequest,
  params: {
    provider: Providers;
    endpoint?: string;
  },
): number | undefined => {
  if (!req.config?.fileConfig) {
    return undefined;
  }
  const { provider, endpoint } = params;
  const fileConfig = mergeFileConfig(req.config.fileConfig);
  const endpointConfig = getEndpointFileConfig({
    fileConfig,
    endpoint: endpoint ?? provider,
  });
  return endpointConfig?.fileSizeLimit;
};

/**
 * Processes a file by downloading and encoding it to base64
 * @param req - Express request object
 * @param file - File object to process
 * @param encodingMethods - Cache of encoding methods by source
 * @param getStrategyFunctions - Function to get strategy functions for a source
 * @returns Processed file with content and metadata, or null if filepath missing
 */
export async function getFileStream(
  req: ServerRequest,
  file: IMongoFile,
  encodingMethods: Record<string, StrategyFunctions>,
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<ProcessedFile | null> {
  if (!file?.filepath) {
    return null;
  }

  const source = file.source ?? FileSources.local;
  if (!encodingMethods[source]) {
    encodingMethods[source] = getStrategyFunctions(source);
  }

  const { getDownloadStream } = encodingMethods[source];
  try {
    const stream = await getDownloadStream(req, resolveDownloadPath(file));
    let buffer: Buffer | null = await getStream.buffer(stream);
    const content = buffer.toString('base64');
    buffer = null;

    return {
      file,
      content,
      metadata: {
        file_id: file.file_id,
        temp_file_id: file.temp_file_id,
        filepath: file.filepath,
        source: file.source,
        filename: file.filename,
        type: file.type,
      },
    };
  } catch (error) {
    if (isStorageNotFoundError(error)) {
      throw new AttachmentObjectNotFoundError(file.file_id);
    }
    throw error;
  }
}
