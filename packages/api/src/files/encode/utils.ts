import getStream from 'get-stream';
import { Providers } from '@librechat/agents';
import { FileSources, mergeFileConfig, getEndpointFileConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest, StrategyFunctions, ProcessedFile } from '~/types';

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
  const stream = await getDownloadStream(req, file.filepath);
  const buffer = await getStream.buffer(stream);

  return {
    file,
    content: buffer.toString('base64'),
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
