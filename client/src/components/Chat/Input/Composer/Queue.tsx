import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import { X, Clock, Pencil } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import type { SteeringControls, QueuedMessageContext } from '~/hooks/Chat/useSteering';
import type { RestoreToComposer } from '../InFlightSteers';
import type { QueuedMessage } from '~/store/families';
import { useLocalize } from '~/hooks';
import store from '~/store';

const ICON_BTN =
  'shrink-0 rounded-full p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy';

interface QueueProps {
  steering: SteeringControls;
  conversationId: string;
  onEditToComposer: (
    text: string,
    files?: TMessage['files'],
    context?: QueuedMessageContext,
  ) => void;
  onRestoreToComposer: RestoreToComposer;
}

/**
 * Messages waiting for the current reply to finish, as a rail tucked behind
 * the composer's top edge. One row per message, three visible actions and no
 * overflow menu: the menu is where the old design hid a global preference
 * among item actions.
 *
 * Send-now resolves itself: `sendQueuedNow` steers into the live reply when
 * the run accepts it, or sends right away once nothing is running. While a
 * run is paused on a pending approval it would only re-queue the message at
 * the front with no visible effect, so the button disables itself for that
 * case instead of pretending to act.
 */
function Queue({ steering, conversationId, onEditToComposer, onRestoreToComposer }: QueueProps) {
  const localize = useLocalize();
  const queued = useRecoilValue(store.queuedMessagesByConvoId(steering.queueKey));

  if (queued.length === 0) {
    return null;
  }

  return (
    <div
      role="list"
      aria-label={localize('com_ui_queued_messages')}
      data-testid="composer-queue"
      /* Inset and only rounded on top: the rail reads as paper tucked behind
         the composer rather than a second composer stacked on it. */
      className="mx-3 flex flex-col overflow-hidden rounded-t-2xl border border-b-0 border-border-light bg-surface-secondary"
    >
      {queued.map((message: QueuedMessage) => {
        const fileCount = message.files?.length ?? 0;
        /** Paused-on-approval: `sendQueuedNow` can neither steer (no live
         *  reply accepting input) nor send (a run is still active), so it
         *  would just re-queue the message with nothing visible happening. */
        const sendDisabled = steering.duringRunActive && !steering.canSteer;

        return (
          <div
            key={message.id}
            role="listitem"
            data-testid="queued-message-row"
            className="flex items-center gap-2 border-b border-border-light px-3 py-1.5 text-sm last:border-b-0"
          >
            <Clock className="h-3.5 w-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-text-primary" title={message.text}>
              {message.text}
            </span>
            {fileCount > 0 && (
              <span
                className="shrink-0 text-xs text-text-secondary"
                title={localize('com_ui_queued_attachment_count', { 0: String(fileCount) })}
                aria-label={localize('com_ui_queued_attachment_count', { 0: String(fileCount) })}
              >
                {localize(
                  fileCount === 1 ? 'com_ui_attachment_count_one' : 'com_ui_attachment_count',
                  { count: fileCount },
                )}
              </span>
            )}
            <button
              type="button"
              disabled={sendDisabled}
              aria-disabled={sendDisabled}
              title={sendDisabled ? localize('com_ui_send_now_paused') : undefined}
              onClick={() => steering.sendQueuedNow(message)}
              className="shrink-0 rounded-lg px-2 py-0.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy disabled:cursor-not-allowed disabled:opacity-40"
            >
              {localize('com_ui_send_now')}
            </button>
            <button
              type="button"
              aria-label={localize('com_ui_edit_message')}
              onClick={() => {
                steering.removeQueued(message.id);
                onEditToComposer(message.text, message.files, {
                  quotes: message.quotes,
                  manualSkills: message.manualSkills,
                });
              }}
              className={ICON_BTN}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={localize('com_ui_remove_queued')}
              onClick={() => {
                onRestoreToComposer(
                  message.text,
                  message.files,
                  { quotes: message.quotes, manualSkills: message.manualSkills },
                  conversationId,
                );
                steering.removeQueued(message.id);
              }}
              className={ICON_BTN}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default memo(Queue);
