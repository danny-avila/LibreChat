import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useNewConvo } from '~/hooks';
import { logger } from '~/utils';
import store from '~/store';

/**
 * Hook to detect and handle back navigation to /c/new
 * This solves the issue where navigating back to new chat doesn't properly reset state
 */
export default function useBackToNewChat(index = 0) {
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo(index);
  const { conversation } = store.useCreateConversationAtom(index);

  // Listen for popstate events (back/forward button navigation)
  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname;
      if (currentPath === '/c/new' && conversation?.conversationId !== Constants.NEW_CONVO) {
        logger.log('conversation', 'Back navigation to /c/new detected, resetting state');

        // Clear messages
        queryClient.setQueryData<TMessage[]>(
          [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
          [],
        );
        queryClient.invalidateQueries([QueryKeys.messages]);

        // Reset conversation
        newConversation();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [conversation?.conversationId, queryClient, newConversation]);
}
