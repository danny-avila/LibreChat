import { useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { useAssignConversationToProjectMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import { enqueue } from '~/utils';

export const CONVERSATION_DRAG_TYPE = 'conversation-item';

/** One queue per conversation: drops onto different chats stay independent. */
const ASSIGN_QUEUE_PREFIX = 'assign-conversation:';

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
      const conversationId = item.conversationId;
      if (!conversationId || item.chatProjectId === projectId) {
        return;
      }
      /* A slow assignment leaves the row droppable, and every project target
       * owns its own mutation instance, so two quick drops would run
       * concurrently. The write is an unconditional update, so the request that
       * happens to reach the database last would decide the project regardless
       * of which drop came first. */
      void enqueue(`${ASSIGN_QUEUE_PREFIX}${conversationId}`, async () => {
        try {
          await assignConversation.mutateAsync({ conversationId, projectId });
          showToast({
            message: localize('com_ui_project_updated'),
            severity: NotificationSeverity.SUCCESS,
            showIcon: true,
          });
        } catch {
          showToast({
            message: localize('com_ui_project_update_error'),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        }
      });
    },
    [assignConversation, localize, showToast],
  );
};

/** Whether a hover should reorder yet. Rows only swap once the pointer crosses
 *  the hovered row's midpoint: without the threshold a shorter dragged row
 *  keeps re-entering the taller row it just displaced, and the list oscillates
 *  under a cursor that never moved. */
export const shouldSwapOnHover = ({
  dragIndex,
  hoverIndex,
  pointerY,
  hoverTop,
  hoverBottom,
}: {
  dragIndex: number;
  hoverIndex: number;
  pointerY: number;
  hoverTop: number;
  hoverBottom: number;
}): boolean => {
  if (dragIndex < 0 || hoverIndex < 0 || dragIndex === hoverIndex) {
    return false;
  }
  const middleY = (hoverBottom - hoverTop) / 2;
  const offsetY = pointerY - hoverTop;
  if (dragIndex < hoverIndex) {
    return offsetY >= middleY;
  }
  return offsetY <= middleY;
};

/** Rewrites only the slots the visible keys occupy in the stored order, so a
 *  reorder performed while a filter hides part of the list keeps every hidden
 *  key exactly where it was instead of dropping it. Visible keys the stored
 *  order does not know about append at the end. */
export const mergeVisibleOrder = (stored: string[], visible: string[]): string[] => {
  const visibleSet = new Set(visible);
  const merged: string[] = [];
  let next = 0;
  for (const key of stored) {
    if (!visibleSet.has(key)) {
      merged.push(key);
      continue;
    }
    if (next < visible.length) {
      merged.push(visible[next]);
      next++;
    }
  }
  for (; next < visible.length; next++) {
    merged.push(visible[next]);
  }
  return merged;
};
