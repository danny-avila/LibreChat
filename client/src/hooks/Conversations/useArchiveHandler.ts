import { useParams, useNavigate } from 'react-router-dom';
import type { MouseEvent, FocusEvent, KeyboardEvent } from 'react';
import { useArchiveConversationMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import useLocalize, { TranslationKeys } from '../useLocalize';
import useNewConvo from '../useNewConvo';

export default function useArchiveHandler(
  conversationId: string | null,
  shouldArchive: boolean,
  retainView: () => void,
) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const { newConversation } = useNewConvo();
  const { conversationId: currentConvoId } = useParams();

  const archiveConvoMutation = useArchiveConversationMutation(conversationId ?? '');

  return async (e?: MouseEvent | FocusEvent | KeyboardEvent) => {
    if (e) {
      e.preventDefault();
    }
    const convoId = conversationId ?? '';
    if (!convoId) {
      return;
    }
    const label: TranslationKeys = shouldArchive ? 'com_ui_archive_error' : 'com_ui_unarchive_error';
    archiveConvoMutation.mutate(
      { conversationId: convoId, isArchived: shouldArchive },
      {
        onSuccess: () => {
          if (currentConvoId === convoId || currentConvoId === 'new') {
            newConversation();
            navigate('/c/new', { replace: true });
          }
          retainView();
        },
        onError: () => {
          showToast({
            message: localize(label),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      },
    );
  };
}
