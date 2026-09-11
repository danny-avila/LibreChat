import { useCallback, useEffect, useState, useMemo, memo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { useMediaQuery } from '@librechat/client';
import type { InfiniteQueryObserverResult } from '@tanstack/react-query';
import type { ConversationListResponse } from 'librechat-data-provider';
import type { List } from 'react-virtualized';
import {
  chatFilterTagsAtom,
  chatSortAtom,
  isArchivedChatViewAtom,
} from '~/components/Conversations/chatFilters';
import {
  useConversationsInfiniteQuery,
  usePinnedConversationsQuery,
  useTitleGeneration,
} from '~/data-provider';
import { useLocalize, useAuthContext, useLocalStorage, useNavScrolling } from '~/hooks';
import ProjectsSection from '~/components/Conversations/ProjectsSection';
import ChatFilterMenu from '~/components/Conversations/ChatFilterMenu';
import PinnedSection from '~/components/Conversations/PinnedSection';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import { Conversations } from '~/components/Conversations';
import { collectPinnedConversations } from '~/utils';
import SearchBar from '~/components/Nav/SearchBar';
import store from '~/store';

const ConversationsSection = memo(() => {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { setSidebarOpen } = useSidebarToggle();
  const { isAuthenticated } = useAuthContext();
  useTitleGeneration(isAuthenticated);

  const [isChatsExpanded, setIsChatsExpanded] = useLocalStorage('chatsExpanded', true);

  const tags = useAtomValue(chatFilterTagsAtom);
  const sort = useAtomValue(chatSortAtom);
  const isArchivedView = useAtomValue(isArchivedChatViewAtom);

  const search = useRecoilValue(store.search);

  const { data, fetchNextPage, isFetchingNextPage, isLoading, isFetching, isPreviousData } =
    useConversationsInfiniteQuery(
      {
        /** Omitted rather than `false`: the parameter's absence is what the server reads
         *  as "not archived", and a stray `isArchived=false` would key a third cache. */
        isArchived: isArchivedView ? true : undefined,
        sortBy: sort.field,
        sortDirection: sort.direction,
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
   * The Chats filters are deliberately not passed: they narrow that list alone. */
  const {
    data: pinnedData,
    isSuccess: isPinnedFetched,
    isFetching: isPinnedFetching,
    dataUpdatedAt: pinnedUpdatedAt,
  } = usePinnedConversationsQuery({ enabled: isAuthenticated });
  const isPinnedComplete = isPinnedFetched && !isPinnedFetching;

  /* `groupConversations` strips pins from the chats groups. A failed
     refetch keeps the previous dedicated result, so merge in pins from the
     live chats cache rather than hiding a newly pinned row — but only while that
     cache holds the same unarchived chats this section shows. */
  const pinnedConversations = useMemo(
    () =>
      collectPinnedConversations(pinnedData?.conversations, isArchivedView ? [] : conversations),
    [pinnedData?.conversations, conversations, isArchivedView],
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
      {/* The search field owns this row alone; filtering and ordering moved beside the
          Chats heading, where the list they act on is labelled. On mobile the field
          itself lives in the drawer's bottom bar, within thumb reach. */}
      {!isSmallScreen && search.enabled && (
        <div className="flex items-center px-3">
          <SearchBar isSmallScreen={isSmallScreen} />
        </div>
      )}
      {!search.query && <ProjectsSection toggleNav={toggleNav} isAuthenticated={isAuthenticated} />}
      {!search.query && (
        <PinnedSection
          conversations={pinnedConversations}
          toggleNav={toggleNav}
          isSmallScreen={isSmallScreen}
          /* Only a successful drain proves the list is whole: a failed later
             page still publishes partial data and stops fetching. The Chats filters
             never reach this query, so nothing else can truncate it. */
          membershipComplete={isPinnedComplete}
          /* When that drain last ran, which decides whether it is current
             enough to prune the stored order against. */
          membershipUpdatedAt={pinnedUpdatedAt}
        />
      )}
      <div className="flex min-h-0 flex-grow flex-col overflow-hidden">
        <Conversations
          conversations={conversations}
          moveToTop={moveToTop}
          toggleNav={toggleNav}
          containerRef={conversationsRef}
          loadMoreConversations={loadMoreConversations}
          isLoading={isFetchingNextPage || isLoading}
          isSearchLoading={isSearchLoading || isPreviousData}
          isChatsExpanded={isChatsExpanded}
          setIsChatsExpanded={setIsChatsExpanded}
          hasNextPage={computedHasNextPage}
          chatsHeaderTrailing={<ChatFilterMenu />}
        />
      </div>
    </div>
  );
});

ConversationsSection.displayName = 'ConversationsSection';

export default ConversationsSection;
