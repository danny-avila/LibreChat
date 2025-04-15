import { useCallback, useEffect, useState, useMemo, memo, lazy, Suspense } from 'react';
import { useRecoilValue } from 'recoil';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { ConversationListResponse } from 'librechat-data-provider';
import {
  useLocalize,
  useHasAccess,
  useMediaQuery,
  useAuthContext,
  useLocalStorage,
  useNavScrolling,
} from '~/hooks';
import { useConversationsInfiniteQuery } from '~/data-provider';
import { Conversations } from '~/components/Conversations';
import { useSearchContext } from '~/Providers';
import NavToggle from './NavToggle';
import SearchBar from './SearchBar';
import NewChat from './NewChat';
import { cn } from '~/utils';
import store from '~/store';

const BookmarkNav = lazy(() => import('./Bookmarks/BookmarkNav'));
const AccountSettings = lazy(() => import('./AccountSettings'));

const NAV_WIDTH_DESKTOP = '260px';
const NAV_WIDTH_MOBILE = '320px';

const NavMask = memo(
  ({ navVisible, toggleNavVisible }: { navVisible: boolean; toggleNavVisible: () => void }) => (
    <div
      id="mobile-nav-mask-toggle"
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
  ),
);

const MemoNewChat = memo(NewChat);

const Nav = memo(
  ({
    navVisible,
    setNavVisible,
  }: {
    navVisible: boolean;
    setNavVisible: React.Dispatch<React.SetStateAction<boolean>>;
  }) => {
    const localize = useLocalize();
    const { isAuthenticated } = useAuthContext();

    const [navWidth, setNavWidth] = useState(NAV_WIDTH_DESKTOP);
    const isSmallScreen = useMediaQuery('(max-width: 768px)');
    const [newUser, setNewUser] = useLocalStorage('newUser', true);
    const [isToggleHovering, setIsToggleHovering] = useState(false);
    const [showLoading, setShowLoading] = useState(false);
    const [tags, setTags] = useState<string[]>([]);

    const hasAccessToBookmarks = useHasAccess({
      permissionType: PermissionTypes.BOOKMARKS,
      permission: Permissions.USE,
    });

    const isSearchEnabled = useRecoilValue(store.isSearchEnabled);
    const { searchQuery, setPageNumber, searchQueryRes } = useSearchContext();

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
      useConversationsInfiniteQuery(
        {
          cursor: null,
          isArchived: false,
          tags: tags.length === 0 ? undefined : tags,
        },
        {
          enabled: isAuthenticated,
          staleTime: 30000,
          cacheTime: 300000,
        },
      );

    const { containerRef, moveToTop } = useNavScrolling<ConversationListResponse>({
      setShowLoading,
      hasNextPage: searchQuery ? searchQueryRes?.hasNextPage : hasNextPage,
      fetchNextPage: searchQuery ? searchQueryRes?.fetchNextPage : fetchNextPage,
      isFetchingNextPage: searchQuery
        ? searchQueryRes?.isFetchingNextPage ?? false
        : isFetchingNextPage,
    });

    const conversations = useMemo(
      () =>
        (searchQuery ? searchQueryRes?.data : data)?.pages.flatMap((page) => page.conversations) ||
        [],
      [data, searchQuery, searchQueryRes?.data],
    );

    const toggleNavVisible = useCallback(() => {
      setNavVisible((prev: boolean) => {
        localStorage.setItem('navVisible', JSON.stringify(!prev));
        return !prev;
      });
      if (newUser) {
        setNewUser(false);
      }
    }, [newUser, setNavVisible, setNewUser]);

    const itemToggleNav = useCallback(() => {
      if (isSmallScreen) {
        toggleNavVisible();
      }
    }, [isSmallScreen, toggleNavVisible]);

    useEffect(() => {
      if (isSmallScreen) {
        const savedNavVisible = localStorage.getItem('navVisible');
        if (savedNavVisible === null) {
          toggleNavVisible();
        }
        setNavWidth(NAV_WIDTH_MOBILE);
      } else {
        setNavWidth(NAV_WIDTH_DESKTOP);
      }
    }, [isSmallScreen, toggleNavVisible]);

    useEffect(() => {
      refetch();
    }, [tags, refetch]);

    const loadMoreConversations = useCallback(() => {
      if (isFetchingNextPage) {
        return;
      }
      if (searchQuery && searchQueryRes?.hasNextPage) {
        searchQueryRes.fetchNextPage();
      } else if (hasNextPage) {
        fetchNextPage();
      }
    }, [isFetchingNextPage, searchQuery, searchQueryRes, hasNextPage, fetchNextPage]);

    const subHeaders = useMemo(
      () => (
        <>
          {isSearchEnabled && (
            <SearchBar setPageNumber={setPageNumber} isSmallScreen={isSmallScreen} />
          )}
          {hasAccessToBookmarks && (
            <>
              <div className="mt-1.5" />
              <Suspense fallback={null}>
                <BookmarkNav tags={tags} setTags={setTags} isSmallScreen={isSmallScreen} />
              </Suspense>
            </>
          )}
        </>
      ),
      [isSearchEnabled, hasAccessToBookmarks, setPageNumber, isSmallScreen, tags, setTags],
    );

    return (
      <>
        <div
          data-testid="nav"
          className={cn(
            'nav active max-w-[320px] flex-shrink-0 overflow-x-hidden bg-surface-primary-alt',
            'md:max-w-[260px]',
          )}
          style={{
            width: navVisible ? navWidth : '0px',
            visibility: navVisible ? 'visible' : 'hidden',
            transition: 'width 0.2s, visibility 0.2s',
          }}
        >
          <div className="h-full w-[320px] md:w-[260px]">
            <div className="flex h-full flex-col">
              <div
                className={cn(
                  'flex h-full flex-col transition-opacity',
                  isToggleHovering && !isSmallScreen ? 'opacity-50' : 'opacity-100',
                )}
              >
                <div className="flex h-full flex-col">
                  <nav
                    id="chat-history-nav"
                    aria-label={localize('com_ui_chat_history')}
                    className="flex h-full flex-col px-3 pb-3.5"
                  >
                    <div className="flex flex-1 flex-col" ref={containerRef}>
                      <MemoNewChat
                        toggleNav={itemToggleNav}
                        isSmallScreen={isSmallScreen}
                        subHeaders={subHeaders}
                      />

                      <div className="flex-1">
                        <Conversations
                          conversations={conversations}
                          moveToTop={moveToTop}
                          toggleNav={itemToggleNav}
                          containerRef={containerRef}
                          loadMoreConversations={loadMoreConversations}
                          isFetchingNextPage={isFetchingNextPage}
                        />
                      </div>
                    </div>
                    <Suspense fallback={null}>
                      <AccountSettings />
                    </Suspense>
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

        {isSmallScreen && <NavMask navVisible={navVisible} toggleNavVisible={toggleNavVisible} />}
      </>
    );
  },
);

Nav.displayName = 'Nav';

export default Nav;
