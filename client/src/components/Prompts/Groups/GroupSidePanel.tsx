import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import PanelNavigation from '~/components/Prompts/Groups/PanelNavigation';
import { useMediaQuery, usePromptGroupsNav } from '~/hooks';
import List from '~/components/Prompts/Groups/List';
import { cn } from '~/utils';

export default function GroupSidePanel({
  children,
  isDetailView,
  className = '',
  /* usePromptGroupsNav */
  nextPage,
  prevPage,
  isFetching,
  hasNextPage,
  groupsQuery,
  promptGroups,
  hasPreviousPage,
}: {
  children?: React.ReactNode;
  isDetailView?: boolean;
  className?: string;
} & ReturnType<typeof usePromptGroupsNav>) {
  const location = useLocation();
  const isSmallerScreen = useMediaQuery('(max-width: 1024px)');
  const isChatRoute = useMemo(() => location.pathname.startsWith('/c/'), [location.pathname]);

  return (
    <div
      className={cn(
        'mr-2 flex h-auto w-auto min-w-72 flex-col gap-2 lg:w-1/4 xl:w-1/4',
        isDetailView === true && isSmallerScreen ? 'hidden' : '',
        className,
      )}
    >
      {children}
      <div className="grow overflow-y-auto">
        <List groups={promptGroups} isChatRoute={isChatRoute} isLoading={!!groupsQuery.isLoading} />
      </div>
      <PanelNavigation
        nextPage={nextPage}
        prevPage={prevPage}
        isFetching={isFetching}
        hasNextPage={hasNextPage}
        isChatRoute={isChatRoute}
        hasPreviousPage={hasPreviousPage}
      />
    </div>
  );
}
