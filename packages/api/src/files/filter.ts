import { Providers } from '@librechat/agents';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';

/**
 * Filters out files if the endpoint/provider has file uploads disabled
 * @param req - The server request object containing config
 * @param files - Array of processed file documents from MongoDB
 * @param provider - The provider/endpoint to check configuration for
 * @returns Filtered array of files (empty if disabled)
 */
export function filterFilesByEndpointConfig(
  req: ServerRequest,
  files: IMongoFile[] | undefined,
  provider: Providers | string,
): IMongoFile[] {
  if (!files || files.length === 0) {
    return [];
  }

  if (!req.config?.fileConfig?.endpoints) {
    return files;
  }

  const endpoints = req.config.fileConfig.endpoints;

  /** Check provider-specific config first, then fall back to default */
  const providerConfig = endpoints[provider];
  const defaultConfig = endpoints.default;

  /** Use provider config if it exists, otherwise use default */
  const endpointConfig = providerConfig ?? defaultConfig;

  /**
   * If endpoint has files explicitly disabled, filter out all files
   * Only filter if disabled is explicitly set to true
   */
  if (endpointConfig?.disabled === true) {
    return [];
  }

  return files;
}
