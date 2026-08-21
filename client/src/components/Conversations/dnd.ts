import { useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { useAssignConversationToProjectMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

export const CONVERSATION_DRAG_TYPE = 'conversation-item';

export type ConversationDragItem = {
  conversationId: string;
  chatProjectId: string | null;
  pinned: boolean;
};

/** Files a dragged conversation into a project, or back into the root chats
 *  list on `projectId: null`. The mutation owns every cache invalidation
 *  (chats, pinned rows, project stats); this adds the toast feedback the
 *  options-menu path already shows for the same action. */
export const useAssignDroppedConversation = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const assignConversation = useAssignConversationToProjectMutation();

  return useCallback(
    (item: ConversationDragItem, projectId: string | null) => {
      if (!item.conversationId || item.chatProjectId === projectId) {
        return;
      }
      assignConversation.mutate(
        { conversationId: item.conversationId, projectId },
        {
          onSuccess: () => {
            showToast({
              message: localize('com_ui_project_updated'),
              severity: NotificationSeverity.SUCCESS,
              showIcon: true,
            });
          },
          onError: () => {
            showToast({
              message: localize('com_ui_project_update_error'),
              severity: NotificationSeverity.ERROR,
              showIcon: true,
            });
          },
        },
      );
    },
    [assignConversation, localize, showToast],
  );
};
