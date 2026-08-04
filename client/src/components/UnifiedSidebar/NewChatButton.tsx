import { memo, useCallback } from 'react';
import { SquarePen } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { DEFAULT_PANEL, useActivePanel } from '~/Providers';
import { useLocalize, useNewConvo } from '~/hooks';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

/**
 * Extracted from `ExpandedPanel`'s inline `NewChatButton` — that one lives in the icon rail,
 * which the exode embed hides entirely (see `Sidebar.tsx`). The embed still needs a way to start
 * a new conversation, so this renders the same control inline above the conversation list.
 */
const NewChatButton = memo(function NewChatButton() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const switchToHistory = useRecoilValue(store.newChatSwitchToHistory);
  const { setActive } = useActivePanel();
  const tooltipDescription = useShortcutHint('newChat', localize('com_ui_new_chat'));
  const ariaKey = useShortcutAriaKey('newChat');

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        clearMessagesCache(queryClient, conversation?.conversationId);
        queryClient.invalidateQueries([QueryKeys.messages]);
        newConversation();
        if (switchToHistory) {
          setActive(DEFAULT_PANEL);
        }
      }
    },
    [queryClient, conversation?.conversationId, newConversation, switchToHistory, setActive],
  );

  return (
    <a
      href="/c/new"
      data-testid="new-chat-button"
      aria-label={localize('com_ui_new_chat')}
      aria-keyshortcuts={ariaKey}
      title={tooltipDescription}
      className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-border-light px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
      onClick={handleClick}
    >
      <SquarePen className="h-4 w-4" aria-hidden="true" />
      {localize('com_ui_new_chat')}
    </a>
  );
});

export default NewChatButton;
