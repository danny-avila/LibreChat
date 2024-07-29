import { useCallback } from 'react';
import { BookmarkPlusIcon } from 'lucide-react';
import type { FC } from 'react';
import type { TConversation } from 'librechat-data-provider';
import { BookmarkItems, BookmarkEditDialog } from '~/components/Bookmarks';
import { useTagConversationMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

export const BookmarkMenuItems: FC<{
  conversation: TConversation;
  tags: string[];
  setTags: (tags: string[]) => void;
  setConversation: (conversation: TConversation) => void;
}> = ({ conversation, tags, setTags, setConversation }) => {
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const { mutateAsync } = useTagConversationMutation(conversation?.conversationId ?? '');
  const handleSubmit = useCallback(
    async (tag: string): Promise<void> => {
      if (tags !== undefined && conversation?.conversationId) {
        const newTags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
        await mutateAsync(
          {
            conversationId: conversation.conversationId,
            tags: newTags,
          },
          {
            onSuccess: (newTags: string[]) => {
              setTags(newTags);
              setConversation({ ...conversation, tags: newTags });
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
    [tags, conversation],
  );

  return (
    <BookmarkItems
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
                className="group m-1.5 flex cursor-pointer gap-2 rounded px-2 !pr-3.5 pb-2.5 pt-3 text-sm !opacity-100 hover:bg-black/5 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-white/5"
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
