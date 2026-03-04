import { useCallback, useEffect, useState, useMemo, memo, lazy, Suspense, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { useMediaQuery, NewChatIcon } from '@librechat/client';
import { PermissionTypes, Permissions, QueryKeys } from 'librechat-data-provider';
import type { InfiniteQueryObserverResult } from '@tanstack/react-query';
import type { ConversationListResponse } from 'librechat-data-provider';
import type { List } from 'react-virtualized';
import {
  useLocalize,
  useNewConvo,
  useHasAccess,
  useAuthContext,
  useLocalStorage,
  useNavScrolling,
} from '~/hooks';
import { useConversationsInfiniteQuery, useTitleGeneration } from '~/data-provider';
import { Conversations } from '~/components/Conversations';
import SearchBar from '~/components/Nav/SearchBar';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

const BookmarkNav = lazy(() => import('~/components/Nav/Bookmarks/BookmarkNav'));

const ConversationsSection = memo(() => {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { isAuthenticated } = useAuthContext();
  useTitleGeneration(isAuthenticated);

  const [isChatsExpanded, setIsChatsExpanded] = useLocalStorage('chatsExpanded', true);
  const [showLoading, setShowLoading] = useState(false);
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
    setShowLoading,
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

  const toggleNav = useCallback(() => {
    if (isSmallScreen) {
      setSidebarExpanded(false);
    }
  }, [isSmallScreen, setSidebarExpanded]);

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
      className="flex h-full min-h-0 flex-col overflow-hidden pt-2"
      role="region"
      aria-label={localize('com_ui_chat_history')}
    >
      <div className="flex items-center gap-0.5">
        {hasAccessToBookmarks && (
          <Suspense fallback={null}>
            <BookmarkNav tags={tags} setTags={setTags} />
          </Suspense>
        )}
        <SearchBar isSmallScreen={isSmallScreen} />
      </div>
      {isSmallScreen && (
        <div
          role="button"
          tabIndex={0}
          aria-label={localize('com_ui_new_chat')}
          className="flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2 text-sm text-text-primary outline-none hover:bg-surface-active-alt focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
          onClick={() => {
            clearMessagesCache(queryClient, conversation?.conversationId);
            queryClient.invalidateQueries([QueryKeys.messages]);
            newConversation();
            setSidebarExpanded(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              clearMessagesCache(queryClient, conversation?.conversationId);
              queryClient.invalidateQueries([QueryKeys.messages]);
              newConversation();
              setSidebarExpanded(false);
            }
          }}
        >
          <NewChatIcon className="mr-2 h-5 w-5" />
          <span className="truncate">{localize('com_ui_new_chat')}</span>
        </div>
      )}
      <div className="flex min-h-0 flex-grow flex-col overflow-hidden">
        <Conversations
          conversations={conversations}
          moveToTop={moveToTop}
          toggleNav={toggleNav}
          containerRef={conversationsRef}
          loadMoreConversations={loadMoreConversations}
          isLoading={isFetchingNextPage || showLoading || isLoading}
          isSearchLoading={isSearchLoading}
          isChatsExpanded={isChatsExpanded}
          setIsChatsExpanded={setIsChatsExpanded}
        />
      </div>
    </div>
  );
});

ConversationsSection.displayName = 'ConversationsSection';

export default ConversationsSection;
