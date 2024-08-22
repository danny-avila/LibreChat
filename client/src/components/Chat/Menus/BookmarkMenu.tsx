import { useState, type FC, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { Menu, MenuButton, MenuItems } from '@headlessui/react';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import type { TConversationTag } from 'librechat-data-provider';
import { useConversationTagsQuery, useTagConversationMutation } from '~/data-provider';
import { BookmarkMenuItems } from './Bookmarks/BookmarkMenuItems';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { BookmarkEditDialog } from '~/components/Bookmarks';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useBookmarkSuccess } from '~/hooks';
import { Spinner } from '~/components';
import { cn, logger } from '~/utils';
import store from '~/store';

const BookmarkMenu: FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();

  const conversation = useRecoilValue(store.conversationByIndex(0)) || undefined;
  const conversationId = conversation?.conversationId ?? '';
  const updateConvoTags = useBookmarkSuccess(conversationId);

  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(conversation?.tags || []);

  const mutation = useTagConversationMutation(conversationId, {
    onSuccess: (newTags: string[]) => {
      setTags(newTags);
      updateConvoTags(newTags);
    },
    onError: () => {
      showToast({
        message: 'Error adding bookmark',
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const { data } = useConversationTagsQuery();

  const isActiveConvo = Boolean(
    conversation &&
      conversationId &&
      conversationId !== Constants.NEW_CONVO &&
      conversationId !== 'search',
  );

  const handleSubmit = useCallback(
    (tag?: string) => {
      if (tag === undefined || tag === '' || !conversationId) {
        showToast({
          message: 'Invalid tag or conversationId',
          severity: NotificationSeverity.ERROR,
        });
        return;
      }

      logger.log('tag_mutation', 'BookmarkMenu - handleSubmit: tags before setting', tags);
      const allTags =
        queryClient.getQueryData<TConversationTag[]>([QueryKeys.conversationTags]) ?? [];
      const existingTags = allTags.map((t) => t.tag);
      const filteredTags = tags.filter((t) => existingTags.includes(t));
      logger.log('tag_mutation', 'BookmarkMenu - handleSubmit: tags after filtering', filteredTags);
      const newTags = filteredTags.includes(tag)
        ? filteredTags.filter((t) => t !== tag)
        : [...filteredTags, tag];
      logger.log('tag_mutation', 'BookmarkMenu - handleSubmit: tags after', newTags);
      mutation.mutate({
        tags: newTags,
      });
    },
    [tags, conversationId, mutation, queryClient, showToast],
  );

  if (!isActiveConvo) {
    return null;
  }

  const renderButtonContent = () => {
    if (mutation.isLoading) {
      return <Spinner aria-label="Spinner" />;
    }
    if (tags.length > 0) {
      return <BookmarkFilledIcon className="icon-sm" aria-label="Filled Bookmark" />;
    }
    return <BookmarkIcon className="icon-sm" aria-label="Bookmark" />;
  };

  const handleToggleOpen = () => setOpen(!open);

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
        context="BookmarkMenu - BookmarkEditDialog"
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
