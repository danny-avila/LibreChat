import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';

import type { MouseEvent } from 'react';

import useNewConvo from '~/hooks/useNewConvo';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

export type UseNewChatParams = {
  index?: number;
  /**
   * Runs once the conversation has been reset. The sidebar uses it to switch
   * back to the conversations panel; callers outside `ActivePanelProvider`
   * (the chat header, keyboard shortcuts) omit it.
   */
  onNewChat?: () => void;
};

export type UseNewChatResult = {
  startNewChat: () => void;
  /** For an `<a href="/c/new">` trigger, so modified clicks still open a tab. */
  handleNewChatClick: (event: MouseEvent<HTMLElement>) => void;
  newConversation: ReturnType<typeof useNewConvo>['newConversation'];
};

/**
 * Single source of truth for starting a new conversation: drops the cached
 * messages for the outgoing conversation, invalidates the messages query, then
 * resets the conversation atom.
 */
export default function useNewChat({
  index = 0,
  onNewChat,
}: UseNewChatParams = {}): UseNewChatResult {
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo(index);
  const conversationId = useRecoilValue(store.conversationIdByIndex(index));

  const startNewChat = useCallback(() => {
    clearMessagesCache(queryClient, conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
    onNewChat?.();
  }, [queryClient, conversationId, newConversation, onNewChat]);

  const handleNewChatClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      startNewChat();
    },
    [startNewChat],
  );

  return { startNewChat, handleNewChatClick, newConversation };
}
