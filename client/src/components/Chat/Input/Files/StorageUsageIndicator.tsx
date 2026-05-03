import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { formatMB } from 'librechat-data-provider';
import { TooltipAnchor } from '@librechat/client';
import { useGetStorageUsage } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function StorageUsageIndicator() {
  const localize = useLocalize();
  const { data, refetch, isFetching } = useGetStorageUsage();
  const [refreshing, setRefreshing] = useState(false);
  const prevFetching = useRef(false);

  useEffect(() => {
    if (isFetching && !prevFetching.current) {
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 1000);
    }
    prevFetching.current = isFetching;
  }, [isFetching]);

  if (!data?.quotaEnabled || data.bytesLimit == null) {
    return null;
  }

  const used = data.bytesUsed ?? 0;
  const limit = data.bytesLimit;
  const pct = limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const ringColor =
    pct >= 90 ? 'stroke-red-500' : pct >= 70 ? 'stroke-yellow-500' : 'stroke-green-500';
  const C = 87.965; // 2 * π * r, r = 14


  return (
    <div className="flex items-center gap-2 text-xs text-text-secondary">
      <span
        className={cn(
          'transition-opacity duration-500',
          refreshing ? 'opacity-0' : 'opacity-100',
        )}
      >
        {localize('com_files_storage_usage', { 0: formatMB(used), 1: formatMB(limit) })}
      </span>
      <div
        className="relative flex h-9 w-9 items-center justify-center"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <svg viewBox="0 0 32 32" className="h-9 w-9 -rotate-90">
          <circle
            cx="16"
            cy="16"
            r="14"
            fill="none"
            strokeWidth="3"
            className="stroke-surface-tertiary"
          />
          <circle
            cx="16"
            cy="16"
            r="14"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${refreshing ? 0 : (pct / 100) * C} ${C}`}
            className={cn('transition-all duration-500', ringColor)}
          />
        </svg>
        <span
          className={cn(
            'absolute text-[10px] font-semibold tabular-nums tracking-tight text-text-primary transition-opacity duration-500',
            refreshing ? 'opacity-0' : 'opacity-100',
          )}
        >
          {pct}%
        </span>
      </div>
      <TooltipAnchor
        description={localize('com_files_storage_refresh')}
        side="top"
        render={
          <button
            type="button"
            onClick={() => refetch()}
            disabled={refreshing}
            aria-label={localize('com_files_storage_refresh')}
            className="rounded p-1 hover:bg-surface-hover disabled:opacity-50"
          >
            <RotateCw size={12} className={refreshing || isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />
    </div>
  );
}
