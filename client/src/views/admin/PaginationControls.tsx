import React from 'react';
import { Button } from '~/components/ui/Button';
import { ArrowLeft, ArrowRight, RefreshCcw } from 'lucide-react';

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
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Page {page} / {totalPages} ({total} items)
      </div>
      <div className="flex items-center gap-2">
        {/* Prev button only if not on first page */}
        {page > 1 && (
          <Button
            size="icon"
            variant="secondary"
            onClick={() => setPage((p) => p - 1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Next button only if not on last page */}
        {page < totalPages && (
          <Button
            size="icon"
            variant="secondary"
            onClick={() => setPage((p) => p + 1)}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}

        {/* Optional Refresh button */}
        {onRefresh && (
          <Button size="icon" variant="neutral" onClick={onRefresh}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
