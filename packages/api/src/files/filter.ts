import { getEndpointFileConfig, mergeFileConfig, fileConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';

/**
 * Checks if a MIME type is supported by the endpoint configuration
 * @param mimeType - The MIME type to check
 * @param supportedMimeTypes - Array of RegExp patterns to match against
 * @returns True if the MIME type matches any pattern
 */
function isMimeTypeSupported(mimeType: string, supportedMimeTypes?: RegExp[]): boolean {
  if (!supportedMimeTypes || supportedMimeTypes.length === 0) {
    return true;
  }
  return fileConfig.checkType(mimeType, supportedMimeTypes);
}

/**
 * Filters out files based on endpoint configuration including:
 * - Disabled status
 * - File size limits
 * - MIME type restrictions
 * - Total size limits
 * @param req - The server request object containing config
 * @param params - Object containing files, endpoint, and endpointType
 * @param params.files - Array of processed file documents from MongoDB
 * @param params.endpoint - The endpoint name to check configuration for
 * @param params.endpointType - The endpoint type to check configuration for
 * @returns Filtered array of files
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

  const mergedFileConfig = mergeFileConfig(req.config?.fileConfig);
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig: mergedFileConfig,
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

  const { fileSizeLimit, supportedMimeTypes, totalSizeLimit } = endpointFileConfig;

  /** Filter files based on individual file size and MIME type */
  let filteredFiles = files;

  /** Filter by individual file size limit */
  if (fileSizeLimit !== undefined && fileSizeLimit > 0) {
    filteredFiles = filteredFiles.filter((file) => {
      return file.bytes <= fileSizeLimit;
    });
  }

  /** Filter by MIME type */
  if (supportedMimeTypes && supportedMimeTypes.length > 0) {
    filteredFiles = filteredFiles.filter((file) => {
      return isMimeTypeSupported(file.type, supportedMimeTypes);
    });
  }

  /** Filter by total size limit - keep files until total exceeds limit */
  if (totalSizeLimit !== undefined && totalSizeLimit > 0) {
    let totalSize = 0;
    const withinTotalLimit: IMongoFile[] = [];

    for (let i = 0; i < filteredFiles.length; i++) {
      const file = filteredFiles[i];
      if (totalSize + file.bytes <= totalSizeLimit) {
        withinTotalLimit.push(file);
        totalSize += file.bytes;
      }
    }

    filteredFiles = withinTotalLimit;
  }

  return filteredFiles;
}
