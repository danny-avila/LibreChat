import { useCallback } from 'react';
import { Constants } from 'librechat-data-provider';
import { useRecoilState, useRecoilValue } from 'recoil';

import store from '~/store';

export type UseTemporaryChatResult = {
  /** Only offered before a conversation has any history, it cannot be toggled mid-thread. */
  show: boolean;
  isTemporary: boolean;
  /** Temporary mode is locked in for the conversation in progress, leaving only a read-only indicator. */
  isActive: boolean;
  toggle: () => void;
};

export default function useTemporaryChat(): UseTemporaryChatResult {
  const [isTemporary, setIsTemporary] = useRecoilState(store.isTemporary);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));

  const toggle = useCallback(() => {
    setIsTemporary((previous) => !previous);
  }, [setIsTemporary]);

  const conversationId = conversation?.conversationId;
  const hasStarted = conversationId != null && conversationId !== Constants.NEW_CONVO;
  const hasMessages = Array.isArray(conversation?.messages) && conversation.messages.length >= 1;

  const show = !hasStarted && !hasMessages && !isSubmitting;

  return {
    show,
    isTemporary,
    isActive: isTemporary && !show,
    toggle,
  };
}
