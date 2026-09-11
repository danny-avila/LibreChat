import { memo, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import {
  getConfigDefaults,
  Constants,
  PermissionTypes,
  Permissions,
} from 'librechat-data-provider';
import { OpenSidebar, PresetsMenu, NewChat, HeaderMenu } from './Menus';
import { TemporaryChat, TemporaryChatIndicator } from './TemporaryChat';
import useDrawerViewport from '~/hooks/Nav/useDrawerViewport';
import ModelSelector from './Menus/Endpoints/ModelSelector';
import { useGetStartupConfig } from '~/data-provider';
import ExportAndShareMenu from './ExportAndShareMenu';
import SubagentThreadLink from './SubagentThreadLink';
import BookmarkMenu from './Menus/BookmarkMenu';
import AddMultiConvo from './AddMultiConvo';
import { useHasAccess } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

/** Keep one DOM order while sharing the sidebar's scaled drawer breakpoint. */
function Header({
  parentConversationId,
  readOnly = false,
}: {
  parentConversationId?: string;
  readOnly?: boolean;
}) {
  const { data: startupConfig } = useGetStartupConfig();
  const navVisible = useRecoilValue(store.sidebarExpanded);
  const isSmallScreen = useDrawerViewport();

  /** The mobile row only offers a new chat when there is one to leave. Read
   *  from the route rather than the context conversation, which still holds the
   *  previous chat for a render after a history or link navigation. An unsaved
   *  conversation has no id in the route yet, so absence counts as new too. */
  const { conversationId: routeConversationId } = useParams();
  const isNewChat = routeConversationId == null || routeConversationId === Constants.NEW_CONVO;

  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const hasAccessToMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });

  const hasAccessToTemporaryChat = useHasAccess({
    permissionType: PermissionTypes.TEMPORARY_CHAT,
    permission: Permissions.USE,
  });

  /** The drawer covers the header on mobile; keep its controls out of the tab order. */
  const hiddenBehindNav = navVisible === true && isSmallScreen && 'hidden';

  return (
    <div className="absolute top-0 z-10 flex h-[3.25rem] w-full items-center gap-2 bg-gradient-to-b from-presentation via-presentation/70 to-transparent p-2 font-semibold text-text-primary md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 2xl:via-transparent">
      <div className={cn('flex-shrink-0 items-center', isSmallScreen ? 'flex' : 'hidden')}>
        <OpenSidebar testId="header-open-sidebar-button" />
      </div>

      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2',
          !isSmallScreen && 'pl-3 transition-all duration-200 ease-in-out',
          hiddenBehindNav,
        )}
      >
        {parentConversationId != null && (
          <SubagentThreadLink threadId={parentConversationId} labelClassName="hidden lg:inline" />
        )}
        {!readOnly && <ModelSelector startupConfig={startupConfig} />}
        {!readOnly && interfaceConfig.presets === true && interfaceConfig.modelSelect === true && (
          <PresetsMenu />
        )}
        {hasAccessToBookmarks === true && (
          <div className={cn('items-center', isSmallScreen ? 'hidden' : 'flex')}>
            <BookmarkMenu />
          </div>
        )}
        {hasAccessToMultiConvo === true && (
          <div className={cn('items-center', isSmallScreen ? 'hidden' : 'flex')}>
            <AddMultiConvo />
          </div>
        )}
      </div>

      <div className={cn('flex flex-shrink-0 items-center gap-2', hiddenBehindNav)}>
        {hasAccessToTemporaryChat === true && <TemporaryChatIndicator />}
        {!isNewChat && <NewChat className={isSmallScreen ? undefined : 'hidden'} />}
        <HeaderMenu
          startupConfig={startupConfig}
          className={isSmallScreen ? undefined : 'hidden'}
        />
        <div className={cn('items-center gap-2', isSmallScreen ? 'hidden' : 'flex')}>
          <ExportAndShareMenu isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false} />
          {hasAccessToTemporaryChat === true && <TemporaryChat />}
        </div>
      </div>
    </div>
  );
}

const MemoizedHeader = memo(Header);
MemoizedHeader.displayName = 'Header';

export default MemoizedHeader;
