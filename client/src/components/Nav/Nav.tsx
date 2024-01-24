import {
  useSearchInfiniteQuery,
  useConversationsInfiniteQuery,
} from 'librechat-data-provider/react-query';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationListResponse, TConversation } from 'librechat-data-provider';
import {
  useAuthContext,
  useMediaQuery,
  useConversation,
  useConversations,
  useLocalStorage,
} from '~/hooks';
import { TooltipProvider, Tooltip } from '~/components/ui';
import { Conversations } from '../Conversations';
import { Spinner } from '~/components/svg';
import SearchBar from './SearchBar';
import NavToggle from './NavToggle';
import NavLinks from './NavLinks';
import NewChat from './NewChat';
import { cn } from '~/utils';
import store from '~/store';

export default function Nav({ navVisible, setNavVisible }) {
  const [isToggleHovering, setIsToggleHovering] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [navWidth, setNavWidth] = useState('260px');
  const { isAuthenticated } = useAuthContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionRef = useRef<number | null>(null);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [newUser, setNewUser] = useLocalStorage('newUser', true);

  useEffect(() => {
    if (isSmallScreen) {
      setNavWidth('320px');
    } else {
      setNavWidth('260px');
    }
  }, [isSmallScreen]);

  const [, setConversations] = useState<TConversation[]>([]);
  // current page
  const [pageNumber, setPageNumber] = useState(1);
  // total pages

  // search

  const searchQuery = useRecoilValue(store.searchQuery);
  const isSearchEnabled = useRecoilValue(store.isSearchEnabled);
  const isSearching = useRecoilValue(store.isSearching);
  const { newConversation, searchPlaceholderConversation } = useConversation();

  // current conversation
  const conversation = useRecoilValue(store.conversation);

  const { conversationId } = conversation || {};
  const setSearchResultMessages = useSetRecoilState(store.searchResultMessages);
  const refreshConversationsHint = useRecoilValue(store.refreshConversationsHint);
  const { refreshConversations } = useConversations();

  const queryParameters = searchQuery
    ? { pageNumber: pageNumber.toString(), searchQuery }
    : { pageNumber: pageNumber.toString() };

  // Define as opções de configuração do hook
  const queryConfig = {
    enabled: isAuthenticated,
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSearchInfiniteQuery(
    { pageNumber: pageNumber.toString(), searchQuery: searchQuery },
    { enabled: isAuthenticated },
  );

  const conversations = data?.pages.flatMap((page) => page.conversations) || [];

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, clientHeight, scrollHeight } = containerRef.current;
      const nearBottomOfList = scrollTop + clientHeight >= scrollHeight * 0.8; // 80% scroll

      if (nearBottomOfList && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]); // Adicione outras dependências se necessário

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);
  const useAppropriateInfiniteQuery = searchQuery
    ? useSearchInfiniteQuery
    : useConversationsInfiniteQuery;

  const getConversationsQuery = useAppropriateInfiniteQuery(queryParameters, queryConfig);

  const onSearchSuccess = useCallback((data: ConversationListResponse, expectedPage?: number) => {
    const res = data;
    console.log('res', res);
    setConversations(res.conversations);
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
    if (getConversationsQuery.data) {
      onSearchSuccess(getConversationsQuery.data.pages[0]);
    }
  }, [getConversationsQuery.data, getConversationsQuery.isInitialLoading, onSearchSuccess]);
  const clearSearch = () => {
    setPageNumber(1);
    refreshConversations();
    if (conversationId == 'search') {
      newConversation();
    }
  };

  const moveToTop = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      scrollPositionRef.current = container.scrollTop;
    }
  }, [containerRef, scrollPositionRef]);

  useEffect(() => {
    if (data) {
      if (isSearching) {
        return;
      }
      let { conversations } = data.pages[0];
      let { pages } = data.pages[0];
      pages = Number(pages);

      if (pageNumber > pages) {
        setPageNumber(pages);
      } else {
        if (!isSearching) {
          conversations = conversations.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
        }

        setConversations(conversations);
        // setPages(pages);
      }
    }
  }, [data, pageNumber, isSearching]);

  useEffect(() => {
    if (!isSearching) {
      getConversationsQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, conversationId, refreshConversationsHint, conversation, data]);

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
    getConversationsQuery.isLoading && pageNumber === 1
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
                  'scrollbar-trigger relative flex h-full w-full flex-1 items-start border-white/20 transition-opacity',
                  isToggleHovering && !isSmallScreen ? 'opacity-50' : 'opacity-100',
                )}
              >
                <nav className="relative flex h-full flex-1 flex-col space-y-1 p-2">
                  <div className="mb-1 flex h-11 flex-row">
                    <NewChat toggleNav={itemToggleNav} />
                  </div>
                  {isSearchEnabled && <SearchBar clearSearch={clearSearch} />}
                  <div
                    className={`flex-1 flex-col overflow-y-auto ${
                      isHovering ? '' : 'scrollbar-transparent'
                    } border-b border-white/20`}
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                    ref={containerRef}
                  >
                    <div className="my-2 ml-2 h-px w-7 bg-white/20"></div>
                    <div className="my-1 ml-1 h-px w-7"></div>
                    <div className={containerClasses}>
                      <Conversations
                        conversations={conversations}
                        moveToTop={moveToTop}
                        toggleNav={itemToggleNav}
                      />
                    </div>
                  </div>

                  {isFetchingNextPage && <Spinner />}
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
