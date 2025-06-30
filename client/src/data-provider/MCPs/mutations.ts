import { dataService, QueryKeys } from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useCreateMCPMutation = (
  options?: t.CreateMCPMutationOptions,
): UseMutationResult<t.MCP, Error, t.MCP> => {
  const queryClient = useQueryClient();

  return useMutation(
    (mcp: t.MCP) => {
      return dataService.createMCP(mcp);
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (data, variables, context) => {
        queryClient.setQueryData<t.MCP[]>([QueryKeys.mcpServers], (prev) => {
          return prev ? [...prev, data] : [data];
        });

        return options?.onSuccess?.(data, variables, context);
      },
    },
  );
};

export const useUpdateMCPMutation = (
  options?: t.UpdateMCPMutationOptions,
): UseMutationResult<t.MCP, Error, { mcp_id: string; data: t.MCP }> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ mcp_id, data }: { mcp_id: string; data: t.MCP }) => {
      return dataService.updateMCP({ mcp_id, data });
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (data, variables, context) => {
        queryClient.setQueryData<t.MCP[]>([QueryKeys.mcpServers], (prev) => {
          if (!prev) return prev;
          return prev.map((mcp) => (mcp.mcp_id === variables.mcp_id ? data : mcp));
        });
        return options?.onSuccess?.(data, variables, context);
      },
    },
  );
};

export const useDeleteMCPMutation = (
  options?: t.DeleteMCPMutationOptions,
): UseMutationResult<Record<string, unknown>, Error, { mcp_id: string }> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ mcp_id }: { mcp_id: string }) => {
      return dataService.deleteMCP({ mcp_id });
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (data, variables, context) => {
        queryClient.setQueryData<t.MCP[]>([QueryKeys.mcpServers], (prev) => {
          if (!prev) return prev;
          return prev.filter((mcp) => mcp.mcp_id !== variables.mcp_id);
        });
        return options?.onSuccess?.(data, variables, context);
      },
    },
  );
};
