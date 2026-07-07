import { useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ArrowLeft, ArrowUpDown, Bookmark, Check } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ConversationListResponse } from 'librechat-data-provider';
import { DropdownPopup } from '@librechat/client';
import type { MenuItemProps, RenderProp } from '~/common';
import ConversationListVirtual from '~/components/Conversations/ConversationListVirtual';
import { useConversationsInfiniteQuery, useConversationTagsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type ChatSortField = 'updatedAt' | 'createdAt';

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

export default function BookmarkWorkspace() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { tag: encodedTag = '' } = useParams();
  const tag = decodeURIComponent(encodedTag);
  const [sortBy, setSortBy] = useState<ChatSortField>('updatedAt');
  const sortMenuId = useId();
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  const { data: tagsData } = useConversationTagsQuery();
  const currentTag = useMemo(() => tagsData?.find((t) => t.tag === tag), [tagsData, tag]);

  const sortOptions = useMemo(
    () => [
      { value: 'updatedAt' as const, label: localize('com_ui_sort_updated') },
      { value: 'createdAt' as const, label: localize('com_ui_sort_created') },
    ],
    [localize],
  );
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ?? localize('com_ui_sort_updated');
  const sortMenuItems = useMemo<MenuItemProps[]>(
    () =>
      sortOptions.map((option) => {
        const isSelected = sortBy === option.value;
        return {
          id: `bookmark-chat-sort-${option.value}`,
          ariaLabel: option.label,
          ariaChecked: isSelected,
          onClick: () => setSortBy(option.value),
          render: renderSortMenuItem(option.label, isSelected),
        };
      }),
    [sortBy, sortOptions],
  );

  const {
    data,
    fetchNextPage,
    isFetchingNextPage,
    isLoading: isConversationsLoading,
  } = useConversationsInfiniteQuery(
    { tags: [tag], sortBy, sortDirection: 'desc' },
    { enabled: Boolean(tag), staleTime: 30000, cacheTime: 300000 },
  );

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.conversations) ?? [],
    [data?.pages],
  );

  const hasNextPage = useMemo(() => {
    const pages = data?.pages;
    if (!pages?.length) {
      return false;
    }
    const lastPage: ConversationListResponse = pages[pages.length - 1];
    return lastPage.nextCursor !== null;
  }, [data?.pages]);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-primary text-text-primary">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-10 pt-4 md:px-6 lg:pt-8">
        <button
          type="button"
          onClick={() => navigate('/bookmarks')}
          className="-ml-1.5 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_all_bookmarks')}
        </button>

        <header className="mt-5 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-secondary text-text-secondary">
            <Bookmark className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-text-primary">
              {tag}
            </h1>
          </div>
        </header>

        <section className="mt-8 flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="flex items-baseline gap-2 text-sm font-medium text-text-primary">
              {localize('com_ui_chats')}
              <span className="text-text-secondary">
                {currentTag?.count ?? conversations.length}
              </span>
            </h2>
            <DropdownPopup
              portal={true}
              focusLoop={true}
              unmountOnHide={true}
              menuId={sortMenuId}
              isOpen={isSortMenuOpen}
              setIsOpen={setIsSortMenuOpen}
              className="z-[125] min-w-44"
              trigger={
                <Ariakit.MenuButton
                  aria-label={localize('com_ui_sort_chats_by')}
                  className={cn(
                    'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                    isSortMenuOpen && 'bg-surface-hover text-text-primary',
                  )}
                >
                  <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                  {selectedSortLabel}
                </Ariakit.MenuButton>
              }
              items={sortMenuItems}
            />
          </div>
          <ConversationListVirtual
            conversations={conversations}
            isLoading={isConversationsLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            sortBy={sortBy}
            emptyLabel={localize('com_ui_no_bookmark_chats')}
            loadMore={() => fetchNextPage()}
          />
        </section>
      </div>
    </main>
  );
}
