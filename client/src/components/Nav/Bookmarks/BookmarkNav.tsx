import { useState, useId, useMemo, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { CrossCircledIcon } from '@radix-ui/react-icons';
import { DropdownPopup, TooltipAnchor } from '@librechat/client';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import type * as t from '~/common';
import type { FC } from 'react';
import { useGetConversationTags } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type BookmarkNavProps = {
  tags: string[];
  setTags: (tags: string[]) => void;
};

const BookmarkNav: FC<BookmarkNavProps> = ({ tags, setTags }: BookmarkNavProps) => {
  const localize = useLocalize();
  const menuId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { data } = useGetConversationTags();

  const label = useMemo(
    () => (tags.length > 0 ? tags.join(', ') : localize('com_ui_bookmarks')),
    [tags, localize],
  );

  const bookmarks = useMemo(() => data?.filter((tag) => tag.count > 0) ?? [], [data]);

  const handleTagClick = useCallback(
    (tag: string) => {
      if (tags.includes(tag)) {
        setTags(tags.filter((t) => t !== tag));
      } else {
        setTags([...tags, tag]);
      }
    },
    [tags, setTags],
  );

  const handleClear = useCallback(() => {
    setTags([]);
  }, [setTags]);

  const dropdownItems: t.MenuItemProps[] = useMemo(() => {
    const items: t.MenuItemProps[] = [
      {
        id: 'clear-all',
        label: localize('com_ui_clear_all'),
        icon: <CrossCircledIcon className="size-4" />,
        hideOnClick: false,
        onClick: handleClear,
      },
    ];

    if (bookmarks.length === 0) {
      items.push({
        id: 'no-bookmarks',
        label: localize('com_ui_no_bookmarks'),
        icon: '🤔',
        disabled: true,
      });
    } else {
      for (const bookmark of bookmarks) {
        const isSelected = tags.includes(bookmark.tag);
        items.push({
          id: bookmark.tag,
          label: bookmark.tag,
          hideOnClick: false,
          icon: isSelected ? (
            <BookmarkFilledIcon className="size-4" />
          ) : (
            <BookmarkIcon className="size-4" />
          ),
          onClick: () => handleTagClick(bookmark.tag),
        });
      }
    }

    return items;
  }, [bookmarks, tags, localize, handleTagClick, handleClear]);

  return (
    <DropdownPopup
      portal={true}
      menuId={menuId}
      focusLoop={true}
      isOpen={isMenuOpen}
      unmountOnHide={true}
      setIsOpen={setIsMenuOpen}
      keyPrefix="bookmark-nav-"
      className="z-[125]"
      trigger={
        <TooltipAnchor
          description={label}
          render={
            <Ariakit.MenuButton
              id="bookmark-nav-menu-button"
              aria-label={localize('com_ui_bookmarks')}
              className={cn(
                'flex items-center justify-center',
                'size-10 border-none text-text-primary hover:bg-accent hover:text-accent-foreground',
                'rounded-full border-none p-2 hover:bg-surface-active-alt md:rounded-xl',
                isMenuOpen ? 'bg-surface-hover' : '',
              )}
              data-testid="bookmark-menu"
            >
              {tags.length > 0 ? (
                <BookmarkFilledIcon aria-hidden="true" className="icon-lg text-text-primary" />
              ) : (
                <BookmarkIcon aria-hidden="true" className="icon-lg text-text-primary" />
              )}
            </Ariakit.MenuButton>
          }
        />
      }
      items={dropdownItems}
    />
  );
};

export default BookmarkNav;
