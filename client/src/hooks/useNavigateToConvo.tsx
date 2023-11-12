import { useNavigate } from 'react-router-dom';
// import { useQueryClient } from '@tanstack/react-query';
import { useSetRecoilState, useResetRecoilState } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import store from '~/store';

const useNavigateToConvo = (index = 0) => {
  const navigate = useNavigate();
  // const queryClient = useQueryClient();
  const setConversation = useSetRecoilState(store.conversationByIndex(index));
  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));

  const navigateToConvo = (conversation: TConversation) => {
    // const conversations = queryClient.getQueryData<TConversation[]>([QueryKeys.allConversations, { active: true }]);
    // const conversation = conversations?.find((convo) => convo.conversationId === conversationId);
    if (!conversation) {
      console.log('Conversation not provided');
      return;
    }
    setConversation(conversation);
    resetLatestMessage();
    setSubmission(null);
    navigate(`/a/${conversation.conversationId}`);
  };

  return {
    navigateToConvo,
  };
};

export default useNavigateToConvo;
