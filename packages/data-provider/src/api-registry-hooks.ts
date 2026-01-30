import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as dataService from './data-service';
import type {
  APIRegistryCreateParams,
  APIRegistryUpdateParams,
  OpenAPIParseResult,
} from './types/apiRegistry';

/**
 * Parse OpenAPI spec from URL
 */
export const useParseOpenAPISpec = () => {
  return useMutation({
    mutationFn: async ({ swaggerUrl }: { swaggerUrl: string }) => {
      return dataService.parseOpenAPISpec(swaggerUrl);
    },
  });
};

/**
 * Get all API registries for current user
 */
export const useGetAPIRegistries = () => {
  return useQuery({
    queryKey: ['apiRegistries'],
    queryFn: () => dataService.getAPIRegistries(),
  });
};

/**
 * Get single API registry by server name
 */
export const useGetAPIRegistry = (serverName: string) => {
  return useQuery({
    queryKey: ['apiRegistry', serverName],
    queryFn: () => dataService.getAPIRegistry(serverName),
    enabled: !!serverName,
  });
};

/**
 * Create new API registry
 */
export const useCreateAPIRegistry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: APIRegistryCreateParams & { selectedEndpoints: string[] }) => {
      return dataService.createAPIRegistry(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiRegistries'] });
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
    },
  });
};

/**
 * Update API registry
 */
export const useUpdateAPIRegistry = (serverName: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: APIRegistryUpdateParams) => {
      return dataService.updateAPIRegistry(serverName, params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiRegistries'] });
      queryClient.invalidateQueries({ queryKey: ['apiRegistry', serverName] });
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
    },
  });
};

/**
 * Delete API registry
 */
export const useDeleteAPIRegistry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (serverName: string) => {
      return dataService.deleteAPIRegistry(serverName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiRegistries'] });
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
    },
  });
};

/**
 * Get tools generated from API registry
 */
export const useGetAPITools = (serverName: string) => {
  return useQuery({
    queryKey: ['apiTools', serverName],
    queryFn: () => dataService.getAPITools(serverName),
    enabled: !!serverName,
  });
};