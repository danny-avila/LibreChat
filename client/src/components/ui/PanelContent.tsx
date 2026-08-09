import React from 'react';
import type { ReactNode } from 'react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * Scrolling content region of a side panel, and the single place that decides
 * which state to draw. Pass the query's `isLoading` rather than `isFetching`:
 * a refetch that already has rows on screen should leave them alone instead of
 * replacing them with a skeleton.
 *
 * Forwards a ref to the scroll container so panels that fetch on scroll can
 * attach their listener.
 */
const PanelContent = React.forwardRef<
  HTMLDivElement,
  {
    isLoading: boolean;
    isEmpty?: boolean;
    /** Shaped like the rows it stands in for */
    skeleton: ReactNode;
    empty?: ReactNode;
    children?: ReactNode;
    className?: string;
  }
>(({ isLoading, isEmpty, skeleton, empty, children, className }, ref) => {
  const localize = useLocalize();

  const renderContent = () => {
    if (isLoading) {
      /** Skeleton rows are decorative, so a live region carries the announcement */
      return (
        <>
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {localize('com_ui_loading')}
          </span>
          {skeleton}
        </>
      );
    }
    if (isEmpty === true && empty != null) {
      return empty;
    }
    return children;
  };

  return (
    <div
      ref={ref}
      aria-busy={isLoading}
      className={cn('min-h-0 flex-1 overflow-y-auto', className)}
    >
      {renderContent()}
    </div>
  );
});

PanelContent.displayName = 'PanelContent';

export default PanelContent;
