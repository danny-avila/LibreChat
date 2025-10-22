import { dataService, QueryKeys, Tools } from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseMutationOptions } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useToolCallMutation = <T extends t.ToolId>(
  toolId: T,
  options?: UseMutationOptions<t.ToolCallResponse, Error, t.ToolParams<T>, unknown>,
): UseMutationResult<t.ToolCallResponse, Error, t.ToolParams<T>> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (toolParams: t.ToolParams<T>) => {
      return dataService.callTool({
        toolId,
        toolParams,
      });
    },
    onSuccess: (response, variables, onMutateResult, context) => {
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
      return options?.onSuccess?.(response, variables, onMutateResult, context);
    },
    ...options,
  });
};
