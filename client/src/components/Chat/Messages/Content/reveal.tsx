import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * A request to show the failed calls under a header, travelling DOWN the fold
 * tree. Expansion otherwise flows up (`onToolExpand` opens the group around a
 * row a reader clicked), so a header that wants to open a failed row three
 * disclosures below it needs its own channel. The value is a counter: each
 * request is a new number, and a consumer opens once per number it has not
 * seen. Zero is the resting value and never opens anything.
 */
export const FailedRevealContext = createContext(0);

/**
 * Issues requests to the consumers below. A request made while the body is
 * still unmounted waits for `ready`: a collapsed card mounts its rows in the
 * same commit that opens it, and a row that mounts under an already-advanced
 * counter would take it as the resting value and never open. Deferring the
 * increment to the commit after the rows exist is what lets one click on a
 * closed card reach an error three disclosures down.
 */
export function useFailedRevealTrigger(ready: boolean): { tick: number; reveal: () => void } {
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState(false);
  const reveal = useCallback(() => setPending(true), []);
  useEffect(() => {
    if (!pending || !ready) {
      return;
    }
    setPending(false);
    setTick((previous) => previous + 1);
  }, [pending, ready]);
  return { tick, reveal };
}

/**
 * Runs `onReveal` once for each request above this consumer, when the
 * consumer holds a failure. The seen counter is a ref, so a call that fails
 * AFTER an earlier request does not open itself on that stale request.
 */
export function useFailedReveal(hasFailure: boolean, onReveal: () => void): void {
  const tick = useContext(FailedRevealContext);
  const seenRef = useRef(tick);
  useEffect(() => {
    if (tick === seenRef.current) {
      return;
    }
    seenRef.current = tick;
    if (hasFailure) {
      onReveal();
    }
  }, [tick, hasFailure, onReveal]);
}

/**
 * The header's failure count as the control that reaches the failures. It sits
 * BESIDE the disclosure button, never inside it: a button cannot contain a
 * button, and its name says what it does rather than repeating the count the
 * header already carries.
 */
export function FailedRevealPill({
  count,
  onReveal,
  className,
}: {
  count: number;
  onReveal: () => void;
  className?: string;
}) {
  const localize = useLocalize();
  if (count === 0) {
    return null;
  }
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-transparent bg-status-error-subtle px-2 text-[11.5px] font-semibold leading-none text-status-error',
        'hover:border-status-error-border focus-visible:border-status-error focus-visible:outline-none',
        className,
      )}
      onClick={onReveal}
      aria-label={localize(count === 1 ? 'com_ui_show_failed_one' : 'com_ui_show_failed_n', {
        0: String(count),
      })}
      data-testid="failed-reveal-pill"
    >
      <TriangleAlert size={12} aria-hidden="true" />
      {localize(count === 1 ? 'com_ui_one_action_failed' : 'com_ui_n_actions_failed', {
        0: String(count),
      })}
    </button>
  );
}
