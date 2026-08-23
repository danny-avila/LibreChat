import { useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TConversation } from 'librechat-data-provider';
import { getPendingAssignment } from '~/data-provider/Projects/mutations';
import { useAssignConversationToProjectMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

export const CONVERSATION_DRAG_TYPE = 'conversation-item';

/** Which kind of target the pointer was over most recently.
 *
 *  `monitor.didDrop()` alone cannot tell a reorder from a filing action that
 *  was refused: dropping a chat on the project it already belongs to is
 *  rejected, so no target handles it and the drop looks exactly like one that
 *  landed inside the pinned list, even though the rows it crossed on the way
 *  moved only incidentally. Tracking who was last under the pointer also allows
 *  for a drag that strays over a project and comes back to reorder after all. */
let lastHoverWasExternal = false;

/** Called by the pinned rows, whose hover is what reorders the list. */
export const markPinnedHover = (): void => {
  lastHoverWasExternal = false;
};

/** Called by the project rows and the Chats section, accepted or refused. */
export const markExternalHover = (): void => {
  lastHoverWasExternal = true;
};

export const beginPinnedDrag = (): void => {
  lastHoverWasExternal = false;
};

export const endedOverExternalTarget = (): boolean => lastHoverWasExternal;

export type ConversationDragItem = {
  conversationId: string;
  chatProjectId: string | null;
  pinned: boolean;
};

/**
 * The project a conversation belongs to for the purpose of accepting a drop.
 *
 * A drag item carries whatever the list that rendered its row believed, which
 * goes stale the moment an assignment is accepted, and the same conversation
 * can be rendered by several lists that refresh independently. So the pending
 * write wins if there is one, then the conversation cache the mutation writes
 * synchronously on success, and only then the row's own value.
 */
export const useEffectiveProjectId = () => {
  const queryClient = useQueryClient();
  return useCallback(
    (item: ConversationDragItem): string | null => {
      if (!item.conversationId) {
        return item.chatProjectId;
      }
      const pending = getPendingAssignment(item.conversationId);
      if (pending) {
        return pending.projectId;
      }
      const cached = queryClient.getQueryData<TConversation>([
        QueryKeys.conversation,
        item.conversationId,
      ]);
      /* A cache miss falls through to the row, but a cached `null` is a real
       * answer: it means the chat was confirmed out of every project. */
      if (cached) {
        return cached.chatProjectId ?? null;
      }
      return item.chatProjectId;
    },
    [queryClient],
  );
};

/** Files a dragged conversation into a project, or back into the root chats
 *  list on `projectId: null`. The mutation owns every cache invalidation
 *  (chats, pinned rows, project stats); this adds the toast feedback the
 *  options-menu path already shows for the same action. */
export const useAssignDroppedConversation = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const assignConversation = useAssignConversationToProjectMutation();
  const effectiveProjectId = useEffectiveProjectId();

  return useCallback(
    (item: ConversationDragItem, projectId: string | null) => {
      const conversationId = item.conversationId;
      if (!conversationId || effectiveProjectId(item) === projectId) {
        return;
      }
      /* The mutation serializes these per conversation and records where each
       * is headed, so this only has to report the outcome. */
      void assignConversation.mutateAsync({ conversationId, projectId }).then(
        () =>
          showToast({
            message: localize('com_ui_project_updated'),
            severity: NotificationSeverity.SUCCESS,
            showIcon: true,
          }),
        () =>
          showToast({
            message: localize('com_ui_project_update_error'),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          }),
      );
    },
    [assignConversation, effectiveProjectId, localize, showToast],
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
