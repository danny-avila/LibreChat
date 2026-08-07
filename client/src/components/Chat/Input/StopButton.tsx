import { memo } from 'react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default memo(function StopButton({
  stop,
  setShowStopButton,
  canStop = true,
  hidden = false,
}: {
  stop: (e: React.MouseEvent<HTMLButtonElement>) => void;
  setShowStopButton: (value: boolean) => void;
  /** False while the abort would be a no-op (the generation epoch is not
   *  installed yet). Hiding the button then would strand the user with a run
   *  they cannot stop, so stay visible and disabled instead. */
  canStop?: boolean;
  /** Kept mounted but out of the layout (and so out of the accessibility tree)
   *  while the during-run send button owns the slot. The stop shortcut looks
   *  for this control inside the focused form, so dropping it while the user
   *  types a steer is what made the shortcut reach into another pane or do
   *  nothing at all, which is exactly when a hard stop is wanted. */
  hidden?: boolean;
}) {
  const localize = useLocalize();

  return (
    <TooltipAnchor
      description={localize('com_nav_stop_generating')}
      render={
        <button
          type="button"
          data-testid="stop-generation-button"
          className={cn(
            'flex size-9 items-center justify-center rounded-full bg-text-primary text-text-primary outline-offset-4 transition-all duration-200 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-30',
            hidden && 'hidden',
          )}
          aria-label={localize('com_nav_stop_generating')}
          disabled={!canStop}
          onClick={(e) => {
            if (!canStop) {
              return;
            }
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
            className="size-6 text-surface-primary"
          >
            <rect x="7" y="7" width="10" height="10" rx="1.25" fill="currentColor"></rect>
          </svg>
        </button>
      }
    ></TooltipAnchor>
  );
});
