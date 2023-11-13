import { useSetRecoilState, useResetRecoilState } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import useOriginNavigate from './useOriginNavigate';
import store from '~/store';

const useNavigateToConvo = (index = 0) => {
  const navigate = useOriginNavigate();
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));
  const setConversation = useSetRecoilState(store.conversationByIndex(index));
  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));

  const navigateToConvo = (conversation: TConversation) => {
    if (!conversation) {
      console.log('Conversation not provided');
      return;
    }
    setSubmission(null);
    resetLatestMessage();
    setConversation(conversation);
    navigate(conversation?.conversationId);
  };

  return {
    navigateToConvo,
  };
};

export default useNavigateToConvo;
