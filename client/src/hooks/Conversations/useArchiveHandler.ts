import { useParams, useNavigate } from 'react-router-dom';
import type { MouseEvent, FocusEvent, KeyboardEvent } from 'react';
import { useArchiveConversationMutation } from '~/data-provider';
import useConversations from './useConversations';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import useLocalize from '../useLocalize';
import useNewConvo from '../useNewConvo';

export default function useArchiveHandler(
  conversationId: string,
  shouldArchive: boolean,
  retainView: () => void,
) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const { newConversation } = useNewConvo();
  const { refreshConversations } = useConversations();
  const { conversationId: currentConvoId } = useParams();

  const archiveConvoMutation = useArchiveConversationMutation(conversationId);

  return async (e?: MouseEvent | FocusEvent | KeyboardEvent) => {
    if (e) {
      e.preventDefault();
    }
    const label = shouldArchive ? 'archive' : 'unarchive';
    archiveConvoMutation.mutate(
      { conversationId, isArchived: shouldArchive },
      {
        onSuccess: () => {
          if (currentConvoId === conversationId || currentConvoId === 'new') {
            newConversation();
            navigate('/c/new', { replace: true });
          }
          refreshConversations();
          retainView();
        },
        onError: () => {
          showToast({
            message: localize(`com_ui_${label}_error`),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      },
    );
  };
}
