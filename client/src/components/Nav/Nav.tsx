// import { useSearchQuery, useGetConversationsQuery } from 'librechat-data-provider/react-query';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
// import type { TConversation, TSearchResults } from 'librechat-data-provider';
// import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
// import { useParams } from 'react-router-dom';
// import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useCallback, useEffect, useState, useMemo, memo } from 'react';
import {
  useMediaQuery,
  useAuthContext,
  useConversation,
  useLocalStorage,
  useNavScrolling,
  useConversations,
} from '~/hooks';
import { useConversationsInfiniteQuery } from '~/data-provider';
import { TooltipProvider, Tooltip } from '~/components/ui';
import { Conversations } from '~/components/Conversations';
import { useSearchContext } from '~/Providers';
import { Spinner } from '~/components/svg';
import SearchBar from './SearchBar';
import NavToggle from './NavToggle';
import NavLinks from './NavLinks';
import NewChat from './NewChat';
import { cn } from '~/utils';
import { ConversationListResponse } from 'librechat-data-provider';
import store from '~/store';
import NavLink from './NavLink';
import CheckMark from '../svg/CheckMark';

import Clipboard from '../svg/Clipboard';
import LeaderboardIcon from '../svg/LeaderboardIcon';
import NotebookIcon from '../svg/NotebookIcon';
import { useNavigate, useParams } from 'react-router-dom';
import HomeIcon from '../svg/HomeIcon';
import LightBulbIcon from '../svg/LightBulbIcon';
import ComputerIcon from '../svg/ComputerIcon';
import ProfileIcon from '../svg/UserIcon';
import { useLocalize } from '~/hooks';

