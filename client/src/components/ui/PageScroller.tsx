import React, { useMemo, useCallback, memo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from './Button';

interface PageButtonProps {
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}

const PageButton = memo<PageButtonProps>(({ onClick, disabled, ariaLabel, children }) => (
  <Button
    variant="outline"
    size="icon"
    aria-label={ariaLabel}
    onClick={onClick}
    disabled={disabled}
    className="h-8 w-8 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
  >
    {children}
  </Button>
));

PageButton.displayName = 'PageButton';

interface PageScrollerProps {
  currentPage?: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  showSkipButtons?: boolean;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  pageSize?: number;
}

const PageScroller: React.FC<PageScrollerProps> = ({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  showSkipButtons = false,
  className = '',
  disabled = false,
  ariaLabel = 'Page navigation',
  pageSize = 10,
}) => {
  const sanitizedCurrentPage = useMemo(
    () => Math.max(1, Math.min(Math.floor(currentPage), totalPages)),
    [currentPage, totalPages],
  );
  const sanitizedTotalPages = useMemo(() => Math.max(1, Math.floor(totalPages)), [totalPages]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (
        !disabled &&
        newPage >= 1 &&
        newPage <= sanitizedTotalPages &&
        newPage !== sanitizedCurrentPage
      ) {
        onPageChange(newPage);
      }
    },
    [disabled, sanitizedTotalPages, sanitizedCurrentPage, onPageChange],
  );

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex items-center justify-end gap-4 ${className}`}
      role="navigation"
    >
      <div
        className="flex items-center space-x-1 pr-2 text-xs font-bold text-gray-700 dark:text-gray-200 sm:text-sm"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="hidden sm:inline">Page</span>
        <span>{sanitizedCurrentPage}</span>
        <span className="select-none">/</span>
        <span>{sanitizedTotalPages}</span>
      </div>

      <div className="flex space-x-2" role="group" aria-label="Page navigation controls">
        {showSkipButtons && (
          <PageButton
            onClick={() => handlePageChange(Math.max(sanitizedCurrentPage - 10, 1))}
            disabled={sanitizedCurrentPage <= 1 || disabled}
            ariaLabel="Go back 10 pages"
          >
            <ChevronsLeft className="h-4 w-4" />
          </PageButton>
        )}

        <PageButton
          onClick={() => handlePageChange(sanitizedCurrentPage - 1)}
          disabled={sanitizedCurrentPage <= 1 || disabled}
          ariaLabel="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </PageButton>

        <PageButton
          onClick={() => handlePageChange(sanitizedCurrentPage + 1)}
          disabled={sanitizedCurrentPage >= sanitizedTotalPages || disabled}
          ariaLabel="Go to next page"
        >
          <ChevronRight className="h-4 w-4" />
        </PageButton>

        {showSkipButtons && (
          <PageButton
            onClick={() =>
              handlePageChange(Math.min(sanitizedCurrentPage + 10, sanitizedTotalPages))
            }
            disabled={sanitizedCurrentPage >= sanitizedTotalPages || disabled}
            ariaLabel="Go forward 10 pages"
          >
            <ChevronsRight className="h-4 w-4" />
          </PageButton>
        )}
      </div>
    </nav>
  );
};

export default memo(PageScroller);
