import { useState, useEffect, useRef } from 'react';
import NewChat from './NewChat';
import Spinner from '../svg/Spinner';
import Pages from '../Conversations/Pages';
import Conversations from '../Conversations';
import NavLinks from './NavLinks';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useGetConversationsQuery, useSearchQuery } from '~/data-provider';
import useDebounce from '~/hooks/useDebounce';
import store from '~/store';
import { useAuthContext } from '~/hooks/AuthContext';

export default function Nav({ navVisible, setNavVisible }) {
  const [isHovering, setIsHovering] = useState(false);
  const { user } = useAuthContext();
  const containerRef = useRef(null);
  const scrollPositionRef = useRef(null);

  const [conversations, setConversations] = useState([]);
  // current page
  const [pageNumber, setPageNumber] = useState(1);
  // total pages
  const [pages, setPages] = useState(1);
  
  // data provider 
  const getConversationsQuery = useGetConversationsQuery(pageNumber, { enabled: !!user });

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
    enabled: !!debouncedSearchTerm && 
    debouncedSearchTerm.length > 0 &&
    isSearchEnabled && 
    isSearching,
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
    }
    else if (searchQueryFn.data) {
      onSearchSuccess(searchQueryFn.data);
    }
  }, [searchQueryFn.data, searchQueryFn.isInitialLoading])

  const clearSearch = () => {
    setPageNumber(1);
    refreshConversations();
    if (conversationId == 'search') {
      newConversation();
    }
  };

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
          conversations = conversations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
  }, [pageNumber, conversationId, refreshConversationsHint]);

  const moveToTop = () => {
    const container = containerRef.current;
    if (container) {
      scrollPositionRef.current = container.scrollTop;
    }
  };


  const toggleNavVisible = () => {
    setNavVisible(prev => !prev);
  };

  useEffect(() => {
    setNavVisible(false);
  }, [conversationId, setNavVisible]);

  const containerClasses =
    getConversationsQuery.isLoading && pageNumber === 1
      ? 'flex flex-col gap-2 text-gray-100 text-sm h-full justify-center items-center'
      : 'flex flex-col gap-2 text-gray-100 text-sm';

  return (
    <>
      <div
        className={
          'nav dark bg-gray-900 md:fixed md:inset-y-0 md:flex md:w-[260px] md:flex-col' +
          (navVisible ? ' active' : '')
        }
      >
        <div className="flex h-full min-h-0 flex-col ">
          <div className="scrollbar-trigger flex h-full w-full flex-1 items-start border-white/20">
            <nav className="flex h-full flex-1 flex-col space-y-1 p-2">
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
              <NavLinks
                clearSearch={clearSearch}
                isSearchEnabled={isSearchEnabled}
              />
            </nav>
          </div>
        </div>
        <button
          type="button"
          className="nav-close-button -ml-0.5 -mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md text-white hover:text-gray-900 hover:text-white focus:outline-none focus:ring-white"
          onClick={toggleNavVisible}
        >
          <span className="sr-only">Open sidebar</span>
          <svg
            stroke="currentColor"
            fill="none"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line
              x1="3"
              y1="6"
              x2="15"
              y2="18"
            />
            <line
              x1="3"
              y1="18"
              x2="15"
              y2="6"
            />
          </svg>
        </button>
      </div>
      <div
        className={'nav-mask' + (navVisible ? ' active' : '')}
        onClick={toggleNavVisible}
      ></div>
    </>
  );
}
