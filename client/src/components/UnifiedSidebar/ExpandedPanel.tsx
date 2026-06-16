import { memo, useCallback, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilValue } from 'recoil';
import { SquarePen, SidebarClose, SidebarOpen } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { Skeleton, Button, TooltipAnchor } from '@librechat/client';
import type { NavLink } from '~/common';
import { CLOSE_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { useActivePanel, resolveActivePanel, DEFAULT_PANEL } from '~/Providers';
import { useLocalize, useNewConvo } from '~/hooks';
import { clearMessagesCache, cn } from '~/utils';
import store from '~/store';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

/** ClickHouse logo — 5 bars with currentColor fill, shown on hover of the open button. */
function ClickHouseLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 54 54"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect width="5.9998" height="53.9982" rx="1.45943" fill="currentColor" />
      <rect x="12" width="5.9998" height="53.9982" rx="1.45943" fill="currentColor" />
      <rect x="24.001" width="5.9998" height="53.9982" rx="1.45943" fill="currentColor" />
      <rect x="35.998" width="5.9998" height="53.9982" rx="1.45943" fill="currentColor" />
      <rect x="48.001" y="21.0005" width="5.9998" height="11.9996" rx="1.45943" fill="currentColor" />
    </svg>
  );
}

const NewChatButton = memo(function NewChatButton({
  setActive,
}: {
  setActive: (id: string) => void;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const switchToHistory = useRecoilValue(store.newChatSwitchToHistory);

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
    <TooltipAnchor
      side="right"
      description={localize('com_ui_new_chat')}
      render={
        <a
          href="/c/new"
          data-testid="new-chat-button"
          aria-label={localize('com_ui_new_chat')}
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-surface-hover"
          onClick={handleClick}
        >
          <SquarePen className="h-4 w-4 text-text-secondary" />
        </a>
      }
    />
  );
});

const NavIconButton = memo(function NavIconButton({
  link,
  isActive,
  expanded,
  setActive,
  onExpand,
  onCollapse,
}: {
  link: NavLink;
  isActive: boolean;
  expanded: boolean;
  setActive: (id: string) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  const localize = useLocalize();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (link.onClick) {
        link.onClick(e);
        return;
      }
      if (isActive && expanded) {
        onCollapse?.();
        return;
      }
      if (!isActive) {
        setActive(link.id);
      }
      if (!expanded) {
        onExpand?.();
      }
    },
    [link, isActive, setActive, expanded, onExpand, onCollapse],
  );

  return (
    <TooltipAnchor
      description={localize(link.title)}
      side="right"
      render={
        <Button
          variant="ghost"
          aria-label={localize(link.title)}
          aria-pressed={isActive}
          className={cn(
            'h-[48px] w-full rounded-none flex items-center justify-center',
            isActive
              ? 'bg-surface-active-alt text-text-primary'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
          )}
          onClick={handleClick}
        >
          <link.icon className="h-5 w-5" aria-hidden="true" />
        </Button>
      }
    />
  );
});

function ExpandedPanel({
  links,
  expanded = true,
  onCollapse,
  onExpand,
}: {
  links: NavLink[];
  expanded?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}) {
  const localize = useLocalize();
  const { active, setActive } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);

  const toggleLabel = expanded ? 'com_nav_close_sidebar' : 'com_nav_open_sidebar';
  const toggleClick = expanded ? onCollapse : onExpand;

  return (
    <div className="flex h-full w-[60px] flex-shrink-0 flex-col items-center gap-1 border-r border-border-light bg-white py-2">
      <TooltipAnchor
        side="right"
        description={localize(toggleLabel)}
        render={
          <Button
            id={expanded ? CLOSE_SIDEBAR_ID : undefined}
            data-testid={expanded ? 'close-sidebar-button' : 'open-sidebar-button'}
            size="icon"
            variant="ghost"
            aria-label={localize(toggleLabel)}
            aria-expanded={expanded}
            className="group h-8 w-8 rounded-md text-text-secondary hover:text-text-primary"
            onClick={toggleClick}
          >
            {expanded ? (
              <SidebarClose aria-hidden="true" className="h-4 w-4" />
            ) : (
              <>
                {/* Default: expand arrow; Hover: ClickHouse logo */}
                <SidebarOpen aria-hidden="true" className="h-4 w-4 group-hover:hidden" />
                <ClickHouseLogo className="hidden h-4 w-4 group-hover:block" />
              </>
            )}
          </Button>
        }
      />
      <NewChatButton setActive={setActive} />

      <div className="my-1 w-6 border-b border-border-light" />

      <div className="flex w-full flex-col overflow-y-auto">
        {links.map((link) => (
          <NavIconButton
            key={link.id}
            link={link}
            isActive={link.id === effectiveActive}
            expanded={expanded ?? true}
            setActive={setActive}
            onExpand={onExpand}
            onCollapse={onCollapse}
          />
        ))}
      </div>

      <div className="mt-auto">
        <Suspense fallback={<Skeleton className="h-8 w-8 rounded-md" />}>
          <AccountSettings collapsed />
        </Suspense>
      </div>
    </div>
  );
}

export default memo(ExpandedPanel);
