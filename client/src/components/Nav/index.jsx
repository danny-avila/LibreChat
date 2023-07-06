/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef, useContext, useCallback } from 'react';
import NewChat from './NewChat';
import Panel from '../svg/Panel';
import Spinner from '../svg/Spinner';
import Pages from '../Conversations/Pages';
import Conversations from '../Conversations';
import NavLinks from './NavLinks';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useGetConversationsQuery, useSearchQuery } from '~/data-provider';
import useDebounce from '~/hooks/useDebounce';
import store from '~/store';
import { useAuthContext } from '~/hooks/AuthContext';
import { ThemeContext } from '~/hooks/ThemeContext';
import { cn } from '~/utils/';
import NavLink from './NavLink';
import CopyIcon from '../svg/CopyIcon';
import CheckMark from '../svg/CheckMark';

// import resolveConfig from 'tailwindcss/resolveConfig';
// const tailwindConfig = import('../../../tailwind.config.cjs');
// const fullConfig = resolveConfig(tailwindConfig);

// export const getBreakpointValue = (value) =>
//   +fullConfig.theme.screens[value].slice(0, fullConfig.theme.screens[value].indexOf('px'));

// export const getCurrentBreakpoint = () => {
//   let currentBreakpoint;
//   let biggestBreakpointValue = 0;
//   for (const breakpoint of Object.keys(fullConfig.theme.screens)) {
//     const breakpointValue = getBreakpointValue(breakpoint);
//     if (breakpointValue > biggestBreakpointValue && window.innerWidth >= breakpointValue) {
//       biggestBreakpointValue = breakpointValue;
//       currentBreakpoint = breakpoint;
//     }
//   }
//   return currentBreakpoint;
// };

export default function Nav({ navVisible, setNavVisible }) {
  const [isHovering, setIsHovering] = useState(false);
  const { isAuthenticated } = useAuthContext();
  const { theme, } = useContext(ThemeContext);
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

  const [refLink, setRefLink] = useState('');
  const [copied, setCopied] = useState(false);
  const { user } = useAuthContext();
  const mode = process.env.NODE_ENV;

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
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
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
  }, [pageNumber, conversationId, refreshConversationsHint]);

  const toggleNavVisible = () => {
    setNavVisible((prev) => !prev);
  };

  // useEffect(() => {
  //   let currentBreakpoint = getCurrentBreakpoint();
  //   if (currentBreakpoint === 'sm') {
  //     setNavVisible(false);
  //   } else {
  //     setNavVisible(true);
  //   }
  // }, [conversationId, setNavVisible]);

  const isMobile = () => {
    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
    return mobileRegex.test(userAgent);
  };

  useEffect(() => {
    if (isMobile()) {
      setNavVisible(false);
    } else {
      setNavVisible(true);
    }
  }, [conversationId, setNavVisible]);

  const copyLinkHandler = () => {
    navigator.clipboard.writeText(refLink);
    setCopied(true);
  }

  useEffect(() => {
    if (user) setRefLink(mode === 'dev' ? `http://localhost:3090/register/${user.id}` : `aitok.us/register/${user.id}`);
  }, [user]);

  useEffect(() => {
    setTimeout(() => {
      if (copied) setCopied(!copied);
    }, 1000);
  }, [copied])

  const containerClasses =
    getConversationsQuery.isLoading && pageNumber === 1
      ? 'flex flex-col gap-2 text-gray-100 text-sm h-full justify-center items-center'
      : 'flex flex-col gap-2 text-gray-100 text-sm';

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
              <NavLink
                className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                svg={() => copied ? <CheckMark /> : <CopyIcon />}
                text={navigator.languages[0] === 'zh-CN' ? "复制邀请链接" : "Copy invitation link"}
                clickHandler={ copyLinkHandler }
              />
              <NavLinks clearSearch={clearSearch} isSearchEnabled={isSearchEnabled} />
            </nav>
          </div>
        </div>
        <button
          type="button"
          className={cn('nav-close-button -ml-0.5 -mt-2.5 inline-flex h-10 w-10 items-center justify-center rounded-md focus:outline-none focus:ring-white md:-ml-1 md:-mt-2.5', theme === 'dark' ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-500')}
          onClick={toggleNavVisible}
        >
          <span className="sr-only">Close sidebar</span>
          <Panel/>
        </button>
      </div>
      {!navVisible && (
        <button
          type="button"
          className="nav-open-button fixed left-2 top-0.5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-white dark:text-gray-500 dark:hover:text-gray-400"
          onClick={toggleNavVisible}
        >
          <span className="sr-only">Open sidebar</span>
          <Panel open={true}/>
        </button>
      )}

      <div className={'nav-mask' + (navVisible ? ' active' : '')} onClick={toggleNavVisible}></div>
    </>
  );
}
