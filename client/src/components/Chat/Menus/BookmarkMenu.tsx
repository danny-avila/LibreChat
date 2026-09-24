import { useState, useId } from 'react';
import { useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import { DropdownPopup, TooltipAnchor, Spinner } from '@librechat/client';
import type { FC } from 'react';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import useBookmarkItems from '~/hooks/Chat/useBookmarkItems';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const BookmarkMenu: FC = () => {
  const localize = useLocalize();
  const menuId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const conversationId = useRecoilValue(store.conversationByIndex(0))?.conversationId ?? '';
  const { show, items, bookmarks, hasBookmarks, isLoading, triggerAriaLabel, dialog } =
    useBookmarkItems();

  const mutation = useTagConversationMutation(conversationId, {
    onSuccess: (newTags: string[], vars) => {
      updateConvoTags(newTags);
      const tagElement = document.getElementById(vars.tag);
      console.log('tagElement', tagElement);
      if (tagElement) {
        setTimeout(() => tagElement.focus(), 2);
      }
    },
    onError: () => {
      showToast({
        message: 'Error adding bookmark',
        severity: NotificationSeverity.ERROR,
      });
    },
    onMutate: (vars) => {
      const tagElement = document.getElementById(vars.tag);
      console.log('tagElement', tagElement);
      if (tagElement) {
        setTimeout(() => tagElement.focus(), 2);
      }
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
      const filteredTags = tags?.filter((t) => existingTags.includes(t));

      logger.log('tag_mutation', 'BookmarkMenu - handleSubmit: tags after filtering', filteredTags);
      const newTags =
        filteredTags?.includes(tag) === true
          ? filteredTags.filter((t) => t !== tag)
          : [...(filteredTags ?? []), tag];

      logger.log('tag_mutation', 'BookmarkMenu - handleSubmit: tags after', newTags);
      mutation.mutate({
        tags: newTags,
        tag,
      });
    },
    [tags, conversationId, mutation, queryClient, showToast],
  );

  const newBookmarkRef = useRef<HTMLButtonElement>(null);

  const tagsCount = tags?.length ?? 0;
  const hasBookmarks = tagsCount > 0;

  const buttonAriaLabel = useMemo(() => {
    if (tagsCount > 0) {
      return localize('com_ui_bookmarks_count_selected', { count: tagsCount });
    }
    return localize('com_ui_bookmarks_add');
  }, [tagsCount, localize]);

  const dropdownItems: t.MenuItemProps[] = useMemo(() => {
    const items: t.MenuItemProps[] = [
      {
        id: '%___new___bookmark___%',
        label: localize('com_ui_bookmarks_new'),
        icon: <BookmarkPlusIcon className="size-4" />,
        hideOnClick: false,
        ref: newBookmarkRef,
        render: (props) => <button {...props} />,
        onClick: () => setIsDialogOpen(true),
      },
    ];

    if (data) {
      for (const tag of data) {
        const isSelected = tags?.includes(tag.tag) === true;
        items.push({
          id: tag.tag,
          label: tag.tag,
          hideOnClick: false,
          icon: isSelected ? (
            <BookmarkFilledIcon className="size-4" />
          ) : (
            <BookmarkIcon className="size-4" />
          ),
          onClick: () => handleSubmit(tag.tag),
          disabled: mutation.isLoading,
          ariaChecked: isSelected,
        });
      }
    }

    return items;
  }, [tags, data, handleSubmit, mutation.isLoading, localize]);

  if (!isActiveConvo) {
    return null;
  }

  if (isTemporary) {
    return null;
  }

  const renderButtonContent = () => {
    if (isLoading) {
      return <Spinner aria-label="Spinner" />;
    }
    if (hasBookmarks) {
      return <BookmarkFilledIcon className="icon-md" aria-hidden="true" />;
    }
    return <BookmarkIcon className="icon-md" aria-hidden="true" />;
  };

  return (
    <BookmarkContext.Provider value={{ bookmarks }}>
      <DropdownPopup
        portal={true}
        menuId={menuId}
        focusLoop={true}
        isOpen={isMenuOpen}
        unmountOnHide={true}
        setIsOpen={setIsMenuOpen}
        keyPrefix={`${conversationId}-bookmark-`}
        trigger={
          <TooltipAnchor
            description={localize('com_ui_bookmarks_add')}
            render={
              <Ariakit.MenuButton
                id="bookmark-menu-button"
                aria-label={triggerAriaLabel}
                aria-pressed={hasBookmarks}
                className={cn(
                  'mt-text-sm flex size-9 flex-shrink-0 items-center justify-center gap-2 rounded-xl border border-border-light bg-presentation text-sm transition-colors duration-200 hover:bg-surface-hover',
                  isMenuOpen ? 'bg-surface-hover' : '',
                )}
                data-testid="bookmark-menu"
              >
                {renderButtonContent()}
              </Ariakit.MenuButton>
            }
          />
        }
        items={items}
      />
      {dialog}
    </BookmarkContext.Provider>
  );
};

export default BookmarkMenu;
