import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';

/**
 * Hook for creating a new MCP server
 */
export const useCreateMcpServerMutation = (options?: {
  onMutate?: (variables: t.McpServerCreateParams) => void;
  onSuccess?: (
    data: t.MCPServerDBObjectResponse,
    variables: t.McpServerCreateParams,
    context: unknown,
  ) => void;
  onError?: (error: Error, variables: t.McpServerCreateParams, context: unknown) => void;
}): UseMutationResult<t.MCPServerDBObjectResponse, Error, t.McpServerCreateParams> => {
  const queryClient = useQueryClient();

  return useMutation((data: t.McpServerCreateParams) => dataService.createMcpServer(data), {
    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onSuccess: (newServer, variables, context) => {
      const listRes = queryClient.getQueryData<t.MCPServersListResponse>([QueryKeys.mcpServers]);
      if (listRes) {
        listRes[newServer.mcp_id!] = newServer;
        queryClient.setQueryData<t.MCPServersListResponse>([QueryKeys.mcpServers], {
          ...listRes,
        });
      }

      queryClient.invalidateQueries([QueryKeys.mcpServers]);
      queryClient.invalidateQueries([QueryKeys.loadedMcpServer]);
      queryClient.invalidateQueries([QueryKeys.mcpTools]);
      queryClient.invalidateQueries([QueryKeys.mcpAuthValues]);
      queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]);

      return options?.onSuccess?.(newServer, variables, context);
    },
  });
};

/**
 * Hook for updating an existing MCP server
 */
export const useUpdateMcpServerMutation = (options?: {
  onMutate?: (variables: { mcp_id: string; data: t.McpServerUpdateParams }) => void;
  onSuccess?: (
    data: t.MCPServerDBObjectResponse,
    variables: { mcp_id: string; data: t.McpServerUpdateParams },
    context: unknown,
  ) => void;
  onError?: (
    error: Error,
    variables: { mcp_id: string; data: t.McpServerUpdateParams },
    context: unknown,
  ) => void;
}): UseMutationResult<
  t.MCPServerDBObjectResponse,
  Error,
  { mcp_id: string; data: t.McpServerUpdateParams }
> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ mcp_id, data }: { mcp_id: string; data: t.McpServerUpdateParams }) =>
      dataService.updateMcpServer(mcp_id, data),
    {
      onMutate: (variables: { mcp_id: string; data: t.McpServerUpdateParams }) =>
        options?.onMutate?.(variables),
      onError: (
        error: Error,
        variables: { mcp_id: string; data: t.McpServerUpdateParams },
        context: unknown,
      ) => options?.onError?.(error, variables, context),
      onSuccess: (
        updatedServer: t.MCPServerDBObjectResponse,
        variables: { mcp_id: string; data: t.McpServerUpdateParams },
        context: unknown,
      ) => {
        // Update list cache
        const listRes = queryClient.getQueryData<t.MCPServersListResponse>([QueryKeys.mcpServers]);
        if (listRes) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { type, ...oldServer } = listRes[updatedServer.mcp_id!];
          listRes[updatedServer.mcp_id!] = { ...oldServer, ...updatedServer };

          queryClient.setQueryData<t.MCPServersListResponse>([QueryKeys.mcpServers], {
            ...listRes,
          });
        }

        queryClient.setQueryData([QueryKeys.mcpServer, variables.mcp_id], updatedServer);
        queryClient.invalidateQueries([QueryKeys.mcpServers]);
        queryClient.invalidateQueries([QueryKeys.loadedMcpServer]);
        queryClient.invalidateQueries([QueryKeys.mcpTools]);
        queryClient.invalidateQueries([QueryKeys.mcpAuthValues]);
        queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]);

        return options?.onSuccess?.(updatedServer, variables, context);
      },
    },
  );
};

/**
 * Hook for deleting an MCP server
 */
export const useDeleteMcpServerMutation = (options?: {
  onMutate?: (variables: string) => void;
  onSuccess?: (_data: { success: boolean }, variables: string, context: unknown) => void;
  onError?: (error: Error, variables: string, context: unknown) => void;
}): UseMutationResult<{ success: boolean }, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation((mcp_id: string) => dataService.deleteMcpServer(mcp_id), {
    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onSuccess: (_data, mcp_id, context) => {
      // Update list cache by removing the deleted server
      const listRes = queryClient.getQueryData<t.MCPServersListResponse>([QueryKeys.mcpServers]);
      if (listRes) {
        delete listRes[mcp_id];
        queryClient.setQueryData<t.MCPServersListResponse>([QueryKeys.mcpServers], {
          ...listRes,
        });
      }

      // Remove from specific server query cache
      queryClient.removeQueries([QueryKeys.mcpServer, mcp_id]);

      // Invalidate list query to ensure consistency
      queryClient.invalidateQueries([QueryKeys.mcpServers]);
      queryClient.invalidateQueries([QueryKeys.loadedMcpServer]);
      queryClient.invalidateQueries([QueryKeys.mcpTools]);
      queryClient.invalidateQueries([QueryKeys.mcpAuthValues]);
      queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]);

      return options?.onSuccess?.(_data, mcp_id, context);
    },
  });
};
