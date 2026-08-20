import { useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import { Button, Sidebar, Spinner, TooltipAnchor } from '@librechat/client';
import type { PromptGroupListResponse } from 'librechat-data-provider';
import PromptGroupSkeleton from '../lists/PromptGroupSkeleton';
import { useLocalize, useNavScrolling } from '~/hooks';
import { usePromptGroupsContext } from '~/Providers';
import { PanelContent } from '~/components/ui';
import List from '../lists/List';
import { cn } from '~/utils';
import store from '~/store';

export default function GroupSidePanel({
  children,
  footer,
  className = '',
  closePanelRef,
  onClose,
  isChatRoute: isChatRouteProp,
}: {
  children?: React.ReactNode;
  /** Rendered below the list, outside the scroll area, so it stays visible */
  footer?: React.ReactNode;
  className?: string;
  closePanelRef?: React.RefObject<HTMLButtonElement>;
  onClose?: () => void;
  isChatRoute?: boolean;
}) {
  const location = useLocation();
  const localize = useLocalize();
  const isChatRoute = isChatRouteProp ?? location.pathname?.startsWith('/c/') ?? false;

  const context = usePromptGroupsContext();

  /** A collapsed sidebar keeps this panel mounted, so stop draining pages into it */
  const sidebarExpanded = useRecoilValue(store.sidebarExpanded);

  const { containerRef } = useNavScrolling<PromptGroupListResponse>({
    nextCursor: context?.nextCursor,
    isFetchingNext: context?.isFetchingNextPage ?? false,
    fetchNextPage: context?.fetchNextPage,
    enabled: sidebarExpanded,
  });

  if (!context) {
    return null;
  }
  const { promptGroups, groupsQuery, isFetchingNextPage } = context;

  return (
    <div id="prompts-panel" className={cn('flex h-full w-full flex-col', className)}>
      {onClose && (
        <div className="flex items-center justify-end px-2 py-[0.125rem] md:py-2">
          <TooltipAnchor
            description={localize('com_nav_close_sidebar')}
            render={
              <Button
                ref={closePanelRef}
                size="icon"
                variant="outline"
                data-testid="close-prompts-panel-button"
                aria-label={localize('com_nav_close_sidebar')}
                aria-expanded={true}
                className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
                onClick={onClose}
              >
                <Sidebar />
              </Button>
            }
          />
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Sticky header: filter and toggles stay put while the list scrolls */}
        <div className="shrink-0 space-y-2 px-3 pb-2 text-text-primary">{children}</div>
        <PanelContent
          ref={containerRef}
          isLoading={!!groupsQuery.isLoading}
          skeleton={<PromptGroupSkeleton />}
          className="scrollbar-gutter-stable flex flex-col gap-2 overflow-x-hidden pb-3 pl-3 pr-1 text-text-primary"
        >
          <List groups={promptGroups} isChatRoute={isChatRoute} />
          {/* Appending the next page, so the loaded rows stay put */}
          {isFetchingNextPage && (
            <div className="flex shrink-0 justify-center py-2">
              <Spinner className="size-4" />
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {localize('com_ui_loading')}
              </span>
            </div>
          )}
        </PanelContent>
      </div>
      {footer}
    </div>
  );
}
