import { useQuery } from '@tanstack/react-query';
import { getAllConversations, getConversation } from '../api/conversations';

export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation', { conversationId }],
    queryFn: () => getConversation(conversationId!),
    enabled: !!conversationId,
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => getAllConversations(),
  });
}
