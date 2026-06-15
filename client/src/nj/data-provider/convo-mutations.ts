import { dataService, MutationKeys } from 'librechat-data-provider';
import { useMutation, UseMutationResult, useQueryClient } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import { updateConvoInAllQueries } from '~/utils';

export const usePinConversationMutation = (
  options?: t.PinConversationOptions,
): UseMutationResult<t.TPinConversationResponse, unknown, t.TPinConversationRequest, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, ..._options } = options || {};

  return useMutation(
    [MutationKeys.convoPin],
    (payload: t.TPinConversationRequest) => dataService.pinConversation(payload),
    {
      onSuccess: (data, vars, context) => {
        updateConvoInAllQueries(queryClient, vars.conversationId, () => data);
        onSuccess?.(data, vars, context);
      },
      onError,
      ..._options,
    },
  );
};
