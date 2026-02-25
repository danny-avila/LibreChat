import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Sidebar, TooltipAnchor } from '@librechat/client';
import ManagePrompts from '~/components/Prompts/ManagePrompts';
import { usePromptGroupsContext } from '~/Providers';
import List from '~/components/Prompts/Groups/List';
import PanelNavigation from './PanelNavigation';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function GroupSidePanel({
  children,
  className = '',
  closePanelRef,
  onClose,
}: {
  children?: React.ReactNode;
  className?: string;
  closePanelRef?: React.RefObject<HTMLButtonElement>;
  onClose?: () => void;
}) {
  const location = useLocation();
  const localize = useLocalize();
  const isChatRoute = useMemo(() => location.pathname?.startsWith('/c/'), [location.pathname]);

  const { promptGroups, groupsQuery, nextPage, prevPage, hasNextPage, hasPreviousPage } =
    usePromptGroupsContext();

  return (
    <div
      id="prompts-panel"
      className={cn(
        'flex h-full w-full flex-col md:mr-2 md:w-auto md:min-w-72 lg:w-1/4 xl:w-1/4',
        className,
      )}
    >
      {onClose && (
        <div className="flex items-center justify-between px-2 py-[2px] md:py-2">
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
      <div className="flex flex-1 flex-col gap-2 overflow-visible">
        {children}
        <div className={cn('relative flex h-full flex-col', isChatRoute ? '' : 'px-2 md:px-0')}>
          <List
            groups={promptGroups}
            isChatRoute={isChatRoute}
            isLoading={!!groupsQuery.isLoading}
          />
        </div>
      </div>
      <div className={cn(isChatRoute ? '' : 'px-2 pb-3 pt-2 md:px-0')}>
        <PanelNavigation
          onPrevious={prevPage}
          onNext={nextPage}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          isLoading={groupsQuery.isFetching}
          isChatRoute={isChatRoute}
        >
          {isChatRoute && <ManagePrompts className="select-none" />}
        </PanelNavigation>
      </div>
    </div>
  );
}
