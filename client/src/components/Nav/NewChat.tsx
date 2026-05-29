import React, { useCallback } from 'react';
import { TooltipAnchor, MobileSidebar, Sidebar, Button } from '@librechat/client';
import { CLOSE_SIDEBAR_ID, OPEN_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { useLocalize } from '~/hooks';

// BKL: 우측의 "새 채팅" 아이콘 버튼은 sidebar 상단에서 제거. "문서 검색" 과
// 같은 행 스타일의 row 로 FavoritesList 상단에 노출됨 (Favorites/FavoritesList.tsx).

export default function NewChat({
  toggleNav,
  subHeaders,
  headerButtons,
}: {
  index?: number;
  toggleNav: () => void;
  isSmallScreen?: boolean;
  subHeaders?: React.ReactNode;
  headerButtons?: React.ReactNode;
}) {
  // BKL: "새 채팅" 클릭 핸들러는 FavoritesList 의 row 로 이동. 여기에서는
  // close-sidebar 버튼만 sidebar 상단에 유지한다.
  const localize = useLocalize();

  const handleToggleNav = useCallback(() => {
    toggleNav();
    // Delay focus until after the sidebar animation completes (200ms)
    setTimeout(() => {
      document.getElementById(OPEN_SIDEBAR_ID)?.focus();
    }, 250);
  }, [toggleNav]);

  return (
    <>
      <div className="flex items-center justify-between px-0.5 py-[2px] md:py-2">
        <TooltipAnchor
          description={localize('com_nav_close_sidebar')}
          render={
            <Button
              id={CLOSE_SIDEBAR_ID}
              size="icon"
              variant="outline"
              data-testid="close-sidebar-button"
              aria-label={localize('com_nav_close_sidebar')}
              aria-expanded={true}
              className="rounded-full border-none bg-transparent duration-0 hover:bg-surface-active-alt focus-visible:ring-inset focus-visible:ring-black focus-visible:ring-offset-0 dark:focus-visible:ring-white md:rounded-xl"
              onClick={handleToggleNav}
            >
              <Sidebar aria-hidden="true" className="max-md:hidden" />
              <MobileSidebar
                aria-hidden="true"
                className="icon-lg m-1 inline-flex items-center justify-center md:hidden"
              />
            </Button>
          }
        />
        <div className="flex gap-0.5">{headerButtons}</div>
      </div>
      {subHeaders != null ? subHeaders : null}
    </>
  );
}
