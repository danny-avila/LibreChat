import { useMemo } from 'react';
import useGenerateConvo from '~/hooks/Conversations/useGenerateConvo';
import useAddedHelpers from '~/hooks/Chat/useAddedHelpers';

export default function useAddedResponse({ rootIndex }: { rootIndex: number }) {
  const currentIndex = useMemo(() => rootIndex + 1, [rootIndex]);
  const { ask, regenerate, conversation, setConversation, setMessages } = useAddedHelpers({
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
    setMessages,
    conversation,
    setConversation,
    generateConversation,
    addedIndex: currentIndex,
  };
}
