import { useState, type FC, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { Menu, MenuButton, MenuItems } from '@headlessui/react';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import { useConversationTagsQuery, useTagConversationMutation } from '~/data-provider';
import { BookmarkMenuItems } from './Bookmarks/BookmarkMenuItems';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { BookmarkEditDialog } from '~/components/Bookmarks';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useBookmarkSuccess } from '~/hooks';
import { Spinner } from '~/components';
import { cn } from '~/utils';
import store from '~/store';

const BookmarkMenu: FC = () => {
  const { showToast } = useToastContext();

  const conversation = useRecoilValue(store.conversationByIndex(0)) || undefined;
  const conversationId = conversation?.conversationId ?? '';
  const onSuccess = useBookmarkSuccess(conversationId);
  const [tags, setTags] = useState<string[]>(conversation?.tags || []);
  const [open, setOpen] = useState(false);

  const { mutateAsync, isLoading } = useTagConversationMutation(conversationId);

  const { data } = useConversationTagsQuery();

  const isActiveConvo = Boolean(
    conversation &&
      conversationId &&
      conversationId !== Constants.NEW_CONVO &&
      conversationId !== 'search',
  );

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

  if (!isActiveConvo) {
    return <></>;
  }

  const renderButtonContent = () => {
    if (isLoading) {
      return <Spinner aria-label="Spinner" />;
    }
    if (tags.length > 0) {
      return <BookmarkFilledIcon className="icon-sm" aria-label="Filled Bookmark" />;
    }
    return <BookmarkIcon className="icon-sm" aria-label="Bookmark" />;
  };

  const handleToggleOpen = () => {
    setOpen(!open);
    return Promise.resolve();
  };

  return (
    <>
      <Menu as="div" className="group relative">
        {({ open }) => (
          <>
            <MenuButton
              aria-label="Add bookmarks"
              className={cn(
                'mt-text-sm flex size-10 items-center justify-center gap-2 rounded-lg border border-border-light text-sm transition-colors duration-200 hover:bg-surface-hover',
                open ? 'bg-surface-hover' : '',
              )}
              data-testid="bookmark-menu"
            >
              {renderButtonContent()}
            </MenuButton>
            <MenuItems
              anchor="bottom start"
              className="overflow-hidden rounded-lg bg-header-primary p-1.5 shadow-lg outline-none"
            >
              <BookmarkContext.Provider value={{ bookmarks: data || [] }}>
                <BookmarkMenuItems
                  handleToggleOpen={handleToggleOpen}
                  tags={tags}
                  handleSubmit={handleSubmit}
                />
              </BookmarkContext.Provider>
            </MenuItems>
          </>
        )}
      </Menu>
      <BookmarkEditDialog
        conversation={conversation}
        tags={tags}
        setTags={setTags}
        open={open}
        setOpen={setOpen}
      />
    </>
  );
};

export default BookmarkMenu;
