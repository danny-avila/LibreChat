import { useCallback, useEffect, useState, useMemo, memo, lazy, Suspense, useRef } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { InfiniteQueryObserverResult } from '@tanstack/react-query';
import type { ConversationListResponse } from 'librechat-data-provider';
import type { List } from 'react-virtualized';
import type { SidebarChatSort, SidebarOrganizationMode } from '~/components/Conversations/types';
import {
  useLocalize,
  useHasAccess,
  useAuthContext,
  useLocalStorage,
  useNavScrolling,
} from '~/hooks';
import { useConversationsInfiniteQuery, useTitleGeneration } from '~/data-provider';
import type { ChatsHeaderControls } from '~/components/Conversations/Header';
import { Conversations } from '~/components/Conversations';
import SearchBar from '~/components/Nav/SearchBar';
import ProjectConversations from '~/components/Conversations/ProjectConversations';
import store from '~/store';

const BookmarkNav = lazy(() => import('~/components/Nav/Bookmarks/BookmarkNav'));

const ConversationsSection = memo(() => {
  const localize = useLocalize();
  const navigate = useNavigate();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);
  const { isAuthenticated } = useAuthContext();
  useTitleGeneration(isAuthenticated);

  const [isChatsExpanded, setIsChatsExpanded] = useLocalStorage('chatsExpanded', true);
  const [organizationMode, setOrganizationMode] = useLocalStorage<SidebarOrganizationMode>(
    'sidebarOrganizationMode',
    'chronological',
  );
  const [chatSortBy, setChatSortBy] = useLocalStorage<SidebarChatSort>(
    'sidebarChatSortBy',
    'updatedAt',
  );
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
        sortBy: chatSortBy,
        sortDirection: 'desc',
      },
      {
        enabled: isAuthenticated && organizationMode === 'chronological',
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

  const handleOrganizationModeChange = useCallback(
    (mode: SidebarOrganizationMode) => {
      setOrganizationMode(mode);
      conversationsRef.current?.scrollToPosition(0);
    },
    [setOrganizationMode],
  );

  const handleChatSortByChange = useCallback(
    (sortBy: SidebarChatSort) => {
      setChatSortBy(sortBy);
      conversationsRef.current?.scrollToPosition(0);
    },
    [setChatSortBy],
  );

  const handleNewProject = useCallback(() => {
    navigate('/projects?new=1');
    toggleNav();
  }, [navigate, toggleNav]);

  const chatsHeaderControls = useMemo<ChatsHeaderControls>(
    () => ({
      organizationMode,
      chatSortBy,
      onOrganizationModeChange: handleOrganizationModeChange,
      onChatSortByChange: handleChatSortByChange,
      onNewProject: handleNewProject,
    }),
    [
      organizationMode,
      chatSortBy,
      handleOrganizationModeChange,
      handleChatSortByChange,
      handleNewProject,
    ],
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
      className="flex h-full min-h-0 flex-col overflow-hidden pb-3"
      role="region"
      aria-label={localize('com_ui_chat_history')}
    >
      <div className="flex items-center gap-0.5 px-3">
        {hasAccessToBookmarks && (
          <Suspense fallback={null}>
            <BookmarkNav tags={tags} setTags={setTags} />
          </Suspense>
        )}
        {search.enabled && <SearchBar isSmallScreen={isSmallScreen} />}
      </div>
      <div className="flex min-h-0 flex-grow flex-col overflow-hidden">
        {organizationMode === 'chronological' ? (
          <Conversations
            conversations={conversations}
            moveToTop={moveToTop}
            toggleNav={toggleNav}
            containerRef={conversationsRef}
            loadMoreConversations={loadMoreConversations}
            isLoading={isFetchingNextPage || showLoading || isLoading}
            isSearchLoading={isSearchLoading}
            isChatsExpanded={isChatsExpanded}
            dateField={chatSortBy}
            setIsChatsExpanded={setIsChatsExpanded}
            chatsHeaderControls={chatsHeaderControls}
          />
        ) : (
          <ProjectConversations
            mode={organizationMode}
            chatSortBy={chatSortBy}
            tags={tags}
            toggleNav={toggleNav}
            isAuthenticated={isAuthenticated}
            containerRef={conversationsRef}
            isChatsExpanded={isChatsExpanded}
            setIsChatsExpanded={setIsChatsExpanded}
            chatsHeaderControls={chatsHeaderControls}
          />
        )}
      </div>
    </div>
  );
});

ConversationsSection.displayName = 'ConversationsSection';

export default ConversationsSection;
