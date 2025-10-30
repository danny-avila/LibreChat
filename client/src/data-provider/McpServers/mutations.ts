import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';

/**
 * Hook for creating a new MCP server
 */
export const useCreateMcpServerMutation = (options?: {
  onMutate?: (variables: t.McpServerCreateParams) => void;
  onSuccess?: (data: t.McpServer, variables: t.McpServerCreateParams, context: unknown) => void;
  onError?: (error: Error, variables: t.McpServerCreateParams, context: unknown) => void;
}): UseMutationResult<t.McpServer, Error, t.McpServerCreateParams> => {
  const queryClient = useQueryClient();

  return useMutation((data: t.McpServerCreateParams) => dataService.createMcpServer(data), {
    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onSuccess: (newServer, variables, context) => {
      const listRes = queryClient.getQueryData<t.McpServerListResponse>([QueryKeys.mcpServers]);
      if (listRes) {
        const currentServers = [newServer, ...JSON.parse(JSON.stringify(listRes.data))];
        queryClient.setQueryData<t.McpServerListResponse>([QueryKeys.mcpServers], {
          ...listRes,
          data: currentServers,
        });
      }

      queryClient.invalidateQueries([QueryKeys.mcpServers]);

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
    data: t.McpServer,
    variables: { mcp_id: string; data: t.McpServerUpdateParams },
    context: unknown,
  ) => void;
  onError?: (
    error: Error,
    variables: { mcp_id: string; data: t.McpServerUpdateParams },
    context: unknown,
  ) => void;
}): UseMutationResult<t.McpServer, Error, { mcp_id: string; data: t.McpServerUpdateParams }> => {
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
        updatedServer: t.McpServer,
        variables: { mcp_id: string; data: t.McpServerUpdateParams },
        context: unknown,
      ) => {
        // Update list cache
        const listRes = queryClient.getQueryData<t.McpServerListResponse>([QueryKeys.mcpServers]);
        if (listRes) {
          queryClient.setQueryData<t.McpServerListResponse>([QueryKeys.mcpServers], {
            ...listRes,
            data: listRes.data.map((server) => {
              if (server.mcp_id === variables.mcp_id) {
                return updatedServer;
              }
              return server;
            }),
          });
        }

        queryClient.setQueryData([QueryKeys.mcpServer, variables.mcp_id], updatedServer);
        queryClient.invalidateQueries([QueryKeys.mcpServers]);

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
      const listRes = queryClient.getQueryData<t.McpServerListResponse>([QueryKeys.mcpServers]);
      if (listRes) {
        const updatedData = listRes.data.filter((server) => server.mcp_id !== mcp_id);
        queryClient.setQueryData<t.McpServerListResponse>([QueryKeys.mcpServers], {
          ...listRes,
          data: updatedData,
        });
      }

      // Remove from specific server query cache
      queryClient.removeQueries([QueryKeys.mcpServer, mcp_id]);

      // Invalidate list query to ensure consistency
      queryClient.invalidateQueries([QueryKeys.mcpServers]);

      return options?.onSuccess?.(_data, mcp_id, context);
    },
  });
};
