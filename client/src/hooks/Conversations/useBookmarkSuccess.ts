import { useSetRecoilState } from 'recoil';
import useUpdateTagsInConvo from './useUpdateTagsInConvo';
import store from '~/store';

const useBookmarkSuccess = (conversationId: string) => {
  const setConversation = useSetRecoilState(store.conversationByIndex(0));
  const { updateTagsInConversation } = useUpdateTagsInConvo();

  return (newTags: string[]) => {
    if (!conversationId) {
      return;
    }
    updateTagsInConversation(conversationId, newTags);
    setConversation((prev) => {
      if (prev) {
        return {
          ...prev,
          tags: newTags,
        };
      }
      console.error('Conversation not found for bookmark/tags update');
      return prev;
    });
  };
};

export default useBookmarkSuccess;
