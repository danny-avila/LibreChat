import React, { useCallback } from 'react';
import { BookmarkPlusIcon } from 'lucide-react';
import type { FC } from 'react';
import type { TConversation } from 'librechat-data-provider';
import { BookmarkItems, BookmarkItem } from '~/components/Bookmarks';
import { useTagConversationMutation } from '~/data-provider';
import { useBookmarkSuccess, useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';

export const BookmarkMenuItems: FC<{
  conversation: TConversation;
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  handleToggleOpen?: () => Promise<void>;
}> = ({
  conversation,
  tags,
  setTags,
  handleToggleOpen = async () => {
    ('');
  },
}) => {
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const conversationId = conversation.conversationId ?? '';
  const onSuccess = useBookmarkSuccess(conversationId);

  const { mutateAsync } = useTagConversationMutation(conversationId);
  const handleSubmit = useCallback(
    async (tag?: string): Promise<void> => {
      if (tag === undefined || tag === '' || !conversationId) {
        showToast({
          message: 'Invalid tag or conversationId',
          severity: NotificationSeverity.ERROR,
        });
        return;
      }

      const newTags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
      await mutateAsync(
        {
          tags: newTags,
        },
        {
          onSuccess: (newTags: string[]) => {
            setTags(newTags);
            onSuccess(newTags);
          },
          onError: () => {
            showToast({
              message: 'Error adding bookmark',
              severity: NotificationSeverity.ERROR,
            });
          },
        },
      );
    },
    [tags, conversationId, mutateAsync, setTags, onSuccess, showToast],
  );

  return (
    <BookmarkItems
      tags={tags}
      handleSubmit={handleSubmit}
      header={
        <BookmarkItem
          tag={localize('com_ui_bookmarks_new')}
          data-testid="bookmark-item-new"
          handleSubmit={handleToggleOpen}
          selected={false}
          icon={<BookmarkPlusIcon className="size-4" aria-label="Add Bookmark" />}
        />
      }
    />
  );
};
