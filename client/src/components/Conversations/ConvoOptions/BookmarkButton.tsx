import { useCallback, useState } from 'react';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import { BookmarkPlusIcon } from 'lucide-react';
import { OGDialog, OGDialogTemplate, Spinner, useToastContext } from '@librechat/client';
import { useConversationTagsQuery, useTagConversationMutation } from '~/data-provider';
import { useBookmarkSuccess, useLocalize } from '~/hooks';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { BookmarkEditDialog } from '~/components/Bookmarks';
import { NotificationSeverity } from '~/common';

export default function BookmarkButton({
  conversationId,
  tags,
  open,
  onOpenChange,
  triggerRef,
}: {
  conversationId: string;
  tags?: string[];
  open: boolean;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [showCreate, setShowCreate] = useState(false);

  const { data: bookmarks, isLoading } = useConversationTagsQuery();
  const updateConvoTags = useBookmarkSuccess(conversationId);
  const tagMutation = useTagConversationMutation(conversationId, {
    onSuccess: (newTags) => updateConvoTags(newTags),
    onError: () => {
      showToast({
        message: localize('com_ui_bookmarks_create_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const handleToggle = useCallback(
    (tag: string) => {
      const knownTags = (bookmarks ?? []).map((b) => b.tag);
      const filteredTags = (tags ?? []).filter((t) => knownTags.includes(t));
      const newTags = filteredTags.includes(tag)
        ? filteredTags.filter((t) => t !== tag)
        : [...filteredTags, tag];
      tagMutation.mutate({ tags: newTags, tag });
    },
    [bookmarks, tags, tagMutation],
  );

  return (
    <BookmarkContext.Provider value={{ bookmarks: bookmarks ?? [] }}>
      <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
        <OGDialogTemplate
          showCloseButton={true}
          showCancelButton={false}
          title={localize('com_ui_bookmarks')}
          className="max-w-[480px]"
          main={
            <div className="mt-4 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 rounded-lg px-3 py-3 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
              >
                <BookmarkPlusIcon className="icon-sm text-text-primary" />
                {localize('com_ui_bookmarks_new')}
              </button>
              {isLoading && (
                <div className="flex justify-center py-4">
                  <Spinner className="text-text-primary" />
                </div>
              )}
              {!isLoading && (bookmarks ?? []).length === 0 && (
                <p className="px-3 py-2 text-sm text-text-secondary">
                  {localize('com_ui_no_bookmarks')}
                </p>
              )}
              {(bookmarks ?? []).map((bookmark) => {
                const selected = (tags ?? []).includes(bookmark.tag);
                return (
                  <button
                    key={bookmark.tag}
                    type="button"
                    disabled={tagMutation.isLoading}
                    onClick={() => handleToggle(bookmark.tag)}
                    className="flex items-center gap-2 rounded-lg px-3 py-3 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-60"
                  >
                    {selected ? (
                      <BookmarkFilledIcon className="icon-sm text-text-primary" />
                    ) : (
                      <BookmarkIcon className="icon-sm text-text-primary" />
                    )}
                    <span className="flex-1 truncate">{bookmark.tag}</span>
                  </button>
                );
              })}
            </div>
          }
        />
      </OGDialog>
      {showCreate && (
        <BookmarkEditDialog
          tags={tags}
          open={showCreate}
          setOpen={setShowCreate}
          setTags={updateConvoTags}
          conversationId={conversationId}
          context="ConvoOptions - BookmarkButton"
        />
      )}
    </BookmarkContext.Provider>
  );
}
