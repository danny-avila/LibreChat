/**
 * Dedicated queries for MCP (Model Context Protocol) tools
 * Decoupled from regular LibreChat tools
 */
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type { MCPServersResponse } from 'librechat-data-provider';

/**
 * Hook for fetching MCP-specific tools
 * @param config - React Query configuration
 * @returns MCP servers with their tools
 */
export const useMCPToolsQuery = <TData = MCPServersResponse>(
  config?: UseQueryOptions<MCPServersResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<MCPServersResponse, unknown, TData>(
    [QueryKeys.mcpTools],
    () => dataService.getMCPTools(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      ...config,
    },
  );
};
