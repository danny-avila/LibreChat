import { useLocation } from 'react-router-dom';
import { Button, Sidebar, TooltipAnchor } from '@librechat/client';
import { usePromptGroupsContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import PanelNavigation from './PanelNavigation';
import List from '../lists/List';
import { cn } from '~/utils';

export default function GroupSidePanel({
  children,
  className = '',
  closePanelRef,
  onClose,
  isChatRoute: isChatRouteProp,
}: {
  children?: React.ReactNode;
  className?: string;
  closePanelRef?: React.RefObject<HTMLButtonElement>;
  onClose?: () => void;
  isChatRoute?: boolean;
}) {
  const location = useLocation();
  const localize = useLocalize();
  const isChatRoute = isChatRouteProp ?? location.pathname?.startsWith('/c/') ?? false;

  const context = usePromptGroupsContext();
  if (!context) {
    return null;
  }
  const { promptGroups, groupsQuery, nextPage, prevPage, hasNextPage, hasPreviousPage } = context;

  return (
    <div
      id="prompts-panel"
      className={cn('flex h-full w-full flex-col md:mr-2 md:w-[450px] md:shrink-0', className)}
    >
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
      <div className="scrollbar-gutter-stable flex h-full min-h-0 flex-col gap-2 overflow-y-auto overflow-x-hidden px-3 pb-3 text-text-primary">
        <div className="shrink-0 space-y-2">{children}</div>
        <div className="flex min-h-0 flex-1 flex-col">
          <List
            groups={promptGroups}
            isLoading={!!groupsQuery.isLoading}
            isChatRoute={isChatRoute}
          />
        </div>
      </div>
      <div className={cn(isChatRoute ? 'px-3 pb-2 pt-1' : 'px-2 pb-3 pt-2 md:px-0')}>
        <PanelNavigation
          onPrevious={prevPage}
          onNext={nextPage}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          isLoading={groupsQuery.isFetching}
          isChatRoute={isChatRoute}
        />
      </div>
    </div>
  );
}
