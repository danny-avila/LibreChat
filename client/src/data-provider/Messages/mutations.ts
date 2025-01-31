import { dataService, QueryKeys } from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

export const useEditArtifact = (
  _options?: t.EditArtifactOptions,
): UseMutationResult<t.TEditArtifactResponse, Error, t.TEditArtifactRequest> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...options } = _options ?? {};
  return useMutation({
    mutationFn: (variables: t.TEditArtifactRequest) => dataService.editArtifact(variables),
    onSuccess: (data, vars, context) => {
      queryClient.setQueryData<t.TMessage[]>([QueryKeys.messages, data.conversationId], (prev) => {
        if (!prev) {
          return prev;
        }

        const newArray = [...prev];
        let targetIndex: number | undefined;

        for (let i = newArray.length - 1; i >= 0; i--) {
          if (newArray[i].messageId === vars.messageId) {
            targetIndex = i;
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

      onSuccess?.(data, vars, context);
    },
    ...options,
  });
};
