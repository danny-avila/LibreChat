import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Sidebar, Spinner, TooltipAnchor } from '@librechat/client';
import type { PromptGroupListResponse } from 'librechat-data-provider';
import { useLocalize, useNavScrolling } from '~/hooks';
import { usePromptGroupsContext } from '~/Providers';
import List from '../lists/List';
import { cn } from '~/utils';

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

  const [showLoading, setShowLoading] = useState(false);
  const context = usePromptGroupsContext();

  const { containerRef } = useNavScrolling<PromptGroupListResponse>({
    setShowLoading,
    nextCursor: context?.nextCursor,
    isFetchingNext: context?.isFetchingNextPage ?? false,
    fetchNextPage: context?.fetchNextPage,
  });

  if (!context) {
    return null;
  }
  const { promptGroups, groupsQuery, isFetchingNextPage } = context;

  return (
    <div id="prompts-panel" className={cn('flex h-full w-full flex-col', className)}>
      {onClose && (
        <div className="flex items-center justify-end px-2 py-[2px] md:py-2">
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
        <div className="shrink-0 space-y-2 px-3 pb-2 pt-2 text-text-primary">{children}</div>
        <div
          ref={containerRef}
          className="scrollbar-gutter-stable flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pl-3 pr-1 text-text-primary"
        >
          <List
            groups={promptGroups}
            isLoading={!!groupsQuery.isLoading}
            isChatRoute={isChatRoute}
          />
          {(isFetchingNextPage || showLoading) && (
            <div className="flex shrink-0 justify-center py-2">
              <Spinner className="size-4" aria-label={localize('com_ui_loading')} />
            </div>
          )}
        </div>
      </div>
      {footer}
    </div>
  );
}
