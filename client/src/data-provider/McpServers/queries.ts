import { useQuery, UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';

/**
 * Default parameters for MCP server list queries
 */
export const defaultMcpServerParams: { limit?: number; search?: string } = {
  limit: 10,
};

/**
 * Hook for listing MCP servers with pagination and search
 */
export const useMcpServersQuery = <TData = t.McpServerListResponse>(
  params?: { limit?: number; search?: string },
  config?: UseQueryOptions<t.McpServerListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.McpServerListResponse, unknown, TData>(
    [QueryKeys.mcpServers, params],
    () => dataService.getMcpServers(params),
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
  config?: UseQueryOptions<t.McpServer>,
): QueryObserverResult<t.McpServer> => {
  return useQuery<t.McpServer>(
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