const Nav = ({ navVisible, setNavVisible }) => {
  const { conversationId } = useParams();
  const { isAuthenticated } = useAuthContext();
  // const containerRef = useRef<HTMLDivElement | null>(null);
  // const scrollPositionRef = useRef<number | null>(null);
  const localize = useLocalize();

  const [navWidth, setNavWidth] = useState('260px');
  const [isHovering, setIsHovering] = useState(false);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [newUser, setNewUser] = useLocalStorage('newUser', true);
  const [isToggleHovering, setIsToggleHovering] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
  }, []);

  useEffect(() => {
    if (isSmallScreen) {
      setNavWidth('320px');
    } else {
      setNavWidth('260px');
    }
  }, [isSmallScreen]);

  const { newConversation } = useConversation();
  const [showLoading, setShowLoading] = useState(false);
  const isSearchEnabled = useRecoilValue(store.isSearchEnabled);

  const { refreshConversations } = useConversations();
  const { pageNumber, searchQuery, setPageNumber, searchQueryRes } = useSearchContext();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useConversationsInfiniteQuery(
    { pageNumber: pageNumber.toString(), isArchived: false },
    { enabled: isAuthenticated },
  );

  const [refLink, setRefLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [widget, setWidget] = useRecoilState(store.widget);
  const { user } = useAuthContext();
  const { userId } = useParams();
  const navigate = useNavigate();

  // const searchQueryFn = useSearchQuery(searchQuery, pageNumber + '', {
  //   enabled: !!(!!searchQuery && searchQuery.length > 0 && isSearchEnabled && isSearching),
  // });

  // const searchQueryRes = useSearchInfiniteQuery(
  //   { pageNumber: pageNumber.toString(), searchQuery: searchQuery, isArchived: false },
  //   { enabled: isAuthenticated && !!searchQuery.length },
  // );

  const { containerRef, moveToTop } = useNavScrolling<ConversationListResponse>({
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

  const clearSearch = () => {
    setPageNumber(1);
    refreshConversations();
    if (conversationId == 'search') {
      newConversation();
    }
  };

  const toggleNavVisible = () => {
    setNavVisible((prev: boolean) => {
      localStorage.setItem('navVisible', JSON.stringify(!prev));
      return !prev;
    });
    if (newUser) {
      setNewUser(false);
    }
  };

  const copyLinkHandler = () => {
    navigator.clipboard.writeText(refLink);
    setCopied(true);
  };

  const navigateToRegister = () => {
    if (!user && userId) {
      navigate(`/register/${userId}`);
    } else {
      navigate('/register');
    }
  };

  const openWidgetHandler = (type) => () => {
    if (
      location.pathname.substring(1, 5) !== 'chat' ||
      location.pathname.substring(0, 11) === '/chat/share'
    ) {
      newConversation();
      navigate('/c/new');
      setWidget(`${type}`);
    } else {
      setWidget(widget === `${type}` ? '' : `${type}`);
    }
  };

  const openWritingAssistantHandler = openWidgetHandler('wa');
  const openCodingAssistantHandler = openWidgetHandler('ca');
  const openAskMeAnythingHandler = openWidgetHandler('ama');
  const openLeaderboardHandler = () => navigate('/leaderboard');
  const openHomepageHandler = () => navigate('/home');
  const openProfileHandler = () => navigate(`/profile/${user.id}`);

  useEffect(() => {
    if (user) {
      setRefLink(window.location.protocol + '//' + window.location.host + `/register/${user.id}`);
    }
  }, [user]);

  useEffect(() => {
    setTimeout(() => {
      if (copied) {
        setCopied(!copied);
      }
    }, 2000);
  }, [copied]);

  const itemToggleNav = () => {
    if (isSmallScreen) {
      toggleNavVisible();
    }
  };

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <div
          className={
            'nav active max-w-[320px] flex-shrink-0 overflow-x-hidden bg-gray-50 dark:bg-gray-750 md:max-w-[260px]'
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
                  'flex h-full min-h-0 flex-col transition-opacity',
                  isToggleHovering && !isSmallScreen ? 'opacity-50' : 'opacity-100',
                )}
              >
                <div
                  className={cn(
                    'scrollbar-trigger relative h-full w-full flex-1 items-start border-white/20',
                  )}
                >
                  <nav className="flex h-full w-full flex-col px-3 pb-3.5">
                    <div
                      className={cn(
                        '-mr-2 flex-1 flex-col overflow-y-auto pr-2 transition-opacity duration-500',
                        isHovering ? '' : 'scrollbar-transparent',
                      )}
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                      ref={containerRef}
                    >
                      <NewChat
                        toggleNav={itemToggleNav}
                        subHeaders={isSearchEnabled && <SearchBar clearSearch={clearSearch} />}
                      />
                      <Conversations
                        conversations={conversations}
                        moveToTop={moveToTop}
                        toggleNav={itemToggleNav}
                      />
                      {(isFetchingNextPage || showLoading) && (
                        <Spinner
                          className={cn('m-1 mx-auto mb-4 h-4 w-4 text-black dark:text-white')}
                        />
                      )}
                    </div>
                    {user && (
                      <NavLink
                        // className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm text-black transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                        // Add an SVG or icon for the Profile link here
                        svg={() => <ProfileIcon />}
                        text={localize('com_ui_homepage')}
                        clickHandler={openProfileHandler}
                      />
                    )}
                    <NavLink
                      // className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm text-black transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                      svg={() => <HomeIcon />}
                      text={localize('com_ui_recommendation')}
                      clickHandler={user ? openHomepageHandler : navigateToRegister}
                    />
                    <NavLink
                      // className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm text-black transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                      svg={() => <NotebookIcon />}
                      text={localize('com_ui_writing_assistant')}
                      clickHandler={user ? openWritingAssistantHandler : navigateToRegister}
                    />
                    <NavLink
                      // className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm text-black transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                      svg={() => <ComputerIcon />}
                      text={localize('com_ui_coding_assistant')}
                      clickHandler={user ? openCodingAssistantHandler : navigateToRegister}
                    />
                    <NavLink
                      // className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm text-black transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                      svg={() => <LightBulbIcon />}
                      text={localize('com_ui_ask_me_anything')}
                      clickHandler={user ? openAskMeAnythingHandler : navigateToRegister}
                    />
                    <NavLink
                      // className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm text-black transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                      svg={() => <LeaderboardIcon />}
                      text={localize('com_ui_referrals_leaderboard')}
                      clickHandler={user ? openLeaderboardHandler : navigateToRegister}
                    />
                    {window.location.hostname !== 'drhu.aitok.ai' && (
                      <NavLink
                        // className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm text-black transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                        svg={() => (copied ? <CheckMark /> : <Clipboard />)}
                        text={
                          copied
                            ? localize('com_ui_copied_success')
                            : localize('com_ui_copy_invitation_link')
                        }
                        clickHandler={user ? copyLinkHandler : navigateToRegister}
                      />
                    )}
                    <NavLinks />
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </div>
        <NavToggle
          isHovering={isToggleHovering}
          setIsHovering={setIsToggleHovering}
          onToggle={toggleNavVisible}
          navVisible={navVisible}
          className="fixed left-0 top-1/2 z-40 hidden md:flex"
        />
        <div className={`nav-mask${navVisible ? ' active' : ''}`} onClick={toggleNavVisible} />
      </Tooltip>
    </TooltipProvider>
  );
};

export default memo(Nav);
