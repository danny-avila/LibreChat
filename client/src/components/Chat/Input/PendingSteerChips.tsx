import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import { Zap, Clock, X, RotateCcw, Send } from 'lucide-react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const CHIP_CLASS =
  'inline-flex max-w-full items-center gap-1 rounded-2xl border border-border-light bg-surface-secondary px-2.5 py-1.5 text-sm text-text-secondary';
const ACTION_BTN_CLASS =
  '-mr-0.5 shrink-0 rounded-full p-0.5 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy';

/**
 * Chip row above the textarea for during-run messages:
 * - Steer chips (Zap): submitted mid-run, awaiting injection. `sending` pulses
 *   while the POST is in flight; `pending` is server-queued (the chip clears
 *   when `on_steer_applied` lands and the inline bubble takes over); `failed`
 *   keeps the text recoverable with retry / queue / dismiss actions.
 * - Queued chips (Clock): client-side follow-ups auto-sent after the run
 *   completes, with steer-now (while the run is live) and remove actions.
 */
function PendingSteerChips({
  conversationId,
  steering,
}: {
  conversationId: string;
  steering: SteeringControls;
}) {
  const localize = useLocalize();
  const steers = useRecoilValue(store.pendingSteersByConvoId(conversationId));
  const queued = useRecoilValue(store.queuedMessagesByConvoId(steering.queueKey));

  if (steers.length === 0 && queued.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 px-2 pt-2"
      role="list"
      aria-label={localize('com_ui_queued_messages')}
      data-testid="pending-steer-chips"
    >
      {steers.map((steer) => (
        <span
          role="listitem"
          key={steer.steerId}
          className={cn(CHIP_CLASS, steer.status === 'failed' && 'border-red-500/60')}
          data-steer-status={steer.status}
        >
          <Zap
            className={cn(
              'h-4 w-4 shrink-0',
              steer.status === 'failed' ? 'text-red-500' : 'text-amber-500',
              steer.status === 'sending' && 'animate-pulse',
            )}
            aria-hidden="true"
          />
          <span className="max-w-[16rem] truncate" title={steer.text}>
            {steer.text}
          </span>
          <span className="sr-only">
            {steer.status === 'failed'
              ? localize('com_ui_steer_failed')
              : localize('com_ui_steer_pending')}
          </span>
          {steer.status === 'failed' && (
            <>
              <button
                type="button"
                aria-label={localize('com_ui_steer_retry')}
                onClick={() => steering.retrySteer(steer.steerId, steer.text)}
                className={ACTION_BTN_CLASS}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={localize('com_ui_convert_to_queue')}
                onClick={() => steering.convertSteerToQueue(steer.steerId, steer.text)}
                className={ACTION_BTN_CLASS}
              >
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={localize('com_ui_remove_queued')}
                onClick={() => steering.removeSteer(steer.steerId)}
                className={ACTION_BTN_CLASS}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </span>
      ))}
      {queued.map((message) => (
        <span role="listitem" key={message.id} className={CHIP_CLASS}>
          <Clock className="h-4 w-4 shrink-0 text-cyan-500" aria-hidden="true" />
          <span className="max-w-[16rem] truncate" title={message.text}>
            {message.text}
          </span>
          <button
            type="button"
            aria-label={localize('com_ui_send_now')}
            onClick={() => steering.sendQueuedNow(message.id, message.text)}
            className={ACTION_BTN_CLASS}
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={localize('com_ui_remove_queued')}
            onClick={() => steering.removeQueued(message.id)}
            className={ACTION_BTN_CLASS}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}

export default memo(PendingSteerChips);
