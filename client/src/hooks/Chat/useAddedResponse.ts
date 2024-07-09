import { useMemo } from 'react';
import useGenerateConvo from '~/hooks/Conversations/useGenerateConvo';
import useAddedHelpers from '~/hooks/Chat/useAddedHelpers';

export default function useAddedResponse({ rootIndex }: { rootIndex: number }) {
  const currentIndex = useMemo(() => rootIndex + 1, [rootIndex]);
  const {
    ask,
    regenerate,
    setMessages,
    getMessages,
    conversation,
    isSubmitting,
    setConversation,
    setIsSubmitting,
  } = useAddedHelpers({
    rootIndex,
    currentIndex,
  });

  const { generateConversation } = useGenerateConvo({
    index: currentIndex,
    rootIndex,
    setConversation,
  });

  return {
    ask,
    regenerate,
    getMessages,
    setMessages,
    conversation,
    isSubmitting,
    setConversation,
    setIsSubmitting,
    generateConversation,
    addedIndex: currentIndex,
  };
}
