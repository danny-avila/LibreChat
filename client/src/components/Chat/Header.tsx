import { memo } from 'react';
import { useMediaQuery } from '@librechat/client';
import { useRecoilValue } from 'recoil';
import { useOutletContext } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { getConfigDefaults, PermissionTypes, Permissions, QueryKeys } from 'librechat-data-provider';
import type { ContextType } from '~/common';
import { HeaderNewChat, OpenSidebar } from './Menus';
import { useGetStartupConfig } from '~/data-provider';
import ExportAndShareMenu from './ExportAndShareMenu';
import BookmarkMenu from './Menus/BookmarkMenu';
import { useHasAccess, useNewConvo } from '~/hooks';
import { clearMessagesCache, cn } from '~/utils';
import store from '~/store';

// BKL: 채팅 대기화면 헤더에서 노출하지 않는 컴포넌트들.
// (모델 선택, 프리셋, 다중 응답 대화 추가, 비밀 대화)
// 제품 요구상 BKL DB AI 는 단일 모델 (bkl-search) + 단일 세션이라 불필요.
const defaultInterface = getConfigDefaults().interface;

function Header() {
  const { data: startupConfig } = useGetStartupConfig();
  const queryClient = useQueryClient();
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));

  // BKL: interfaceConfig 는 presets 분기 제거로 unused. defaultInterface import 도 유지하되
  // type 경고 회피용으로 빈 useMemo 만 남기지 않고 ENV-driven 분기 없이 hard-skip 함.
  void defaultInterface;

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  // BKL: MULTI_CONVO / TEMPORARY_CHAT 권한 hooks 는 제거 (UI 자체 숨김)

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const handleHomeClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      window.open('/c/new', '_blank');
      return;
    }
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
  };

  return (
    <div className="via-presentation/70 md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 absolute top-0 z-10 flex h-14 w-full items-center justify-between bg-gradient-to-b from-presentation to-transparent p-2 font-semibold text-text-primary 2xl:via-transparent">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="mx-1 flex items-center">
          <AnimatePresence initial={false}>
            {!navVisible && (
              <motion.div
                className="flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                key="header-buttons"
              >
                <OpenSidebar setNavVisible={setNavVisible} className="max-md:hidden" />
                <HeaderNewChat />
                <button
                  type="button"
                  aria-label="BKL DB AI 홈"
                  className="flex h-9 items-center gap-2 rounded-xl border border-border-light bg-presentation px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-active-alt"
                  onClick={handleHomeClick}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
                    <img src="/assets/bkl-logo.png" alt="" className="w-5 object-contain" />
                  </span>
                  <span className="hidden sm:inline">BKL DB AI</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {!(navVisible && isSmallScreen) && (
            <div
              className={cn(
                'flex items-center gap-2',
                !isSmallScreen ? 'transition-all duration-200 ease-in-out' : '',
                !navVisible && !isSmallScreen ? 'pl-2' : '',
              )}
            >
              {/* BKL: ModelSelector / PresetsMenu / AddMultiConvo / TemporaryChat 비활성 */}
              {hasAccessToBookmarks === true && <BookmarkMenu />}
              {isSmallScreen && (
                <ExportAndShareMenu
                  isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
                />
              )}
            </div>
          )}
        </div>

        {!isSmallScreen && (
          <div className="flex items-center gap-2">
            <ExportAndShareMenu
              isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
            />
            {/* BKL: TemporaryChat 비활성 */}
          </div>
        )}
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}

const MemoizedHeader = memo(Header);
MemoizedHeader.displayName = 'Header';

export default MemoizedHeader;
