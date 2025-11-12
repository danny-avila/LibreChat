import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys, Constants } from 'librechat-data-provider';
import type { UseMutationResult, UseMutationOptions } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

type EditArtifactContext = {
  previousMessages: Record<string, t.TMessage[] | undefined>;
  updatedConversationId: string | null;
};

export const useEditArtifact = (
  _options?: t.EditArtifactOptions,
): UseMutationResult<
  t.TEditArtifactResponse,
  Error,
  t.TEditArtifactRequest,
  EditArtifactContext
> => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, onMutate: userOnMutate, ...options } = _options ?? {};

  const mutationOptions: UseMutationOptions<
    t.TEditArtifactResponse,
    Error,
    t.TEditArtifactRequest,
    EditArtifactContext
  > = {
    mutationFn: (variables: t.TEditArtifactRequest) => dataService.editArtifact(variables),
    /**
     * onMutate: No optimistic updates for artifact editing
     * The code editor shows changes instantly via local Sandpack state
     * Optimistic updates cause "original content not found" errors because:
     * 1. First edit optimistically updates cache
     * 2. Artifact.content reflects the updated cache
     * 3. Next edit sends updated content as "original" → doesn't match DB → error
     */
    onMutate: async (vars) => {
      // Call user's onMutate if provided
      if (userOnMutate) {
        await userOnMutate(vars);
      }
      return { previousMessages: {}, updatedConversationId: null };
    },
    onError: (error, vars, context) => {
      onError?.(error, vars, context);
    },
    /**
     * On success: Update with server response to ensure consistency
     */
    onSuccess: (data, vars, context) => {
      let targetNotFound = true;
      const setMessageData = (conversationId?: string | null) => {
        if (!conversationId) {
          return;
        }
        queryClient.setQueryData<t.TMessage[]>([QueryKeys.messages, conversationId], (prev) => {
          if (!prev) {
            return prev;
          }

          const newArray = [...prev];
          let targetIndex: number | undefined;

          for (let i = newArray.length - 1; i >= 0; i--) {
            if (newArray[i].messageId === vars.messageId) {
              targetIndex = i;
              targetNotFound = false;
              break;
            }
          }

          if (targetIndex == null) {
            return prev;
          }

          newArray[targetIndex] = {
            ...newArray[targetIndex],
            content: data.content,
            text: data.text,
          };

          return newArray;
        });
      };
      setMessageData(data.conversationId);
      if (targetNotFound) {
        console.warn(
          'Edited Artifact Message not found in cache, trying `new` as `conversationId`',
        );
        setMessageData(Constants.NEW_CONVO as string);
      }

      onSuccess?.(data, vars, context);
    },
    ...options,
  };

  return useMutation(mutationOptions);
};
