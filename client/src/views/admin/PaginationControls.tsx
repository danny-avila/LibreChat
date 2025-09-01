import React from 'react';
import { Button } from '~/components/ui/Button';
import { ArrowLeft, ArrowRight, RefreshCcw } from 'lucide-react';
import { cn } from '~/utils';

interface PaginationControlsProps {
  page: number;
  total: number;
  limit: number;
  setPage: (fn: (p: number) => number) => void;
  onRefresh?: () => void;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  page,
  total,
  limit,
  setPage,
  onRefresh,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border border-gray-200 rounded-md bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="text-sm text-gray-500">
        Page {page} / {totalPages} ({total} items)
      </div>

      <div className="flex items-center gap-2">
        {/* Prev button */}
        <Button
          size="icon"
          variant="outline"
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
          disabled={page === 1}
          className={cn(
            'bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600',
            page === 1 ? 'opacity-50 pointer-events-none' : ''
          )}
        >
          <ArrowLeft className="h-4 w-4 text-gray-700 dark:text-gray-300" />
        </Button>

        {/* Next button */}
        <Button
          size="icon"
          variant="outline"
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          disabled={page === totalPages}
          className={cn(
            'bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600',
            page === totalPages ? 'opacity-50 pointer-events-none' : ''
          )}
        >
          <ArrowRight className="h-4 w-4 text-gray-700 dark:text-gray-300" />
        </Button>

        {/* Optional Refresh button */}
        {onRefresh && (
          <Button
            size="icon"
            variant="outline"
            onClick={onRefresh}
            className="bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            <RefreshCcw className="h-4 w-4 text-gray-700 dark:text-gray-300" />
          </Button>
        )}
      </div>
    </div>
  );
};
