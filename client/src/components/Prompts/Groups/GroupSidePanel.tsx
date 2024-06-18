import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
// import { ListFilter } from 'lucide-react';
// import { useNavigate, useLocation } from 'react-router-dom';
import PanelNavigation from '~/components/Prompts/Groups/PanelNavigation';
import { useMediaQuery, usePromptGroupsNav } from '~/hooks';
import List from '~/components/Prompts/Groups/List';
// import { Button, Input } from '~/components/ui';
import { cn } from '~/utils';

export default function GroupSidePanel({
  children,
  isDetailView,
  className = '',
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
      <div className="flex w-full flex-row justify-between">
        {/* <div className="mx-4 flex w-2/3 flex-row justify-start gap-x-2 pr-2">
          <Button variant="ghost" className="m-0 mr-2 p-0">
          <ListFilter className="h-4 w-4" />
          </Button>
          <Input
          placeholder='Filter prompts...'
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-sm dark:border-gray-500"
          />
          </div> */}
      </div>
      {children}
      <div className="flex-grow overflow-y-auto">
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
