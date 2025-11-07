import { getEndpointFileConfig, mergeFileConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';

/**
 * Filters out files if the endpoint/provider has file uploads disabled
 * @param req - The server request object containing config
 * @param params - Object containing files, endpoint, and endpointType
 * @param params.files - Array of processed file documents from MongoDB
 * @param params.endpoint - The endpoint name to check configuration for
 * @param params.endpointType - The endpoint type to check configuration for
 * @returns Filtered array of files (empty if disabled)
 */
export function filterFilesByEndpointConfig(
  req: ServerRequest,
  params: {
    files: IMongoFile[] | undefined;
    endpoint?: string | null;
    endpointType?: string | null;
  },
): IMongoFile[] {
  const { files, endpoint, endpointType } = params;

  if (!files || files.length === 0) {
    return [];
  }

  const fileConfig = mergeFileConfig(req.config?.fileConfig);
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig,
    endpoint,
    endpointType,
  });

  /**
   * If endpoint has files explicitly disabled, filter out all files
   * Only filter if disabled is explicitly set to true
   */
  if (endpointFileConfig?.disabled === true) {
    return [];
  }

  return files;
}
