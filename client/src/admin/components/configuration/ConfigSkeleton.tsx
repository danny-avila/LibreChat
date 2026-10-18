import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';

const BAR = 'rounded bg-(--cui-color-background-secondary)';
const ROW_WIDTHS = ['w-40', 'w-32', 'w-48', 'w-36', 'w-44', 'w-28'];

/** Placeholder rows for the tab content while the baseline loads; never editable. */
export function ConfigContentSkeleton({ rows = ROW_WIDTHS.length }: t.ConfigContentSkeletonProps) {
  const localize = useLocalize();
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-3 py-4 pr-4 motion-safe:animate-pulse"
    >
      <span className="sr-only">{localize('com_admin_config_shell_loading')}</span>
      <div className="flex flex-col gap-5 rounded-lg border border-(--cui-color-stroke-default) p-5">
        <div className={cn(BAR, 'h-4 w-32')} />
        {ROW_WIDTHS.slice(0, rows).map((width, i) => (
          <div key={i} className="flex items-center gap-6">
            <div className={cn(BAR, 'h-3.5 shrink-0', width)} />
            <div className={cn(BAR, 'h-8 max-w-80 flex-1')} />
          </div>
        ))}
      </div>
      <div className={cn(BAR, 'h-12 w-full')} />
      <div className={cn(BAR, 'h-12 w-full')} />
    </div>
  );
}

/** Route-level placeholder: tab bar, toolbar and rows (shown while the route loader runs). */
export function ConfigSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2">
      <div aria-hidden="true" className="flex items-center gap-6 py-3 motion-safe:animate-pulse">
        {['w-24', 'w-32', 'w-24', 'w-12', 'w-20', 'w-28', 'w-16'].map((width, i) => (
          <div key={i} className={cn(BAR, 'h-4 shrink-0', width)} />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="flex items-center gap-3 border-t border-(--cui-color-stroke-default) py-2 motion-safe:animate-pulse"
      >
        <div className={cn(BAR, 'h-8 w-60')} />
        <div className={cn(BAR, 'h-4 w-32')} />
      </div>
      <ConfigContentSkeleton />
    </div>
  );
}
