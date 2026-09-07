import getStream from 'get-stream';
import { Providers } from '@librechat/agents';
import {
  FileSources,
  mergeFileConfig,
  isExplicitMimeConfig,
  getEndpointFileConfig,
} from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest, StrategyFunctions, ProcessedFile } from '~/types';
import { resolveDownloadPath } from '~/storage/path';

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
 * Whether the admin explicitly allowed `mimeType` for this endpoint via
 * `fileConfig.endpoints.<name>.supportedMimeTypes`. The inherited default list does
 * not count as opting in, mirroring the client's picker and drag-drop logic, so an
 * OpenAI-compatible endpoint only receives video/audio parts when configured for them.
 * @param req - The server request object containing config
 * @param params - Object containing provider and optional endpoint
 * @param params.provider - The provider to look up
 * @param params.endpoint - Optional endpoint name for lookup
 * @param mimeType - The MIME type of the file being attached
 * @returns True when the endpoint config explicitly matches the MIME type
 */
export const isConfiguredProviderMediaType = (
  req: ServerRequest,
  params: {
    provider: Providers;
    endpoint?: string;
  },
  mimeType: string,
): boolean => {
  if (!req.config?.fileConfig) {
    return false;
  }
  const { provider, endpoint } = params;
  const fileConfig = mergeFileConfig(req.config.fileConfig);
  const endpointConfig = getEndpointFileConfig({
    fileConfig,
    endpoint: endpoint ?? provider,
  });
  const types = endpointConfig?.supportedMimeTypes;
  if (!isExplicitMimeConfig(types)) {
    return false;
  }
  return fileConfig.checkType?.(mimeType, types) ?? false;
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
}
