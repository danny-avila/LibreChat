import { useQuery, UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';

/**
 * Hook for listing MCP servers with pagination and search
 */
export const useMcpServersQuery = <TData = t.MCPServersListResponse>(
  config?: UseQueryOptions<t.MCPServersListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.MCPServersListResponse, unknown, TData>(
    [QueryKeys.mcpServers],
    () => dataService.getMcpServers(),
    {
      staleTime: 1000 * 60 * 5, // 5 minutes - data stays fresh longer
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

/**
 * Hook for getting a single MCP server by ID
 */
export const useMcpServerQuery = (
  mcp_id: string | null | undefined,
  config?: UseQueryOptions<t.MCPServerDBObjectResponse>,
): QueryObserverResult<t.MCPServerDBObjectResponse> => {
  return useQuery<t.MCPServerDBObjectResponse>(
    [QueryKeys.mcpServer, mcp_id],
    () => dataService.getMcpServer(mcp_id as string),
    {
      enabled: !!mcp_id && (config?.enabled ?? true),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};
