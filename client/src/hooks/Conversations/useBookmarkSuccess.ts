import { useSetRecoilState } from 'recoil';
import useUpdateTagsInConvo from './useUpdateTagsInConvo';
import store from '~/store';

const useBookmarkSuccess = (conversationId: string) => {
  const updateConversation = useSetRecoilState(store.updateConversationSelector(conversationId));
  const { updateTagsInConversation } = useUpdateTagsInConvo();

  return (newTags: string[], tagIds?: string[]) => {
    if (!conversationId) {
      return;
    }
    updateTagsInConversation(conversationId, newTags, tagIds);
    updateConversation({ tags: newTags, ...(tagIds === undefined ? {} : { tagIds }) });
  };
};

export default useBookmarkSuccess;
