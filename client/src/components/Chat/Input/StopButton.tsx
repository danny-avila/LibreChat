import { TooltipAnchor } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function StopButton({ stop, setShowStopButton, isRTL }) {
  const localize = useLocalize();

  return (
    <div
      className={cn(
        'absolute',
        isRTL
          ? 'bottom-3 left-2 md:bottom-4 md:left-4'
          : 'bottom-1 right-1.5 md:bottom-2 md:right-2.5',
      )}
    >
      <TooltipAnchor
        description={localize('com_nav_stop_generating')}
        render={
          <button
            type="button"
            className="rounded-full border-2 bg-text-primary p-0.5"
            aria-label={localize('com_nav_stop_generating')}
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
    </div>
  );
}
