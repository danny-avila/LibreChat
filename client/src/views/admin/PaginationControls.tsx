import React from 'react';
import { Button } from '~/components/ui/Button';

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
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Page {page} / {Math.max(1, Math.ceil(total / limit))} ({total} items)
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
          Prev
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= Math.ceil(total / limit)}
          onClick={() => setPage(p => p + 1)}
        >
          Next
        </Button>
        {onRefresh && (
          <Button size="sm" variant="neutral" onClick={onRefresh}>
            Refresh
          </Button>
        )}
      </div>
    </div>
  );
};
