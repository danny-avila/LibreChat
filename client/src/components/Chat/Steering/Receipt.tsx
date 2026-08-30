import { memo, useState } from 'react';
import { Check, CheckCheck } from 'lucide-react';
import {
  ESide,
  HoverCard,
  HoverCardPortal,
  HoverCardTrigger,
  HoverCardContent,
} from '@librechat/client';
import type { ReactNode } from 'react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type SteerReceiptState = 'sending' | 'delivered' | 'interrupting' | 'applied';

/** Amber-500 is the steering identity (the in-flight Zap), but it reads weak
 *  on white; 600 carries the same identity at legible contrast in light. */
const AMBER_ICON = 'text-amber-600 dark:text-amber-500';
const AMBER_DOT = 'bg-amber-600 dark:bg-amber-500';

/** The `InfoHoverCard` pattern with the receipt as the trigger instead of the
 *  stock "?" icon: focus opens the card, and the explanation doubles as the
 *  accessible name so the marks never read as bare glyphs. */
function ReceiptHover({ text, children }: { text: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <HoverCard openDelay={50} open={isOpen} onOpenChange={setIsOpen}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-help items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2"
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          aria-label={text}
        >
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side={ESide.Top} className="z-[999] w-64">
          <span className="text-sm text-text-secondary">{text}</span>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}

/**
 * Delivery receipt for a steered message: iMessage-style checkmarks whose
 * every state is driven by an event the protocol already emits, so a check
 * only ever asserts what the server confirmed.
 *
 * - `sending`: POST in flight, no check — a muted label so the status line
 *   exists from the first frame instead of flickering in.
 * - `delivered`: the 202 durably queued it (one gray check).
 * - `interrupting`: armed to seal generation at the next safe boundary — one
 *   amber check plus a pulsing dot that says "working, not stuck". While the
 *   arm is still unconfirmed (`confirmed` false) the label shows without its
 *   check.
 * - `applied`: the running response durably absorbed the words (amber double
 *   check, persistent — it renders identically live, on reload, and in
 *   shared/search views).
 */
const SteerReceipt = memo(function SteerReceipt({
  state,
  confirmed = true,
  animateIn = false,
  className,
}: {
  state: SteerReceiptState;
  /** Server confirmation of the underlying enqueue; an interrupt awaiting its
   *  202 shows the label and pulse without a check. */
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
        className={cn('flex items-center', className)}
      >
        <ReceiptHover text={localize('com_ui_steer_applied_info')}>
          <CheckCheck
            className={cn('h-4 w-4', AMBER_ICON, animateIn && 'steer-receipt-live')}
            aria-hidden="true"
          />
        </ReceiptHover>
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
      <ReceiptHover
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
      </ReceiptHover>
    </span>
  );
});

export default SteerReceipt;
