import { useCallback, useEffect, useRef, useState } from 'react';
import { useGetConversationsQuery, useSearchQuery } from '@librechat/data-provider';
import { useRecoilValue, useSetRecoilState } from 'recoil';

import Conversations from '../Conversations';
import NavLinks from './NavLinks';
import NewChat from './NewChat';
import Pages from '../Conversations/Pages';
import { Panel, Spinner } from '~/components';
import { cn } from '~/utils/';
import store from '~/store';
import { useAuthContext } from '~/hooks/AuthContext';
import useDebounce from '~/hooks/useDebounce';

export default function Nav({ navVisible, setNavVisible }) {
  const [isHovering, setIsHovering] = useState(false);
  const { isAuthenticated } = useAuthContext();
  const containerRef = useRef(null);
  const scrollPositionRef = useRef(null);

  const [conversations, setConversations] = useState([]);
  // current page
  const [pageNumber, setPageNumber] = useState(1);
  // total pages
  const [pages, setPages] = useState(1);

  // data provider
  const getConversationsQuery = useGetConversationsQuery(pageNumber, { enabled: isAuthenticated });

  // search
  const searchQuery = useRecoilValue(store.searchQuery);
  const isSearchEnabled = useRecoilValue(store.isSearchEnabled);
  const isSearching = useRecoilValue(store.isSearching);
  const { newConversation, searchPlaceholderConversation } = store.useConversation();

  // current conversation
  const conversation = useRecoilValue(store.conversation);
  const { conversationId } = conversation || {};
  const setSearchResultMessages = useSetRecoilState(store.searchResultMessages);
  const refreshConversationsHint = useRecoilValue(store.refreshConversationsHint);
  const { refreshConversations } = store.useConversations();

  const [isFetching, setIsFetching] = useState(false);

  const debouncedSearchTerm = useDebounce(searchQuery, 750);
  const searchQueryFn = useSearchQuery(debouncedSearchTerm, pageNumber, {
    enabled:
      !!debouncedSearchTerm && debouncedSearchTerm.length > 0 && isSearchEnabled && isSearching,
  });

  const onSearchSuccess = (data, expectedPage) => {
    const res = data;
    setConversations(res.conversations);
    if (expectedPage) {
      setPageNumber(expectedPage);
    }
    setPages(res.pages);
    setIsFetching(false);
    searchPlaceholderConversation();
    setSearchResultMessages(res.messages);
  };

  useEffect(() => {
    //we use isInitialLoading here instead of isLoading because query is disabled by default
    if (searchQueryFn.isInitialLoading) {
      setIsFetching(true);
    } else if (searchQueryFn.data) {
      onSearchSuccess(searchQueryFn.data);
    }
  }, [searchQueryFn.data, searchQueryFn.isInitialLoading]);

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

  const nextPage = async () => {
    moveToTop();
    setPageNumber(pageNumber + 1);
  };

  const previousPage = async () => {
    moveToTop();
    setPageNumber(pageNumber - 1);
  };

  useEffect(() => {
    if (getConversationsQuery.data) {
      if (isSearching) {
        return;
      }
      let { conversations, pages } = getConversationsQuery.data;
      if (pageNumber > pages) {
        setPageNumber(pages);
      } else {
        if (!isSearching) {
          conversations = conversations.sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
          );
        }
        setConversations(conversations);
        setPages(pages);
      }
    }
  }, [getConversationsQuery.isSuccess, getConversationsQuery.data, isSearching, pageNumber]);

  useEffect(() => {
    if (!isSearching) {
      getConversationsQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, conversationId, refreshConversationsHint]);

  const toggleNavVisible = () => {
    setNavVisible((prev) => !prev);
  };

  const containerClasses =
    getConversationsQuery.isLoading && pageNumber === 1
      ? 'flex flex-col gap-2 text-gray-100 text-sm h-full justify-center items-center'
      : 'flex flex-col gap-2 text-gray-100 text-sm';

  return (
    <>
      <div
        className="nav active dark flex-shrink-0 overflow-x-hidden bg-gray-900 transition-all duration-200 ease-in-out"
        style={{
          width: navVisible ? '260px' : '0px',
          visibility: navVisible ? 'visible' : 'hidden',
        }}
      >
        <div className="h-full w-[260px]">
          <div className="flex h-full min-h-0 flex-col ">
            <div className="scrollbar-trigger relative flex h-full w-full flex-1 items-start border-white/20">
              <nav className="relative flex h-full flex-1 flex-col space-y-1 p-2">
                <div className="mb-2 flex h-11 flex-row">
                  <NewChat />
                  <button
                    type="button"
                    className={cn(
                      'nav-close-button inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/20 text-white hover:bg-gray-500/10',
                    )}
                    onClick={toggleNavVisible}
                  >
                    <span className="sr-only">Close sidebar</span>
                    <Panel open={false} />
                  </button>
                </div>
                <div
                  className={`flex-1 flex-col overflow-y-auto ${
                    isHovering ? '' : 'scrollbar-transparent'
                  } border-b border-white/20`}
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                  ref={containerRef}
                >
                  <div className={containerClasses}>
                    {(getConversationsQuery.isLoading && pageNumber === 1) || isFetching ? (
                      <Spinner />
                    ) : (
                      <Conversations
                        conversations={conversations}
                        conversationId={conversationId}
                        moveToTop={moveToTop}
                      />
                    )}
                    <Pages
                      pageNumber={pageNumber}
                      pages={pages}
                      nextPage={nextPage}
                      previousPage={previousPage}
                    />
                  </div>
                </div>
                <NavLinks clearSearch={clearSearch} isSearchEnabled={isSearchEnabled} />
              </nav>
            </div>
          </div>
        </div>
      </div>
      {!navVisible && (
        <div className="absolute left-2 top-2 z-10 hidden md:inline-block">
          <button
            type="button"
            className="nav-open-button flex h-11 cursor-pointer items-center gap-3 rounded-md border border-black/10 bg-white p-3 text-sm text-black transition-colors duration-200 hover:bg-gray-50 dark:border-white/20 dark:bg-gray-800 dark:hover:bg-gray-700"
            onClick={toggleNavVisible}
          >
            <div className="flex items-center justify-center">
              <span className="sr-only">Open sidebar</span>
              <Panel open={true} />
            </div>
          </button>
        </div>
      )}

      <div className={'nav-mask' + (navVisible ? ' active' : '')} onClick={toggleNavVisible}></div>
    </>
  );
}
