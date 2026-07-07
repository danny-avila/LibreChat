import { useDeferredValue, useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, Bookmark, Check, Plus, Search } from 'lucide-react';
import { Input, Button, Spinner, DropdownPopup, useMediaQuery } from '@librechat/client';
import type { MenuItemProps, RenderProp } from '~/common';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { useConversationTagsQuery } from '~/data-provider';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import BookmarkEditDialog from './BookmarkEditDialog';
import BookmarkActionsMenu from './BookmarkActionsMenu';

type BookmarkSort = 'name' | 'createdAt' | 'count';

function renderSortMenuItem(label: string, isSelected: boolean): RenderProp {
  return function SortMenuItem({ className, ...props }) {
    return (
      <div {...props} className={cn(className, 'justify-between gap-5')}>
        <span className="truncate">{label}</span>
        {isSelected ? (
          <Check className="h-4 w-4 shrink-0 text-text-primary" aria-hidden="true" />
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </div>
    );
  };
}

export default function BookmarksView() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<BookmarkSort>('name');
  const [isCreating, setIsCreating] = useState(false);
  const sortMenuId = useId();
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const { data, isLoading } = useConversationTagsQuery();
  const tags = useMemo(() => data ?? [], [data]);

  const filteredTags = useMemo(
    () => tags.filter((t) => t.tag.toLowerCase().includes(deferredSearch.toLowerCase())),
    [tags, deferredSearch],
  );

  const sortedTags = useMemo(() => {
    const list = [...filteredTags];
    list.sort((a, b) => {
      if (sortBy === 'count') {
        return b.count - a.count;
      }
      if (sortBy === 'createdAt') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return a.tag.localeCompare(b.tag);
    });
    return list;
  }, [filteredTags, sortBy]);

  const sortOptions = useMemo(
    () => [
      { value: 'name' as const, label: localize('com_ui_name') },
      { value: 'createdAt' as const, label: localize('com_ui_sort_created') },
      { value: 'count' as const, label: localize('com_ui_conversations') },
    ],
    [localize],
  );
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ?? localize('com_ui_name');
  const sortMenuItems = useMemo<MenuItemProps[]>(
    () =>
      sortOptions.map((option) => {
        const isSelected = sortBy === option.value;
        return {
          id: `bookmark-sort-${option.value}`,
          ariaLabel: option.label,
          ariaChecked: isSelected,
          onClick: () => setSortBy(option.value),
          render: renderSortMenuItem(option.label, isSelected),
        };
      }),
    [sortBy, sortOptions],
  );

  return (
    <BookmarkContext.Provider value={{ bookmarks: tags }}>
      <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
        <div className="container mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 md:px-6 lg:pt-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {isSmallScreen ? <OpenSidebar /> : null}
              <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
                {localize('com_ui_bookmarks')}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-text-secondary sm:inline">
                {localize('com_ui_sort_by')}
              </span>
              <DropdownPopup
                portal={true}
                focusLoop={true}
                unmountOnHide={true}
                menuId={sortMenuId}
                isOpen={isSortMenuOpen}
                setIsOpen={setIsSortMenuOpen}
                className="z-[125] min-w-56"
                trigger={
                  <Ariakit.MenuButton
                    aria-label={localize('com_ui_sort_bookmarks_by')}
                    className={cn(
                      'inline-flex h-10 items-center justify-between gap-2 whitespace-nowrap rounded-lg border border-border-medium bg-surface-secondary px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary disabled:pointer-events-none disabled:opacity-50 sm:w-44',
                      isSortMenuOpen && 'bg-surface-hover text-text-primary',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ArrowUpDown
                        className="h-4 w-4 shrink-0 text-text-secondary"
                        aria-hidden="true"
                      />
                      <span className="truncate">{selectedSortLabel}</span>
                    </span>
                  </Ariakit.MenuButton>
                }
                items={sortMenuItems}
              />
              <Button type="button" variant="submit" size="sm" onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_bookmarks_new')}
              </Button>
            </div>
          </div>

          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{localize('com_ui_bookmarks_filter')}</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={localize('com_ui_bookmarks_filter')}
              className="border-border-medium bg-surface-secondary pl-9 text-text-primary placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          </label>

          <BookmarkEditDialog open={isCreating} setOpen={setIsCreating} context="BookmarksView" />

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="text-text-primary" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              {sortedTags.map((tag) => (
                <div key={tag._id} className="group/bookmark relative">
                  <button
                    type="button"
                    className={cn(
                      'flex min-h-[8.5rem] w-full flex-col rounded-xl border border-border-medium bg-surface-secondary p-4 text-left transition-colors',
                      'hover:border-border-heavy hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                    )}
                    onClick={() => navigate(`/bookmarks/${encodeURIComponent(tag.tag)}`)}
                  >
                    <span className="flex min-w-0 items-center gap-2 pr-8">
                      <Bookmark
                        className="h-4 w-4 shrink-0 text-text-secondary"
                        aria-hidden="true"
                      />
                      <span className="truncate text-base font-semibold text-text-primary">
                        {tag.tag}
                      </span>
                    </span>
                    <span className="mt-auto flex items-center gap-2 pt-4 text-xs text-text-secondary">
                      {tag.count === 1
                        ? `1 ${localize('com_ui_conversation')}`
                        : `${tag.count} ${localize('com_ui_conversations')}`}
                    </span>
                  </button>
                  <BookmarkActionsMenu
                    bookmark={tag}
                    className="absolute right-3 top-3 opacity-0 focus:opacity-100 group-focus-within/bookmark:opacity-100 group-hover/bookmark:opacity-100"
                  />
                </div>
              ))}
            </div>
          )}

          {!isLoading && sortedTags.length === 0 && (
            <div className="rounded-lg border border-border-medium bg-transparent py-16 text-center text-sm text-text-secondary">
              {deferredSearch
                ? localize('com_ui_no_bookmarks_match')
                : localize('com_ui_no_bookmarks_title')}
            </div>
          )}
        </div>
      </main>
    </BookmarkContext.Provider>
  );
}
