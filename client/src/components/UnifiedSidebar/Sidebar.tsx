import { memo, useCallback, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { SquarePen, SidebarClose } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { Skeleton, Button, TooltipAnchor, useMediaQuery } from '@librechat/client';
import type { NavLink } from '~/common';
import { CLOSE_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { useActivePanel, resolveActivePanel, DEFAULT_PANEL } from '~/Providers';
import { ChatsHeader } from '~/components/Conversations';
import ProjectsSection from '~/components/Conversations/ProjectsSection';
import SidePanelNav from '~/components/SidePanel/Nav';
import { useLocalize, useNewConvo, useAuthContext, useLocalStorage } from '~/hooks';
import { clearMessagesCache, cn } from '~/utils';
import ExpandedPanel from './ExpandedPanel';
import store from '~/store';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

/** LibreChat logomark — 5 vertical bars matching the design file. */
function LibreChatLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="0" y="0" width="2" height="16" rx="0.25" />
      <rect x="4" y="0" width="2" height="16" rx="0.25" />
      <rect x="8" y="0" width="2" height="16" rx="0.25" />
      <rect x="12" y="0" width="2" height="16" rx="0.25" />
      <rect x="16" y="6" width="2" height="4" rx="0.25" />
    </svg>
  );
}

/** Nav-row style New Chat button — sits at the top of the nav list. */
const NewChatNavRow = memo(function NewChatNavRow({
  setActive,
}: {
  setActive: (id: string) => void;
}) {
  const localize = useLocalize();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const switchToHistory = useRecoilValue(store.newChatSwitchToHistory);
  const isActive = pathname === '/c/new';

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        clearMessagesCache(queryClient, conversation?.conversationId);
        queryClient.invalidateQueries([QueryKeys.messages]);
        newConversation();
        if (switchToHistory) {
          setActive(DEFAULT_PANEL);
        }
      }
    },
    [queryClient, conversation?.conversationId, newConversation, switchToHistory, setActive],
  );

  return (
    <a
      href="/c/new"
      data-testid="new-chat-button"
      aria-label={localize('com_ui_new_chat')}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-4 text-left text-sm transition-colors',
        isActive
          ? 'bg-surface-active-alt text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
      )}
      onClick={handleClick}
    >
      <SquarePen className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="truncate">{localize('com_ui_new_chat')}</span>
    </a>
  );
});

/** A single nav row in the expanded sidebar: icon on left, localized label on right. */
const NavLabelRow = memo(function NavLabelRow({
  link,
  isActive,
  onClick,
}: {
  link: NavLink;
  isActive: boolean;
  onClick: () => void;
}) {
  const localize = useLocalize();

  return (
    <button
      type="button"
      aria-pressed={isActive}
      aria-label={localize(link.title)}
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-4 text-left transition-colors',
        isActive
          ? 'bg-surface-active-alt text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
      )}
    >
      <link.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="truncate text-sm">{localize(link.title)}</span>
    </button>
  );
});

/** Full expanded sidebar: logo header + labeled nav rows + active panel content + account */
function FullSidebar({
  links,
  onCollapse,
}: {
  links: NavLink[];
  onCollapse: () => void;
}) {
  const localize = useLocalize();
  const { active, setActive } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);
  const { isAuthenticated } = useAuthContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);
  const [isChatsExpanded, setIsChatsExpanded] = useLocalStorage('chatsExpanded', true);

  const toggleNav = useCallback(() => {
    if (isSmallScreen) {
      setSidebarExpanded(false);
    }
  }, [isSmallScreen, setSidebarExpanded]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-r border-border-light bg-white">
      {/* Header: logo + name + collapse */}
      <div className="flex flex-shrink-0 items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <LibreChatLogo className="h-5 w-5 text-text-primary" />
          <span className="text-xl font-normal text-text-primary">LibreChat</span>
        </div>
        <TooltipAnchor
          side="right"
          description={localize('com_nav_close_sidebar')}
          render={
            <Button
              id={CLOSE_SIDEBAR_ID}
              data-testid="close-sidebar-button"
              size="icon"
              variant="ghost"
              aria-label={localize('com_nav_close_sidebar')}
              aria-expanded={true}
              className="h-8 w-8 rounded-md text-text-secondary hover:text-text-primary"
              onClick={onCollapse}
            >
              <SidebarClose className="h-4 w-4" />
            </Button>
          }
        />
      </div>

      <div className="mx-4 flex-shrink-0 border-b border-border-light" />

      {/* Nav items */}
      <div className="flex flex-shrink-0 flex-col gap-0.5 px-4 py-2">
        {/* New Chat — top of nav */}
        <NewChatNavRow setActive={setActive} />

        {/* Chats + Projects — always visible */}
        <div className="px-2">
          <ChatsHeader
            isExpanded={isChatsExpanded}
            onToggle={() => setIsChatsExpanded(!isChatsExpanded)}
          />
        </div>
        <ProjectsSection toggleNav={toggleNav} isAuthenticated={isAuthenticated} />

        <div className="my-1 border-b border-border-light" />

        {links
          .filter((link) => link.id !== 'conversations')
          .map((link) => (
            <NavLabelRow
              key={link.id}
              link={link}
              isActive={link.id === effectiveActive}
              onClick={() => {
                if (link.onClick) {
                  link.onClick();
                  return;
                }
                setActive(link.id);
              }}
            />
          ))}
      </div>

      <div className="mx-3 flex-shrink-0 border-b border-border-light" />

      {/* Active panel content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <SidePanelNav links={links} />
      </div>

      {/* Account settings */}
      <div className="flex-shrink-0 px-2 py-2">
        <Suspense fallback={<Skeleton className="h-9 w-full rounded-lg" />}>
          <AccountSettings collapsed={false} />
        </Suspense>
      </div>
    </div>
  );
}

function Sidebar({
  links,
  expanded,
  onCollapse,
  onExpand,
}: {
  links: NavLink[];
  expanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  return (
    <div className="relative h-full w-full">
      {/* Icon strip — always rendered as the base layer */}
      <div className="absolute inset-y-0 left-0 w-[60px]">
        <ExpandedPanel
          links={links}
          expanded={false}
          onExpand={onExpand}
          onCollapse={onCollapse}
        />
      </div>

      {/* Full sidebar — slides in/out over the icon strip */}
      <div
        className="absolute inset-y-0 left-0 w-[260px]"
        style={{
          transform: expanded ? 'translateX(0)' : 'translateX(-260px)',
          transition: 'transform 300ms cubic-bezier(0.2, 0, 0, 1)',
        }}
        inert={!expanded ? ('' as unknown as boolean) : undefined}
      >
        <FullSidebar links={links} onCollapse={onCollapse} />
      </div>
    </div>
  );
}

export default memo(Sidebar);
