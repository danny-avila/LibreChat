import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TArchiveConversationRequest } from 'librechat-data-provider';
import { useArchiveConvoMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import useLocalize from '~/hooks/useLocalize';

export default function useArchiveConvo() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const mutation = useArchiveConvoMutation({
    onSuccess: (_, variables) => {
      const isArchived = variables.isArchived === true;
      const action = isArchived ? 'archive' : 'unarchive';
      queryClient.invalidateQueries(['conversations']);
      showToast({
        message: localize(`com_ui_${action}_success`),
        severity: NotificationSeverity.SUCCESS,
        showIcon: true,
      });
    },
    onError: (_, variables) => {
      const isArchived = variables.isArchived === true;
      const action = isArchived ? 'archive' : 'unarchive';
      showToast({
        message: localize(`com_ui_${action}_error`),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });

  const archiveConvoMutation = useMutation(
    ({ conversationId, isArchived }: TArchiveConversationRequest) => {
      return mutation.mutateAsync({ conversationId, isArchived });
    },
  );

  const archiveConversation = (conversationId: string, isArchived: boolean) => {
    archiveConvoMutation.mutate({ conversationId, isArchived });
  };

  return { archiveConversation, isArchiving: archiveConvoMutation.isLoading };
}
