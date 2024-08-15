import { useCallback, useEffect, useState, useMemo, memo } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import type { ConversationListResponse } from 'librechat-data-provider';
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
import BookmarkNav from './Bookmarks/BookmarkNav';
import { useSearchContext } from '~/Providers';
import { Spinner } from '~/components/svg';
import SearchBar from './SearchBar';
import NavToggle from './NavToggle';
import NavLinks from './NavLinks';
import NewChat from './NewChat';
import { cn } from '~/utils';
import store from '~/store';

const Nav = ({ navVisible, setNavVisible }) => {
  const { conversationId } = useParams();
  const { isAuthenticated } = useAuthContext();

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
      const savedNavVisible = localStorage.getItem('navVisible');
      if (savedNavVisible === null) {
        toggleNavVisible();
      }
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
  const [tags, setTags] = useState<string[]>([]);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useConversationsInfiniteQuery(
      {
        pageNumber: pageNumber.toString(),
        isArchived: false,
        tags: tags.length === 0 ? undefined : tags,
      },
      { enabled: isAuthenticated },
    );
  useEffect(() => {
    // When a tag is selected, refetch the list of conversations related to that tag
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags]);
  const { containerRef, moveToTop } = useNavScrolling<ConversationListResponse>({
    setShowLoading,
    hasNextPage: searchQuery ? searchQueryRes.hasNextPage : hasNextPage,
    fetchNextPage: searchQuery ? searchQueryRes.fetchNextPage : fetchNextPage,
    isFetchingNextPage: searchQuery ? searchQueryRes.isFetchingNextPage : isFetchingNextPage,
  });

  const conversations = useMemo(
    () =>
      (searchQuery ? searchQueryRes.data : data)?.pages.flatMap((page) => page.conversations) || [],
    [data, searchQuery, searchQueryRes.data],
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

  const itemToggleNav = () => {
    if (isSmallScreen) {
      toggleNavVisible();
    }
  };

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <div
          data-testid="nav"
          className={
            'nav active max-w-[320px] flex-shrink-0 overflow-x-hidden bg-gray-50 dark:bg-gray-850 md:max-w-[260px]'
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
                  <nav
                    id="chat-history-nav"
                    aria-label="chat-history-nav"
                    className="flex h-full w-full flex-col px-3 pb-3.5"
                  >
                    <div
                      className={cn(
                        '-mr-2 flex-1 flex-col overflow-y-auto pr-2 transition-opacity duration-500',
                        isHovering ? '' : 'scrollbar-transparent',
                      )}
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                      ref={containerRef}
                    >
                      {isSmallScreen == true ? (
                        <div className="pt-3.5">
                          {isSearchEnabled === true && (
                            <SearchBar clearSearch={clearSearch} isSmallScreen={isSmallScreen} />
                          )}
                          <BookmarkNav tags={tags} setTags={setTags} />
                        </div>
                      ) : (
                        <NewChat
                          toggleNav={itemToggleNav}
                          subHeaders={
                            <>
                              {isSearchEnabled === true && (
                                <SearchBar
                                  clearSearch={clearSearch}
                                  isSmallScreen={isSmallScreen}
                                />
                              )}
                              <BookmarkNav tags={tags} setTags={setTags} />
                            </>
                          }
                        />
                      )}

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
        <div
          role="button"
          tabIndex={0}
          className={`nav-mask ${navVisible ? 'active' : ''}`}
          onClick={toggleNavVisible}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              toggleNavVisible();
            }
          }}
          aria-label="Toggle navigation"
        />
      </Tooltip>
    </TooltipProvider>
  );
};

export default memo(Nav);
