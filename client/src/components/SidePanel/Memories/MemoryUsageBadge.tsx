import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MemoryUsageBadgeProps {
  percentage: number;
  tokenLimit: number;
  totalTokens?: number;
  /** Custom current value for tooltip (overrides totalTokens) */
  tooltipCurrent?: number;
  /** Custom max value for tooltip (overrides tokenLimit) */
  tooltipMax?: number;
}

const getStatusColor = (pct: number): string => {
  if (pct > 90) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  }
  if (pct > 75) {
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  }
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
};

export default function MemoryUsageBadge({
  percentage,
  tokenLimit,
  totalTokens,
  tooltipCurrent,
  tooltipMax,
}: MemoryUsageBadgeProps) {
  const localize = useLocalize();

  const tokenLabel = localize('com_ui_tokens');
  const current = tooltipCurrent ?? totalTokens;
  const max = tooltipMax ?? tokenLimit;

  const tooltipText =
    current !== undefined
      ? `${current.toLocaleString()} / ${max.toLocaleString()} ${tokenLabel}`
      : `${max.toLocaleString()} ${tokenLabel}`;

  return (
    <TooltipAnchor
      description={tooltipText}
      side="top"
      render={
        <div
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
            'text-xs font-medium',
            getStatusColor(percentage),
          )}
          role="status"
          aria-label={`${localize('com_ui_usage')}: ${percentage}%`}
        >
          <span>{percentage}%</span>
          <span className="opacity-70">{localize('com_ui_used').toLowerCase()}</span>
        </div>
      }
    />
  );
}
