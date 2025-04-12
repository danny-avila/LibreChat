import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { ConversationListResponse } from 'librechat-data-provider';
import type { InfiniteData } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import { updateConvoFieldsInfinite } from '~/utils/convos';

const useUpdateTagsInConvo = () => {
  const queryClient = useQueryClient();

  // Update the queryClient cache with the new tag when a new tag is added/removed to a conversation
  const updateTagsInConversation = (conversationId: string, tags: string[]) => {
    // Update the tags for the current conversation
    const currentConvo = queryClient.getQueryData<t.TConversation>([
      QueryKeys.conversation,
      conversationId,
    ]);
    if (!currentConvo) {
      return;
    }

    const updatedConvo = {
      ...currentConvo,
      tags,
    } as t.TConversation;
    queryClient.setQueryData([QueryKeys.conversation, conversationId], updatedConvo);
    queryClient.setQueryData<InfiniteData<ConversationListResponse>>(
      [QueryKeys.allConversations],
      (convoData) => {
        if (!convoData) {
          return convoData;
        }
        return {
          ...convoData,
          pages: convoData.pages.map((page) => ({
            ...page,
            conversations: page.conversations.map((conversation) =>
              conversation.conversationId === (currentConvo.conversationId ?? '')
                ? { ...conversation, tags: updatedConvo.tags }
                : conversation,
            ),
          })),
        };
      },
    );
  };

  // update the tag to newTag in all conversations when a tag is updated to a newTag
  // The difference with updateTagsInConversation is that it adds or removes tags for a specific conversation,
  // whereas this function is for changing the title of a specific tag.
  const replaceTagsInAllConversations = (tag: string, newTag: string) => {
    const data = queryClient.getQueryData<InfiniteData<ConversationListResponse>>([
      QueryKeys.allConversations,
    ]);

    const conversationIdsWithTag = [] as string[];

    // update tag to newTag in all conversations
    const newData = JSON.parse(JSON.stringify(data)) as InfiniteData<ConversationListResponse>;
    for (let pageIndex = 0; pageIndex < newData.pages.length; pageIndex++) {
      const page = newData.pages[pageIndex];
      page.conversations = page.conversations.map((conversation) => {
        if (
          conversation.conversationId &&
          'tags' in conversation &&
          Array.isArray((conversation as { tags?: string[] }).tags) &&
          (conversation as { tags?: string[] }).tags?.includes(tag)
        ) {
          (conversation as { tags: string[] }).tags = (conversation as { tags: string[] }).tags.map(
            (t: string) => (t === tag ? newTag : t),
          );
        }
        return conversation;
      });
    }
    queryClient.setQueryData<InfiniteData<ConversationListResponse>>(
      [QueryKeys.allConversations],
      newData,
    );

    // update the tag to newTag from the cache of each conversation
    for (let i = 0; i < conversationIdsWithTag.length; i++) {
      const conversationId = conversationIdsWithTag[i];
      const conversation = queryClient.getQueryData<t.TConversation>([
        QueryKeys.conversation,
        conversationId,
      ]);
      if (conversation && conversation.tags) {
        const updatedConvo = {
          ...conversation,
          tags: conversation.tags.map((t) => (t === tag ? newTag : t)),
        } as t.TConversation;
        queryClient.setQueryData<t.TConversation>(
          [QueryKeys.conversation, conversationId],
          updatedConvo,
        );
      }
    }
  };

  return { updateTagsInConversation, replaceTagsInAllConversations };
};

export default useUpdateTagsInConvo;
