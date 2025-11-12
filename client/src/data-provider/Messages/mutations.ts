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
     * Optimistic update: Update UI immediately before server responds
     */
    onMutate: async (vars) => {
      const conversationIds: string[] = [Constants.NEW_CONVO as string];

      // Get all conversation query keys to find the right one
      const queries = queryClient.getQueriesData<t.TMessage[]>({ queryKey: [QueryKeys.messages] });
      for (const [queryKey] of queries) {
        const conversationId = queryKey[1];
        if (
          conversationId &&
          typeof conversationId === 'string' &&
          conversationId !== (Constants.NEW_CONVO as string)
        ) {
          conversationIds.push(conversationId);
        }
      }

      const previousMessages: Record<string, t.TMessage[] | undefined> = {};
      let updatedConversationId: string | null = null;

      // Optimistically update each potential conversation
      for (const conversationId of conversationIds) {
        await queryClient.cancelQueries({ queryKey: [QueryKeys.messages, conversationId] });

        const previous = queryClient.getQueryData<t.TMessage[]>([
          QueryKeys.messages,
          conversationId,
        ]);
        previousMessages[conversationId] = previous;

        if (previous) {
          const newArray = [...previous];
          const targetIndex = newArray.findIndex((msg) => msg.messageId === vars.messageId);

          if (targetIndex !== -1) {
            updatedConversationId = conversationId;
            // Optimistically update with the new content
            // We'll do a simple string replacement in the artifact
            const message = newArray[targetIndex];
            let updatedContent = message.content;
            let updatedText = message.text;

            // Replace the old content with new content
            if (updatedContent && Array.isArray(updatedContent)) {
              updatedContent = updatedContent.map((part) => {
                // Only update parts that have a text field (TEXT and ERROR types)
                if (
                  (part.type === 'text' || part.type === 'error') &&
                  'text' in part &&
                  typeof part.text === 'string'
                ) {
                  return {
                    ...part,
                    text: part.text.replace(vars.original, vars.updated),
                  };
                }
                return part;
              });
            }
            if (updatedText) {
              updatedText = updatedText.replace(vars.original, vars.updated);
            }

            newArray[targetIndex] = {
              ...message,
              content: updatedContent,
              text: updatedText,
            };

            queryClient.setQueryData([QueryKeys.messages, conversationId], newArray);
          }
        }
      }

      // Call user's onMutate if provided
      if (userOnMutate) {
        await userOnMutate(vars);
      }

      return { previousMessages, updatedConversationId };
    },
    /**
     * On error: Rollback to previous state
     */
    onError: (error, vars, context) => {
      if (context?.previousMessages) {
        for (const [conversationId, messages] of Object.entries(context.previousMessages)) {
          if (messages) {
            queryClient.setQueryData([QueryKeys.messages, conversationId], messages);
          }
        }
      }
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
