import React, { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TooltipAnchor, MobileSidebar, Sidebar, Button } from '@librechat/client';
import { QueryKeys } from 'librechat-data-provider';
import { CLOSE_SIDEBAR_ID, OPEN_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { useLocalize, useNewConvo } from '~/hooks';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

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
  // close-sidebar 버튼과 BKL DB AI 홈 버튼을 sidebar 상단에 유지한다.
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));

  const handleToggleNav = useCallback(() => {
    toggleNav();
    // Delay focus until after the sidebar animation completes (200ms)
    setTimeout(() => {
      document.getElementById(OPEN_SIDEBAR_ID)?.focus();
    }, 250);
  }, [toggleNav]);

  const handleHomeClick = useCallback<React.MouseEventHandler<HTMLButtonElement>>(
    (e) => {
      if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
        window.open('/c/new', '_blank');
        return;
      }
      clearMessagesCache(queryClient, conversation?.conversationId);
      queryClient.invalidateQueries([QueryKeys.messages]);
      newConversation();
      navigate('/c/new', { state: { focusChat: true } });
    },
    [conversation?.conversationId, navigate, newConversation, queryClient],
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-0.5 py-[2px] md:py-2">
        <button
          type="button"
          aria-label="BKL DB AI 홈"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-text-primary transition-colors hover:bg-surface-active-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          onClick={handleHomeClick}
        >
          <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
            <img src="/assets/bkl-logo.png" alt="" className="w-6 object-contain" />
          </span>
          <span className="truncate">BKL DB AI</span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {headerButtons}
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
        </div>
      </div>
      {subHeaders != null ? subHeaders : null}
    </>
  );
}
