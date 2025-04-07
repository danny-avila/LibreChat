import type { InfiniteQueryObserverResult } from '@tanstack/react-query';
import type {
  ConversationListResponse,
  SearchConversationListResponse,
  TConversation,
} from 'librechat-data-provider';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Conversations } from '~/components/Conversations';
import { useConversationsInfiniteQuery } from '~/data-provider';
import {
  useAuthContext,
  useHasAccess,
  useLocalize,
  useLocalStorage,
  useMediaQuery,
  useNavScrolling,
} from '~/hooks';
import { useSearchContext } from '~/Providers';
import store from '~/store';
import { cn } from '~/utils';
import NavToggle from './NavToggle';
import NewChat from './NewChat';
import SearchBar from './SearchBar';

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
    const isSearchTyping = useRecoilValue(store.isSearchTyping);
    const { searchQuery, searchQueryRes } = useSearchContext();

    const { data, fetchNextPage, isFetchingNextPage, refetch } = useConversationsInfiniteQuery(
      {
        isArchived: false,
        tags: tags.length === 0 ? undefined : tags,
      },
      {
        enabled: isAuthenticated,
        staleTime: 30000,
        cacheTime: 300000,
      },
    );

    const computedHasNextPage = useMemo(() => {
      if (searchQuery && searchQueryRes?.data) {
        const pages = searchQueryRes.data.pages;
        return pages[pages.length - 1]?.nextCursor !== null;
      } else if (data?.pages && data.pages.length > 0) {
        const lastPage: ConversationListResponse = data.pages[data.pages.length - 1];
        return lastPage.nextCursor !== null;
      }
      return false;
    }, [searchQuery, searchQueryRes?.data, data?.pages]);

    const outerContainerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<any>(null);

    const { moveToTop } = useNavScrolling<
      ConversationListResponse | SearchConversationListResponse
    >({
      setShowLoading,
      fetchNextPage: async (options?) => {
        if (computedHasNextPage) {
          if (searchQuery && searchQueryRes) {
            const pages = searchQueryRes.data?.pages;
            if (pages && pages.length > 0 && pages[pages.length - 1]?.nextCursor !== null) {
              return searchQueryRes.fetchNextPage(options);
            }
          } else {
            return fetchNextPage(options);
          }
        }
        return Promise.resolve(
          {} as InfiniteQueryObserverResult<
            SearchConversationListResponse | ConversationListResponse,
            unknown
          >,
        );
      },
      isFetchingNext: searchQuery
        ? (searchQueryRes?.isFetchingNextPage ?? false)
        : isFetchingNextPage,
    });

    const conversations = useMemo(() => {
      if (searchQuery && searchQueryRes?.data) {
        return searchQueryRes.data.pages.flatMap(
          (page) => page.conversations ?? [],
        ) as TConversation[];
      }
      return data ? data.pages.flatMap((page) => page.conversations) : [];
    }, [data, searchQuery, searchQueryRes?.data]);

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
      if (isFetchingNextPage || !computedHasNextPage) {
        return;
      }

      fetchNextPage();
    }, [isFetchingNextPage, computedHasNextPage, fetchNextPage]);

    const subHeaders = useMemo(
      () => (
        <>
          {isSearchEnabled === true && <SearchBar isSmallScreen={isSmallScreen} />}
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
      [isSearchEnabled, hasAccessToBookmarks, isSmallScreen, tags, setTags],
    );

    const isSearchLoading =
      !!searchQuery &&
      (isSearchTyping ||
        (searchQueryRes?.isLoading ?? false) ||
        (searchQueryRes?.isFetching ?? false));

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
                    <div className="flex flex-1 flex-col" ref={outerContainerRef}>
                      <MemoNewChat
                        toggleNav={itemToggleNav}
                        isSmallScreen={isSmallScreen}
                        subHeaders={subHeaders}
                      />
                      <Conversations
                        conversations={conversations}
                        moveToTop={moveToTop}
                        toggleNav={itemToggleNav}
                        containerRef={listRef}
                        loadMoreConversations={loadMoreConversations}
                        isFetchingNextPage={isFetchingNextPage || showLoading}
                        isSearchLoading={isSearchLoading}
                      />
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

// <<<<<<< HEAD
// import { useCallback, useEffect, useState, useMemo, memo, lazy, Suspense, useRef } from 'react';
// import { useRecoilValue } from 'recoil';
// import { PermissionTypes, Permissions } from 'librechat-data-provider';
// import type {
//   TConversation,
//   ConversationListResponse,
//   SearchConversationListResponse,
// } from 'librechat-data-provider';
// import type { InfiniteQueryObserverResult } from '@tanstack/react-query';
// =======
// import type { ConversationListResponse } from 'librechat-data-provider';
// import { PermissionTypes, Permissions } from 'librechat-data-provider';
// import { memo, useCallback, useEffect, useMemo, useState } from 'react';
// import { useRecoilValue } from 'recoil';
// import { useSearchContext } from '~/Providers';
// import { Conversations } from '~/components/Conversations';
// import { Spinner } from '~/components/svg';
// import { useConversationsInfiniteQuery } from '~/data-provider';
// >>>>>>> d82f2f8f (Asdf)
// import {
//   useAuthContext,
//   useHasAccess,
//   useLocalStorage,
//   useLocalize,
//   useMediaQuery,
//   useNavScrolling,
// } from '~/hooks';
// <<<<<<< HEAD
// import { useConversationsInfiniteQuery } from '~/data-provider';
// import { Conversations } from '~/components/Conversations';
// import { useSearchContext } from '~/Providers';
// import { Spinner } from '~/components';
// =======
// import store from '~/store';
// import { cn } from '~/utils';
// import AccountSettings from './AccountSettings';
// // import BookmarkNav from './Bookmarks/BookmarkNav';
// >>>>>>> d82f2f8f (Asdf)
// import NavToggle from './NavToggle';
// import SearchBar from './SearchBar';
// import NewChat from './NewChat';
// import SearchBar from './SearchBar';

// const BookmarkNav = lazy(() => import('./Bookmarks/BookmarkNav'));
// const AccountSettings = lazy(() => import('./AccountSettings'));

// const NAV_WIDTH_DESKTOP = '260px';
// const NAV_WIDTH_MOBILE = '320px';

// const NavMask = memo(
//   ({ navVisible, toggleNavVisible }: { navVisible: boolean; toggleNavVisible: () => void }) => (
//     <div
//       id="mobile-nav-mask-toggle"
//       role="button"
//       tabIndex={0}
//       className={`nav-mask ${navVisible ? 'active' : ''}`}
//       onClick={toggleNavVisible}
//       onKeyDown={(e) => {
//         if (e.key === 'Enter' || e.key === ' ') {
//           toggleNavVisible();
//         }
//       }}
//       aria-label="Toggle navigation"
//     />
//   ),
// );

// const MemoNewChat = memo(NewChat);

// const Nav = memo(
//   ({
//     navVisible,
//     setNavVisible,
//   }: {
//     navVisible: boolean;
//     setNavVisible: React.Dispatch<React.SetStateAction<boolean>>;
//   }) => {
//     const localize = useLocalize();
//     const { isAuthenticated } = useAuthContext();

//     const [navWidth, setNavWidth] = useState(NAV_WIDTH_DESKTOP);
//     const isSmallScreen = useMediaQuery('(max-width: 768px)');
//     const [newUser, setNewUser] = useLocalStorage('newUser', true);
//     const [isToggleHovering, setIsToggleHovering] = useState(false);
//     const [showLoading, setShowLoading] = useState(false);
//     const [tags, setTags] = useState<string[]>([]);

//     const hasAccessToBookmarks = useHasAccess({
//       permissionType: PermissionTypes.BOOKMARKS,
//       permission: Permissions.USE,
//     });

//     const isSearchEnabled = useRecoilValue(store.isSearchEnabled);
//     const isSearchTyping = useRecoilValue(store.isSearchTyping);
//     const { searchQuery, searchQueryRes } = useSearchContext();

//     const { data, fetchNextPage, isFetchingNextPage, refetch } = useConversationsInfiniteQuery(
//       {
//         isArchived: false,
//         tags: tags.length === 0 ? undefined : tags,
//       },
//       {
//         enabled: isAuthenticated,
//         staleTime: 30000,
//         cacheTime: 300000,
//       },
//     );

//     const computedHasNextPage = useMemo(() => {
//       if (searchQuery && searchQueryRes?.data) {
//         const pages = searchQueryRes.data.pages;
//         return pages[pages.length - 1]?.nextCursor !== null;
//       } else if (data?.pages && data.pages.length > 0) {
//         const lastPage: ConversationListResponse = data.pages[data.pages.length - 1];
//         return lastPage.nextCursor !== null;
//       }
//       return false;
//     }, [searchQuery, searchQueryRes?.data, data?.pages]);

//     const outerContainerRef = useRef<HTMLDivElement>(null);
//     const listRef = useRef<any>(null);

// <<<<<<< HEAD
//     const { moveToTop } = useNavScrolling<
//       ConversationListResponse | SearchConversationListResponse
//     >({
//       setShowLoading,
//       fetchNextPage: async (options?) => {
//         if (computedHasNextPage) {
//           if (searchQuery && searchQueryRes) {
//             const pages = searchQueryRes.data?.pages;
//             if (pages && pages.length > 0 && pages[pages.length - 1]?.nextCursor !== null) {
//               return searchQueryRes.fetchNextPage(options);
//             }
//           } else {
//             return fetchNextPage(options);
//           }
// =======
//   const itemToggleNav = () => {
//     if (isSmallScreen) {
//       toggleNavVisible();
//     }
//   };

//   return (
//     <>
//       <div
//         data-testid="nav"
//         className={
//           'nav active max-w-[320px] flex-shrink-0 overflow-x-hidden bg-beigesecondary dark:bg-darkbeige md:max-w-[260px] border-r border-border-light'
// >>>>>>> d82f2f8f (Asdf)
//         }
//         return Promise.resolve(
//           {} as InfiniteQueryObserverResult<
//             SearchConversationListResponse | ConversationListResponse,
//             unknown
//           >,
//         );
//       },
//       isFetchingNext: searchQuery
//         ? (searchQueryRes?.isFetchingNextPage ?? false)
//         : isFetchingNextPage,
//     });

//     const conversations = useMemo(() => {
//       if (searchQuery && searchQueryRes?.data) {
//         return searchQueryRes.data.pages.flatMap(
//           (page) => page.conversations ?? [],
//         ) as TConversation[];
//       }
//       return data ? data.pages.flatMap((page) => page.conversations) : [];
//     }, [data, searchQuery, searchQueryRes?.data]);

//     const toggleNavVisible = useCallback(() => {
//       setNavVisible((prev: boolean) => {
//         localStorage.setItem('navVisible', JSON.stringify(!prev));
//         return !prev;
//       });
//       if (newUser) {
//         setNewUser(false);
//       }
//     }, [newUser, setNavVisible, setNewUser]);

//     const itemToggleNav = useCallback(() => {
//       if (isSmallScreen) {
//         toggleNavVisible();
//       }
//     }, [isSmallScreen, toggleNavVisible]);

//     useEffect(() => {
//       if (isSmallScreen) {
//         const savedNavVisible = localStorage.getItem('navVisible');
//         if (savedNavVisible === null) {
//           toggleNavVisible();
//         }
//         setNavWidth(NAV_WIDTH_MOBILE);
//       } else {
//         setNavWidth(NAV_WIDTH_DESKTOP);
//       }
//     }, [isSmallScreen, toggleNavVisible]);

//     useEffect(() => {
//       refetch();
//     }, [tags, refetch]);

//     const loadMoreConversations = useCallback(() => {
//       if (isFetchingNextPage || !computedHasNextPage) {
//         return;
//       }

//       fetchNextPage();
//     }, [isFetchingNextPage, computedHasNextPage, fetchNextPage]);

//     const subHeaders = useMemo(
//       () => (
//         <>
//           {isSearchEnabled === true && <SearchBar isSmallScreen={isSmallScreen} />}
//           {hasAccessToBookmarks && (
//             <>
//               <div className="mt-1.5" />
//               <Suspense fallback={null}>
//                 <BookmarkNav tags={tags} setTags={setTags} isSmallScreen={isSmallScreen} />
//               </Suspense>
//             </>
//           )}
//         </>
//       ),
//       [isSearchEnabled, hasAccessToBookmarks, isSmallScreen, tags, setTags],
//     );

//     const isSearchLoading =
//       !!searchQuery &&
//       (isSearchTyping ||
//         (searchQueryRes?.isLoading ?? false) ||
//         (searchQueryRes?.isFetching ?? false));

//     return (
//       <>
//         <div
//           data-testid="nav"
//           className={cn(
//             'nav active max-w-[320px] flex-shrink-0 overflow-x-hidden bg-surface-primary-alt',
//             'md:max-w-[260px]',
//           )}
//           style={{
//             width: navVisible ? navWidth : '0px',
//             visibility: navVisible ? 'visible' : 'hidden',
//             transition: 'width 0.2s, visibility 0.2s',
//           }}
//         >
//           <div className="h-full w-[320px] md:w-[260px]">
//             <div className="flex h-full flex-col">
//               <div
//                 className={cn(
//                   'flex h-full flex-col transition-opacity',
//                   isToggleHovering && !isSmallScreen ? 'opacity-50' : 'opacity-100',
//                 )}
//               >
//                 <div className="flex h-full flex-col">
//                   <nav
//                     id="chat-history-nav"
//                     aria-label={localize('com_ui_chat_history')}
//                     className="flex h-full flex-col px-3 pb-3.5"
//                   >
// <<<<<<< HEAD
//                     <div className="flex flex-1 flex-col" ref={outerContainerRef}>
//                       <MemoNewChat
//                         toggleNav={itemToggleNav}
//                         isSmallScreen={isSmallScreen}
//                         subHeaders={subHeaders}
//                       />
//                       <Conversations
//                         conversations={conversations}
//                         moveToTop={moveToTop}
//                         toggleNav={itemToggleNav}
//                         containerRef={listRef}
//                         loadMoreConversations={loadMoreConversations}
//                         isFetchingNextPage={isFetchingNextPage || showLoading}
//                         isSearchLoading={isSearchLoading}
//                       />
//                     </div>
//                     <Suspense fallback={null}>
//                       <AccountSettings />
//                     </Suspense>
//                   </nav>
//                 </div>
// =======
//                     <NewChat
//                       toggleNav={itemToggleNav}
//                       isSmallScreen={isSmallScreen}
//                       subHeaders={
//                         <>
//                           {isSearchEnabled === true && (
//                             <SearchBar
//                               setPageNumber={setPageNumber}
//                               isSmallScreen={isSmallScreen}
//                             />
//                           )}
//                           {/* {hasAccessToBookmarks === true && (
//                             <>
//                               <div className="mt-1.5" />
//                               <BookmarkNav
//                                 tags={tags}
//                                 setTags={setTags}
//                                 isSmallScreen={isSmallScreen}
//                               />
//                             </>
//                           )} */}
//                         </>
//                       }
//                     />

//                     <Conversations
//                       conversations={conversations}
//                       moveToTop={moveToTop}
//                       toggleNav={itemToggleNav}
//                     />
//                     {(isFetchingNextPage || showLoading) && (
//                       <Spinner className={cn('m-1 mx-auto mb-4 h-4 w-4 text-text-primary')} />
//                     )}
//                   </div>
//                   <AccountSettings />
//                 </nav>
// >>>>>>> d82f2f8f (Asdf)
//               </div>
//             </div>
//           </div>
//         </div>

//         <NavToggle
//           isHovering={isToggleHovering}
//           setIsHovering={setIsToggleHovering}
//           onToggle={toggleNavVisible}
//           navVisible={navVisible}
//           className="fixed left-0 top-1/2 z-40 hidden md:flex"
//         />

//         {isSmallScreen && <NavMask navVisible={navVisible} toggleNavVisible={toggleNavVisible} />}
//       </>
//     );
//   },
// );

// Nav.displayName = 'Nav';

// export default Nav;
