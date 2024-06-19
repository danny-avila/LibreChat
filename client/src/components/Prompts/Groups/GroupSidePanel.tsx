import { useMemo, useState } from 'react';
import { ListFilter } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import PanelNavigation from '~/components/Prompts/Groups/PanelNavigation';
import { useMediaQuery, usePromptGroupsNav } from '~/hooks';
import List from '~/components/Prompts/Groups/List';
import { Button, Input } from '~/components/ui';
import { cn } from '~/utils';

export default function GroupSidePanel({
  children,
  isDetailView,
  className = '',
  /* usePromptGroupsNav */
  setName,
  nextPage,
  prevPage,
  isFetching,
  hasNextPage,
  promptGroups,
  hasPreviousPage,
}: {
  children?: React.ReactNode;
  isDetailView?: boolean;
  className?: string;
} & ReturnType<typeof usePromptGroupsNav>) {
  const location = useLocation();
  const [displayName, setDisplayName] = useState('');
  const isSmallerScreen = useMediaQuery('(max-width: 1024px)');
  const isChatRoute = useMemo(() => location.pathname.startsWith('/c/'), [location.pathname]);

  return (
    <div
      className={cn(
        'mr-2 flex w-full min-w-72 flex-col overflow-y-auto md:w-full lg:w-1/4 xl:w-1/4',
        isDetailView && isSmallerScreen ? 'hidden' : '',
        className,
      )}
    >
      {children}
      <div className="flex-grow overflow-y-auto">
        <div className="m-2 flex w-full flex-row justify-between">
          <div className="flex">
            <Button variant="outline" size="sm" className="h-10 w-10">
              <ListFilter className="icon-sm" />
            </Button>
            <Input
              placeholder="Filter prompts..."
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setName(e.target.value);
              }}
              className="max-w-sm dark:border-gray-500"
            />
          </div>
        </div>
        <List groups={promptGroups} isChatRoute={isChatRoute} />
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
