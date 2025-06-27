import { dataService, QueryKeys, Tools } from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useToolCallMutation = <T extends t.ToolId>(
  toolId: T,
  options?: t.ToolCallMutationOptions<T>,
): UseMutationResult<t.ToolCallResponse, Error, t.ToolParams<T>> => {
  const queryClient = useQueryClient();
  return useMutation(
    (toolParams: t.ToolParams<T>) => {
      return dataService.callTool({
        toolId,
        toolParams,
      });
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (response, variables, context) => {
        queryClient.setQueryData<t.ToolCallResults>(
          [QueryKeys.toolCalls, variables.conversationId],
          (prev) => [
            ...(prev ?? []),
            {
              user: '',
              toolId: Tools.execute_code,
              partIndex: variables.partIndex,
              messageId: variables.messageId,
              blockIndex: variables.blockIndex,
              conversationId: variables.conversationId,
              result: response.result,
              attachments: response.attachments,
            },
          ],
        );
        return options?.onSuccess?.(response, variables, context);
      },
    },
  );
};

export const useCreateMCPMutation = (
  options?: t.CreateMCPMutationOptions,
): UseMutationResult<Record<string, unknown>, Error, t.MCP> => {
  const queryClient = useQueryClient();

  return useMutation(
    (mcp: t.MCP) => {
      return dataService.createMCP(mcp);
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (data, variables, context) => {
        // Invalidate tools list to trigger refetch
        queryClient.invalidateQueries([QueryKeys.tools]);
        // queryClient.invalidateQueries([QueryKeys.mcpTools]);
        return options?.onSuccess?.(data, variables, context);
      },
    },
  );
};

export const useUpdateMCPMutation = (
  options?: t.UpdateMCPMutationOptions,
): UseMutationResult<Record<string, unknown>, Error, { mcp_id: string; data: t.MCP }> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ mcp_id, data }: { mcp_id: string; data: t.MCP }) => {
      return dataService.updateMCP({ mcp_id, data });
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (data, variables, context) => {
        // Invalidate tools list to trigger refetch
        queryClient.invalidateQueries([QueryKeys.tools]);
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
        // Invalidate tools list to trigger refetch
        queryClient.invalidateQueries([QueryKeys.tools]);
        return options?.onSuccess?.(data, variables, context);
      },
    },
  );
};
