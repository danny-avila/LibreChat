import { memo } from 'react';
import { Button, ThemeSelector } from '~/components/ui';
import { useLocalize } from '~/hooks';

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
    <>
      <div className="flex gap-2">{!isChatRoute && <ThemeSelector returnThemeOnly={true} />}</div>
      <div
        className="flex items-center justify-between gap-2"
        role="navigation"
        aria-label="Pagination"
      >
        <Button variant="outline" size="sm" onClick={() => prevPage()} disabled={!hasPreviousPage}>
          {localize('com_ui_prev')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => nextPage()}
          disabled={!hasNextPage || isFetching}
        >
          {localize('com_ui_next')}
        </Button>
      </div>
    </>
  );
}

export default memo(PanelNavigation);
