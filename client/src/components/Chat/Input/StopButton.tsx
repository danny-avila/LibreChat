import { memo } from 'react';
import { TooltipAnchor } from '@librechat/client';
import { useBrand, useLocalize } from '~/hooks';
import { cn, interpolateBrandField } from '~/utils';

export default memo(function StopButton({
  stop,
  setShowStopButton,
}: {
  stop: (e: React.MouseEvent<HTMLButtonElement>) => void;
  setShowStopButton: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const { getControl } = useBrand();
  /** Additive brand overrides for automation attributes only. Native StopButton
   * has no `data-testid`/`id`, so those stay absent unless the brand sets them
   * (a no-op for non-branded deployments). Visible tooltip stays native. */
  const brand = getControl('stop_generating');

  return (
    <TooltipAnchor
      description={localize('com_nav_stop_generating')}
      render={
        <button
          type="button"
          className={cn(
            'rounded-full bg-text-primary p-1.5 text-text-primary outline-offset-4 transition-all duration-200 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10',
          )}
          aria-label={interpolateBrandField(brand?.aria) ?? localize('com_nav_stop_generating')}
          data-testid={brand?.testid ?? undefined}
          id={brand?.id ?? undefined}
          onClick={(e) => {
            setShowStopButton(false);
            stop(e);
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="icon-lg text-surface-primary"
          >
            <rect x="7" y="7" width="10" height="10" rx="1.25" fill="currentColor"></rect>
          </svg>
        </button>
      }
    ></TooltipAnchor>
  );
});
