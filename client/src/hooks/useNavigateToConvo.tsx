import { useSetRecoilState, useResetRecoilState } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import useOriginNavigate from './useOriginNavigate';
import store from '~/store';

const useNavigateToConvo = (index = 0) => {
  const navigate = useOriginNavigate();
  const setConversation = useSetRecoilState(store.conversationByIndex(index));
  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));

  const navigateToConvo = (conversation: TConversation) => {
    if (!conversation) {
      console.log('Conversation not provided');
      return;
    }
    setConversation(conversation);
    resetLatestMessage();
    setSubmission(null);
    navigate(conversation?.conversationId);
  };

  return {
    navigateToConvo,
  };
};

export default useNavigateToConvo;
