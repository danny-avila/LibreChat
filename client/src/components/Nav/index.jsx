import { useState, useEffect, useRef, useContext } from 'react';
import NewChat from './NewChat';
import Panel from '../svg/Panel';
import Spinner from '../svg/Spinner';
import Conversations from '../Conversations';
import NavLinks from './NavLinks';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useGetConversationsQuery, useSearchQuery } from '~/data-provider';
import useDebounce from '~/hooks/useDebounce';
import store from '~/store';
import { useAuthContext } from '~/hooks/AuthContext';
import { ThemeContext } from '~/hooks/ThemeContext';
import { cn } from '~/utils/';

export default function Nav({ navVisible, setNavVisible }) {
  const [isHovering, setIsHovering] = useState(false);
  const { isAuthenticated } = useAuthContext();
  const { theme } = useContext(ThemeContext);
  const containerRef = useRef(null);

  const [conversations, setConversations] = useState([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [isFetching, setIsFetching] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);

  const getConversationsQuery = useGetConversationsQuery(pageNumber, { enabled: isAuthenticated });

  const searchQuery = useRecoilValue(store.searchQuery);
  const isSearchEnabled = useRecoilValue(store.isSearchEnabled);
  const isSearching = useRecoilValue(store.isSearching);
  const { newConversation, searchPlaceholderConversation } = store.useConversation();

  const conversation = useRecoilValue(store.conversation);
  const { conversationId } = conversation || {};
  const setSearchResultMessages = useSetRecoilState(store.searchResultMessages);
  const refreshConversationsHint = useRecoilValue(store.refreshConversationsHint);
  const { refreshConversations } = store.useConversations();

  const debouncedSearchTerm = useDebounce(searchQuery, 750);
  const searchQueryFn = useSearchQuery(debouncedSearchTerm, pageNumber, {
    enabled:
      !!debouncedSearchTerm && debouncedSearchTerm.length > 0 && isSearchEnabled && isSearching
  });

  const onSearchSuccess = (data, expectedPage) => {
    const res = data;
    setConversations(res.conversations);
    if (expectedPage) {
      setPageNumber(expectedPage);
    }
    setIsFetching(false);
    searchPlaceholderConversation();
    setSearchResultMessages(res.messages);
  };

  useEffect(() => {
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

  const moveToTop = () => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = 0;
    }
  };

  useEffect(() => {
    if (getConversationsQuery.data) {
      if (isSearching) {
        return;
      }
      let { conversations } = getConversationsQuery.data;
      if (!isSearching) {
        conversations = conversations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      setConversations((prevConversations) => [...prevConversations, ...conversations]);
      setIsFetching(false);
      if (conversations.length === 0) {
        setHasMorePages(false);
      }
    }
  }, [getConversationsQuery.isSuccess, getConversationsQuery.data, isSearching]);

  useEffect(() => {
    if (!isSearching) {
      getConversationsQuery.refetch();
    }
  }, [pageNumber, conversationId, refreshConversationsHint]);

  const toggleNavVisible = () => {
    setNavVisible((prev) => !prev);
  };

  const isMobile = () => {
    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobileRegex =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
    return mobileRegex.test(userAgent);
  };

  useEffect(() => {
    if (isMobile()) {
      setNavVisible(false);
    } else {
      setNavVisible(true);
    }
  }, [conversationId, setNavVisible]);

  const containerClasses =
    getConversationsQuery.isLoading && pageNumber === 1
      ? 'flex flex-col gap-2 text-gray-100 text-sm h-full justify-center items-center'
      : 'flex flex-col gap-2 text-gray-100 text-sm';

  const handleScroll = () => {
    const container = containerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop + clientHeight >= scrollHeight && !isFetching && hasMorePages) {
        console.log('fetching more conversations');
        setPageNumber((prevPageNumber) => prevPageNumber + 1);
        setIsFetching(true);
      }
      if (scrollTop + clientHeight < scrollHeight && isFetching) {
        setIsFetching(false);
      }
    }
  };

  useEffect(() => {
    containerRef.current.addEventListener('scroll', handleScroll);
    return () => containerRef.current.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <div className={'nav dark bg-gray-900 md:inset-y-0' + (navVisible ? ' active' : '')}>
        <div className="flex h-full min-h-0 flex-col ">
          <div className="scrollbar-trigger relative flex h-full w-full flex-1 items-start border-white/20">
            <nav className="relative flex h-full flex-1 flex-col space-y-1 p-2">
              <NewChat />
              <div
                className={`flex-1 flex-col overflow-y-auto ${
                  isHovering ? '' : 'scrollbar-transparent'
                } border-b border-white/20`}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                ref={containerRef}
              >
                <div className={containerClasses}>
                  {getConversationsQuery.isLoading && pageNumber === 1 ? (
                    <Spinner />
                  ) : (
                    <>
                      <Conversations
                        conversations={conversations}
                        conversationId={conversationId}
                        moveToTop={moveToTop}
                      />
                      <div className="flex justify-center">
                        {isFetching && <Spinner />}
                        {!isFetching && hasMorePages && (
                          <button
                            className="my-2 rounded-md bg-gray-800 px-4 py-2 text-white border border-gray-700 hover:bg-gray-700"
                            onClick={() => setPageNumber((prevPageNumber) => prevPageNumber + 1)}
                          >
                            Show More
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <NavLinks clearSearch={clearSearch} isSearchEnabled={isSearchEnabled} />
            </nav>
          </div>
        </div>
        <button
          type="button"
          className={cn(
            'nav-close-button -ml-0.5 -mt-2.5 inline-flex h-10 w-10 items-center justify-center rounded-md focus:outline-none focus:ring-white md:-ml-1 md:-mt-2.5',
            theme === 'dark'
              ? 'text-gray-500 hover:text-gray-400'
              : 'text-gray-400 hover:text-gray-500'
          )}
          onClick={toggleNavVisible}
        >
          <span className="sr-only">Close sidebar</span>
          <Panel />
        </button>
      </div>
      {!navVisible && (
        <button
          type="button"
          className="nav-open-button fixed left-2 top-0.5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-white dark:text-gray-500 dark:hover:text-gray-400"
          onClick={toggleNavVisible}
        >
          <span className="sr-only">Open sidebar</span>
          <Panel open={true} />
        </button>
      )}

      <div className={'nav-mask' + (navVisible ? ' active' : '')} onClick={toggleNavVisible}></div>
    </>
  );
}
