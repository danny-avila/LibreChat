import React, { useCallback } from 'react';
import { BookmarkPlusIcon } from 'lucide-react';
import type { FC } from 'react';
import type { TConversation } from 'librechat-data-provider';
import { BookmarkItems, BookmarkEditDialog } from '~/components/Bookmarks';
import { useTagConversationMutation } from '~/data-provider';
import { useLocalize, useBookmarkSuccess } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';

export const BookmarkMenuItems: FC<{
  conversation: TConversation;
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
}> = ({ conversation, tags, setTags }) => {
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const conversationId = conversation.conversationId ?? '';
  const onSuccess = useBookmarkSuccess(conversationId);

  const { mutateAsync } = useTagConversationMutation(conversationId);
  const handleSubmit = useCallback(
    async (tag: string): Promise<void> => {
      if (tags !== undefined && conversationId) {
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
      }
    },
    [tags, conversationId, mutateAsync, setTags, onSuccess, showToast],
  );

  return (
    <BookmarkItems
      ctx="header"
      tags={tags}
      handleSubmit={handleSubmit}
      header={
        <div>
          <BookmarkEditDialog
            conversation={conversation}
            tags={tags}
            setTags={setTags}
            trigger={
              <div
                role="menuitem"
                className="group m-1.5 flex cursor-pointer gap-2 rounded px-2 !pr-3.5 pb-2.5 pt-3 text-sm !opacity-100 hover:bg-header-hover focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50"
                tabIndex={-1}
              >
                <div className="flex grow items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BookmarkPlusIcon className="size-4" />
                    <div className="break-all">{localize('com_ui_bookmarks_new')}</div>
                  </div>
                </div>
              </div>
            }
          />
        </div>
      }
    />
  );
};
