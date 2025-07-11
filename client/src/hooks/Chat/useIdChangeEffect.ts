import { useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { RESET } from 'jotai/utils';
import { logger } from '~/utils';
import store from '~/store';

/**
 * Hook to reset visible artifacts when the conversation ID changes
 * @param conversationId - The current conversation ID
 */
export default function useIdChangeEffect(conversationId: string) {
  const lastConvoId = useRef<string | null>(null);
  const setVisibleArtifacts = useSetAtom(store.visibleArtifacts);

  useEffect(() => {
    if (conversationId !== lastConvoId.current) {
      logger.log('conversation', 'Conversation ID change');
      setVisibleArtifacts(RESET);
    }
    lastConvoId.current = conversationId;
  }, [conversationId, setVisibleArtifacts]);
}
