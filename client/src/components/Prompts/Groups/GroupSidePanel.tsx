import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useMediaQuery } from '@librechat/client';
import PanelNavigation from '~/components/Prompts/Groups/PanelNavigation';
import ManagePrompts from '~/components/Prompts/ManagePrompts';
import { usePromptGroupsContext } from '~/Providers';
import List from '~/components/Prompts/Groups/List';
import { cn } from '~/utils';

export default function GroupSidePanel({
  children,
  isDetailView,
  className = '',
}: {
  children?: React.ReactNode;
  isDetailView?: boolean;
  className?: string;
}) {
  const location = useLocation();
  const isSmallerScreen = useMediaQuery('(max-width: 1024px)');
  const isChatRoute = useMemo(() => location.pathname?.startsWith('/c/'), [location.pathname]);
  const {
    nextPage,
    prevPage,
    isFetching,
    hasNextPage,
    groupsQuery,
    promptGroups,
    hasPreviousPage,
  } = usePromptGroupsContext();

  return (
    <div
      className={cn(
        'mr-2 flex h-auto w-auto min-w-72 flex-col gap-2 lg:w-1/4 xl:w-1/4',
        isDetailView === true && isSmallerScreen ? 'hidden' : '',
        className,
      )}
    >
      {children}
      <div className="flex-grow overflow-y-auto">
        <List groups={promptGroups} isChatRoute={isChatRoute} isLoading={!!groupsQuery.isLoading} />
      </div>
      <div className="flex items-center justify-between">
        {isChatRoute && <ManagePrompts className="select-none" />}
        <PanelNavigation
          nextPage={nextPage}
          prevPage={prevPage}
          isFetching={isFetching}
          hasNextPage={hasNextPage}
          isChatRoute={isChatRoute}
          hasPreviousPage={hasPreviousPage}
        />
      </div>
    </div>
  );
}
