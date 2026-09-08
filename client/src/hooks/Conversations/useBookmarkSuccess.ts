import type { TConversation } from 'librechat-data-provider';
import type { Dispatch, SetStateAction } from 'react';
import useUpdateTagsInConvo from './useUpdateTagsInConvo';

const useBookmarkSuccess = (
  conversationId: string,
  setConversation: Dispatch<SetStateAction<TConversation | null>>,
) => {
  const { updateTagsInConversation } = useUpdateTagsInConvo();

  return (newTags: string[], tagIds?: string[]) => {
    if (!conversationId) {
      return;
    }
    updateTagsInConversation(conversationId, newTags, tagIds);
    setConversation((current) =>
      current?.conversationId === conversationId
        ? { ...current, tags: newTags, ...(tagIds === undefined ? {} : { tagIds }) }
        : current,
    );
  };
};

export default useBookmarkSuccess;
