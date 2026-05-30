import { memo } from 'react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

function PanelNavigation({
  onPrevious,
  onNext,
  hasNextPage,
  hasPreviousPage,
  isLoading,
  children,
}: {
  onPrevious: () => void;
  onNext: () => void;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading?: boolean;
  isChatRoute: boolean;
  children?: React.ReactNode;
}) {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      <div className="flex gap-2 pl-1">{children}</div>
      <nav className="flex items-center gap-2" aria-label={localize('com_ui_pagination')}>
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={!hasPreviousPage || isLoading}
          aria-label={localize('com_ui_prev')}
        >
          {localize('com_ui_prev')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!hasNextPage || isLoading}
          aria-label={localize('com_ui_next')}
        >
          {localize('com_ui_next')}
        </Button>
      </nav>
    </div>
  );
}

export default memo(PanelNavigation);
