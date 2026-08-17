import { useCallback, useEffect, useState, useMemo, memo, lazy, Suspense, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { useMediaQuery } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { InfiniteQueryObserverResult } from '@tanstack/react-query';
import type { ConversationListResponse } from 'librechat-data-provider';
import type { List } from 'react-virtualized';
import {
  useConversationsInfiniteQuery,
  usePinnedConversationsQuery,
  useTitleGeneration,
} from '~/data-provider';
import {
  useLocalize,
  useHasAccess,
  useAuthContext,
  useLocalStorage,
  useNavScrolling,
} from '~/hooks';
import ProjectsSection from '~/components/Conversations/ProjectsSection';
import PinnedSection from '~/components/Conversations/PinnedSection';
import FavoritesList from '~/components/Nav/Favorites/FavoritesList';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import { Conversations } from '~/components/Conversations';
import { collectPinnedConversations } from '~/utils';
import SearchBar from '~/components/Nav/SearchBar';
import store from '~/store';

const BookmarkNav = lazy(() => import('~/components/Nav/Bookmarks/BookmarkNav'));

const ConversationsSection = memo(() => {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { setSidebarOpen } = useSidebarToggle();
  const { isAuthenticated } = useAuthContext();
  useTitleGeneration(isAuthenticated);

  const [isChatsExpanded, setIsChatsExpanded] = useLocalStorage('chatsExpanded', true);
  const [tags, setTags] = useState<string[]>([]);

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const search = useRecoilValue(store.search);

  const { data, fetchNextPage, isFetchingNextPage, isLoading, isFetching } =
    useConversationsInfiniteQuery(
      {
        tags: tags.length === 0 ? undefined : tags,
        search: search.debouncedQuery || undefined,
      },
      {
        enabled: isAuthenticated,
        staleTime: 30000,
        cacheTime: 300000,
      },
    );

  const computedHasNextPage = useMemo(() => {
    if (data?.pages && data.pages.length > 0) {
      const lastPage: ConversationListResponse = data.pages[data.pages.length - 1];
      return lastPage.nextCursor !== null;
    }
    return false;
  }, [data?.pages]);

  const conversationsRef = useRef<List | null>(null);

  const { moveToTop } = useNavScrolling<ConversationListResponse>({
    fetchNextPage: async (options?) => {
      if (computedHasNextPage) {
        return fetchNextPage(options);
      }
      return Promise.resolve({} as InfiniteQueryObserverResult<ConversationListResponse, unknown>);
    },
    isFetchingNext: isFetchingNextPage,
  });

  const conversations = useMemo(() => {
    return data ? data.pages.flatMap((page) => page.conversations) : [];
  }, [data]);

  /** Pins are fetched on their own so one older than the first page of the chats list
   * still shows on first paint, instead of appearing only once that list scrolls to it.
   * The bookmark filter still applies, matching the chats list beside it. */
  const { data: pinnedData } = usePinnedConversationsQuery(
    { tags: tags.length === 0 ? undefined : tags },
    { enabled: isAuthenticated },
  );

  /* `groupConversationsByDate` strips pins from the chats groups. A failed
     refetch keeps the previous dedicated result, so merge in pins from the
     live chats cache rather than hiding a newly pinned row. */
  const pinnedConversations = useMemo(
    () => collectPinnedConversations(pinnedData?.conversations, conversations),
    [pinnedData?.conversations, conversations],
  );

  /**
   * Selecting a conversation is the most common close path — it must take
   * the animated route or the drawer stalls on the new conversation's
   * commit before it starts sliding. `afterSlide` carries that navigation:
   * run synchronously it would flush the conversation switch in the tap's
   * task and stall the slide anyway; deferred, it lands mid-slide. Desktop
   * runs it immediately (nothing slides).
   */
  const toggleNav = useCallback(
    (afterSlide?: () => void) => {
      if (isSmallScreen) {
        setSidebarOpen(false, afterSlide);
        return;
      }
      afterSlide?.();
    },
    [isSmallScreen, setSidebarOpen],
  );

  const loadMoreConversations = useCallback(() => {
    if (isFetchingNextPage || !computedHasNextPage) {
      return;
    }
    fetchNextPage();
  }, [isFetchingNextPage, computedHasNextPage, fetchNextPage]);

  const [isSearchLoading, setIsSearchLoading] = useState(
    !!search.query && (search.isTyping || isLoading || isFetching),
  );

  useEffect(() => {
    if (search.isTyping) {
      setIsSearchLoading(true);
    } else if (!isLoading && !isFetching) {
      setIsSearchLoading(false);
    } else if (!!search.query && (isLoading || isFetching)) {
      setIsSearchLoading(true);
    }
  }, [search.query, search.isTyping, isLoading, isFetching]);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden pb-3 pt-2"
      role="region"
      aria-label={localize('com_ui_chat_history')}
    >
      {/* On mobile the search field lives in the drawer's bottom bar, within thumb reach,
          which would leave the bookmark filter alone on a row of its own — so it moves
          beside the Chats heading, where the Projects heading already keeps its actions. */}
      {!isSmallScreen && (
        <div className="flex items-center gap-0.5 px-3">
          {hasAccessToBookmarks && (
            <Suspense fallback={null}>
              <BookmarkNav tags={tags} setTags={setTags} />
            </Suspense>
          )}
          {search.enabled && <SearchBar isSmallScreen={isSmallScreen} />}
        </div>
      )}
      {!search.query && (
        <div className="px-3">
          <FavoritesList isSmallScreen={isSmallScreen} toggleNav={toggleNav} />
        </div>
      )}
      {!search.query && <ProjectsSection toggleNav={toggleNav} isAuthenticated={isAuthenticated} />}
      {!search.query && <PinnedSection conversations={pinnedConversations} toggleNav={toggleNav} />}
      <div className="flex min-h-0 flex-grow flex-col overflow-hidden">
        <Conversations
          conversations={conversations}
          moveToTop={moveToTop}
          toggleNav={toggleNav}
          containerRef={conversationsRef}
          loadMoreConversations={loadMoreConversations}
          isLoading={isFetchingNextPage || isLoading}
          isSearchLoading={isSearchLoading}
          isChatsExpanded={isChatsExpanded}
          setIsChatsExpanded={setIsChatsExpanded}
          showFavorites={false}
          chatsHeaderTrailing={
            isSmallScreen && hasAccessToBookmarks ? (
              <Suspense fallback={null}>
                <BookmarkNav tags={tags} setTags={setTags} />
              </Suspense>
            ) : undefined
          }
        />
      </div>
    </div>
  );
});

ConversationsSection.displayName = 'ConversationsSection';

export default ConversationsSection;
