import { memo } from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { InfoHoverCard, ESide } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type SteerReceiptState = 'sending' | 'delivered' | 'interrupting' | 'applied';

/** Amber-500 is the steering identity (the in-flight Zap), but it reads weak
 *  on white; 600 carries the same identity at legible contrast in light. */
const AMBER_ICON = 'text-amber-600 dark:text-amber-500';
const AMBER_DOT = 'bg-amber-600 dark:bg-amber-500';

/**
 * Delivery receipt for a steered message: iMessage-style checkmarks whose
 * every state is driven by an event the protocol already emits, so a check
 * only ever asserts what the server confirmed.
 *
 * - `sending`: POST in flight, no check — a muted label so the status line
 *   exists from the first frame instead of flickering in.
 * - `delivered`: the 202 durably queued it (one gray check).
 * - `interrupting`: asked to seal generation at the next safe boundary — the
 *   amber label and pulsing dot say "working, not stuck". Until the arm is
 *   server-confirmed (`confirmed` false) the label shows without its check.
 * - `applied`: the running response durably absorbed the words (double check,
 *   persistent). It stays lit amber only while the owning response is still
 *   generating — the window where "did it land" is the question — then
 *   settles to the same muted gray as the timestamp, so a conversation full
 *   of historical steers doesn't glow forever.
 *
 * The hover explanations render through the shared `InfoHoverCard` with the
 * receipt as the trigger, so the info text doubles as the accessible name.
 */
const SteerReceipt = memo(function SteerReceipt({
  state,
  live = false,
  confirmed = true,
  animateIn = false,
  className,
}: {
  state: SteerReceiptState;
  /** Applied only: the owning response is still generating, so the receipt is
   *  the newest thing on screen and keeps the amber steering identity. Off
   *  (settled, reload, share, search) it dims to the timestamp gray. */
  live?: boolean;
  /** Server confirmation of the underlying enqueue/arm; an interrupt awaiting
   *  its ACK shows the label and pulse without a check. */
  confirmed?: boolean;
  /** Plays the one-shot draw-in at the live chip→inline hand-off only. */
  animateIn?: boolean;
  className?: string;
}) {
  const localize = useLocalize();

  if (state === 'sending') {
    return (
      <span
        data-testid="steer-receipt"
        data-receipt-state="sending"
        className={cn('text-xs text-text-secondary', className)}
      >
        {localize('com_ui_steer_sending')}
      </span>
    );
  }

  if (state === 'applied') {
    return (
      <span
        data-testid="steer-receipt"
        data-receipt-state="applied"
        data-receipt-live={live ? 'true' : undefined}
        className={cn('flex items-center', className)}
      >
        <InfoHoverCard side={ESide.Top} text={localize('com_ui_steer_applied_info')}>
          <CheckCheck
            className={cn(
              'h-4 w-4 transition-colors duration-theme-normal motion-reduce:transition-none',
              live ? AMBER_ICON : 'text-text-secondary',
              animateIn && 'ease-out animate-in fade-in-0 zoom-in-50 motion-reduce:animate-none',
            )}
            aria-hidden="true"
          />
        </InfoHoverCard>
      </span>
    );
  }

  const interrupting = state === 'interrupting';
  return (
    <span
      data-testid="steer-receipt"
      data-receipt-state={state}
      className={cn('flex items-center', className)}
    >
      <InfoHoverCard
        side={ESide.Top}
        text={localize(
          interrupting ? 'com_ui_steer_interrupting_info' : 'com_ui_steer_delivered_info',
        )}
      >
        <span className="flex items-center gap-1.5">
          {interrupting && (
            <span
              className={cn('h-1.5 w-1.5 rounded-full motion-safe:animate-pulse', AMBER_DOT)}
              aria-hidden="true"
            />
          )}
          {(!interrupting || confirmed) && (
            <Check
              className={cn('h-4 w-4', interrupting ? AMBER_ICON : 'text-text-secondary')}
              aria-hidden="true"
            />
          )}
          <span
            className={cn(
              'text-xs',
              interrupting ? cn('font-medium', AMBER_ICON) : 'text-text-secondary',
            )}
          >
            {localize(interrupting ? 'com_ui_steer_in_flight_preempt' : 'com_ui_steer_delivered')}
          </span>
        </span>
      </InfoHoverCard>
    </span>
  );
});

export default SteerReceipt;
