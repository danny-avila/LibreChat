import { useEffect, useRef } from 'react';
import { useResetRecoilState } from 'recoil';
import { logger } from '~/utils';
import store from '~/store';

/**
 * Hook to reset artifacts when the conversation ID changes
 * @param conversationId - The current conversation ID
 */
export default function useIdChangeEffect(conversationId: string) {
  const lastConvoId = useRef<string | null>(null);
  const resetArtifacts = useResetRecoilState(store.artifactsState);

  useEffect(() => {
    if (conversationId !== lastConvoId.current) {
      logger.log('conversation', 'Conversation ID change');
      resetArtifacts();
    }
    lastConvoId.current = conversationId;
  }, [conversationId, resetArtifacts]);
}
