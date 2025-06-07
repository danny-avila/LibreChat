import { memo } from 'react';
import AutoSendPrompt from '~/components/Prompts/Groups/AutoSendPrompt';
import { Button } from '~/components';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

function PanelNavigation({
  prevPage,
  nextPage,
  hasPreviousPage,
  hasNextPage,
  isFetching,
  isChatRoute,
}: {
  prevPage: () => void;
  nextPage: () => void;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isFetching: boolean;
  isChatRoute: boolean;
}) {
  const localize = useLocalize();
  return (
    <div className={cn('my-1 flex justify-between', !isChatRoute && 'mx-2')}>
      <AutoSendPrompt className="text-xs dark:text-white" />
      <div className="mb-2 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => prevPage()}
          disabled={!hasPreviousPage}
          className="bg-transparent hover:bg-surface-hover"
        >
          {localize('com_ui_prev')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => nextPage()}
          disabled={!hasNextPage || isFetching}
          className="bg-transparent hover:bg-surface-hover"
        >
          {localize('com_ui_next')}
        </Button>
      </div>
    </div>
  );
}

export default memo(PanelNavigation);
