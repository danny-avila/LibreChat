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

/**
 * Interface for creating a new tool
 */
interface CreateToolData {
  name: string;
  description: string;
  type: 'function' | 'code_interpreter' | 'file_search';
  metadata?: Record<string, unknown>;
}

/**
 * Mutation hook for adding a new tool to the system
 * Note: Requires corresponding backend implementation of dataService.createTool
 */
export const useAddToolMutation = (
  //   options?:
  //   {
  //     onMutate?: (variables: CreateToolData) => void | Promise<unknown>;
  //     onError?: (error: Error, variables: CreateToolData, context: unknown) => void;
  //     onSuccess?: (data: t.Tool, variables: CreateToolData, context: unknown) => void;
  // }
  options?: t.MutationOptions<Record<string, unknown>, CreateToolData>,
): UseMutationResult<Record<string, unknown>, Error, CreateToolData> => {
  const queryClient = useQueryClient();

  return useMutation(
    (toolData: CreateToolData) => {
      return dataService.createTool(toolData);
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
