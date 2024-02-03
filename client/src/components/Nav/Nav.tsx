import { useParams } from 'react-router-dom';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useCallback, useEffect, useState, useMemo } from 'react';
import type { ConversationListResponse } from 'librechat-data-provider';
import {
  useMediaQuery,
  useAuthContext,
  useConversation,
  useLocalStorage,
  useNavScrolling,
  useConversations,
} from '~/hooks';
import { useSearchInfiniteQuery, useConversationsInfiniteQuery } from '~/data-provider';
import { TooltipProvider, Tooltip } from '~/components/ui';
import { Conversations } from '~/components/Conversations';
import { Spinner } from '~/components/svg';
import SearchBar from './SearchBar';
import NavToggle from './NavToggle';
import NavLinks from './NavLinks';
import NewChat from './NewChat';
import { cn } from '~/utils';
import store from '~/store';

export default function Nav({ navVisible, setNavVisible }) {
  const { conversationId } = useParams();
  const { isAuthenticated } = useAuthContext();

  const [navWidth, setNavWidth] = useState('260px');
  const [isHovering, setIsHovering] = useState(false);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [newUser, setNewUser] = useLocalStorage('newUser', true);
  const [isToggleHovering, setIsToggleHovering] = useState(false);

  useEffect(() => {
    if (isSmallScreen) {
      setNavWidth('320px');
    } else {
      setNavWidth('260px');
    }
  }, [isSmallScreen]);

  const [pageNumber, setPageNumber] = useState(1);
  const [showLoading, setShowLoading] = useState(false);

  const searchQuery = useRecoilValue(store.searchQuery);
  const isSearching = useRecoilValue(store.isSearching);
  const isSearchEnabled = useRecoilValue(store.isSearchEnabled);
  const { newConversation, searchPlaceholderConversation } = useConversation();

  const { refreshConversations } = useConversations();
  const setSearchResultMessages = useSetRecoilState(store.searchResultMessages);
  const refreshConversationsHint = useRecoilValue(store.refreshConversationsHint);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, ...convosQuery } =
    useConversationsInfiniteQuery(
      { pageNumber: pageNumber.toString() },
      { enabled: isAuthenticated },
    );

  const searchQueryRes = useSearchInfiniteQuery(
    { pageNumber: pageNumber.toString(), searchQuery: searchQuery },
    { enabled: isAuthenticated },
  );

  const { containerRef, moveToTop } = useNavScrolling({
    setShowLoading,
    hasNextPage: searchQuery ? searchQueryRes.hasNextPage : hasNextPage,
    fetchNextPage: searchQuery ? searchQueryRes.fetchNextPage : fetchNextPage,
    isFetchingNextPage: searchQuery ? searchQueryRes.isFetchingNextPage : isFetchingNextPage,
  });

  const conversations = useMemo(
    () =>
      (searchQuery ? searchQueryRes?.data : data)?.pages.flatMap((page) => page.conversations) ||
      [],
    [data, searchQuery, searchQueryRes?.data],
  );

  const onSearchSuccess = useCallback((data: ConversationListResponse, expectedPage?: number) => {
    const res = data;
    if (expectedPage) {
      setPageNumber(expectedPage);
    }
    searchPlaceholderConversation();
    setSearchResultMessages(res.messages);
    /* disabled due recoil methods not recognized as state setters */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array

  useEffect(() => {
    //we use isInitialLoading here instead of isLoading because query is disabled by default
    if (searchQueryRes.data) {
      onSearchSuccess(searchQueryRes.data.pages[0]);
    }
  }, [searchQueryRes.data, searchQueryRes.isInitialLoading, onSearchSuccess]);

  const clearSearch = () => {
    setPageNumber(1);
    refreshConversations();
    if (conversationId == 'search') {
      newConversation();
    }
  };

  // TODO: test effects of this useEffect
  // useEffect(() => {
  //   if (!isSearching) {
  //     convosQuery.refetch();
  //   }
  // }, [pageNumber, conversationId, refreshConversationsHint, data, isSearching, convosQuery]);

  const toggleNavVisible = () => {
    setNavVisible((prev: boolean) => !prev);
    if (newUser) {
      setNewUser(false);
    }
  };

  const itemToggleNav = () => {
    if (isSmallScreen) {
      toggleNavVisible();
    }
  };

  const containerClasses =
    (convosQuery.isLoading || searchQueryRes.isLoading) && pageNumber === 1
      ? 'flex flex-col gap-2 text-gray-100 text-sm h-full justify-center items-center'
      : 'flex flex-col gap-2 text-gray-100 text-sm';

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <div
          className={
            'nav active dark max-w-[320px] flex-shrink-0 overflow-x-hidden bg-black md:max-w-[260px]'
          }
          style={{
            width: navVisible ? navWidth : '0px',
            visibility: navVisible ? 'visible' : 'hidden',
            transition: 'width 0.2s, visibility 0.2s',
          }}
        >
          <div className="h-full w-[320px] md:w-[260px]">
            <div className="flex h-full min-h-0 flex-col">
              <div
                className={cn(
                  'relative flex h-full w-full flex-1 items-start border-white/20 transition-opacity',
                  isToggleHovering && !isSmallScreen ? 'opacity-50' : 'opacity-100',
                )}
              >
                <nav className="flex h-full w-full flex-col px-3 pb-3.5">
                  <div className="mb-1 flex h-11 flex-row">
                    <NewChat toggleNav={itemToggleNav} />
                  </div>
                  {isSearchEnabled && <SearchBar clearSearch={clearSearch} />}
                  <div
                    className={`-mr-2 flex-1 flex-col overflow-y-auto pr-2 transition-opacity duration-500 ${
                      isHovering ? '' : 'scrollbar-transparent'
                    } border-b border-white/20`}
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                    ref={containerRef}
                  >
                    <div className="my-1 ml-1 h-px w-7 bg-white/20"></div>

                    <div className={containerClasses}>
                      <Conversations
                        conversations={conversations}
                        moveToTop={moveToTop}
                        toggleNav={itemToggleNav}
                      />
                    </div>
                    <Spinner
                      className={cn(
                        'm-1 mx-auto mb-4 h-4 w-4',
                        isFetchingNextPage || showLoading ? 'opacity-1' : 'opacity-0',
                      )}
                    />
                  </div>

                  <NavLinks />
                </nav>
              </div>
            </div>
          </div>
        </div>
        <NavToggle
          isHovering={isToggleHovering}
          setIsHovering={setIsToggleHovering}
          onToggle={toggleNavVisible}
          navVisible={navVisible}
        />
        <div className={`nav-mask${navVisible ? ' active' : ''}`} onClick={toggleNavVisible} />
      </Tooltip>
    </TooltipProvider>
  );
}
