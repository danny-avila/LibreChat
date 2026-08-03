import { memo, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { X, Zap, Clock, Pencil, RotateCcw } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import type { SteeringControls, QueuedMessageContext } from '~/hooks/Chat/useSteering';
import type { RestoreToComposer } from './InFlightSteers';
import type { PendingSteer } from '~/store/families';
import type { MenuEntry } from './SteerMenu';
import {
  RowMenu,
  ICON_BTN_CLASS,
  PRIMARY_BTN_CLASS,
  useDefaultToggleEntry,
  useInterruptToggleEntry,
} from './SteerMenu';
import { QueuedRow, QueuedOutbox, QueueSendingBanner, ROW_CLASS } from './QueuedOutbox';
import { escalatingSteerFamily } from '~/store/steer';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

function FailedSteerRow({
  steer,
  steering,
  onEditToComposer,
}: {
  steer: PendingSteer;
  steering: SteeringControls;
  onEditToComposer: (
    text: string,
    files?: TMessage['files'],
    context?: QueuedMessageContext,
  ) => void;
}) {
  const localize = useLocalize();
  const toggleEntry = useDefaultToggleEntry(steering);
  const interruptToggle = useInterruptToggleEntry();
  const canRetry = !steer.deliveryUncertain || steer.generationProtocolVersion === 2;

  const entries: MenuEntry[] = steer.deliveryUncertain
    ? []
    : [
        {
          key: 'edit',
          label: localize('com_ui_edit_message'),
          icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
          onClick: () => {
            steering.removeSteer(steer.steerId);
            onEditToComposer(steer.text, steer.files, {
              quotes: steer.quotes,
              manualSkills: steer.manualSkills,
            });
          },
        },
        {
          key: 'queue',
          label: localize('com_ui_convert_to_queue'),
          icon: <Clock className="h-4 w-4 text-cyan-500" aria-hidden="true" />,
          onClick: () =>
            steering.convertSteerToQueue(
              steer.steerId,
              steer.text,
              steer.files,
              { quotes: steer.quotes, manualSkills: steer.manualSkills },
              steer.queuedOrigin,
            ),
        },
      ];
  const preferences: MenuEntry[] = [toggleEntry, interruptToggle];

  return (
    <div
      role="listitem"
      className={cn(ROW_CLASS, 'border-red-500/60')}
      data-testid="steer-message-row"
    >
      <Zap className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate" title={steer.text}>
        {steer.text}
      </span>
      <span className="shrink-0 text-xs text-red-500">
        {localize(
          steer.deliveryUncertain ? 'com_ui_steer_delivery_unconfirmed' : 'com_ui_steer_failed',
        )}
      </span>
      {canRetry && (
        <button
          type="button"
          className={PRIMARY_BTN_CLASS}
          onClick={() =>
            steering.retrySteer(
              steer.steerId,
              steer.text,
              steer.files,
              { quotes: steer.quotes, manualSkills: steer.manualSkills },
              {
                preempt: steer.preempt === true,
                createdAt: steer.createdAt,
                generationProtocolVersion: steer.generationProtocolVersion,
                ...(steer.generationCreatedAt != null && {
                  generationCreatedAt: steer.generationCreatedAt,
                }),
                ...(steer.queuedOrigin && { queuedOrigin: steer.queuedOrigin }),
              },
            )
          }
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_steer_retry')}
        </button>
      )}
      {!steer.deliveryUncertain && (
        <button
          type="button"
          aria-label={localize('com_ui_remove_queued')}
          onClick={() => steering.removeSteer(steer.steerId)}
          className={ICON_BTN_CLASS}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <RowMenu
        label={localize('com_ui_more_options')}
        entries={entries}
        preferences={preferences}
      />
    </div>
  );
}

/**
 * Stacked rows above the composer for during-run messages, mirroring the
 * reference UI: each row shows the message, a primary action, delete, and an
 * overflow menu with Edit message + the default-mode toggle.
 * (In-flight steers read as messages, not controls — `InFlightSteers` renders
 * them as bubbles anchored above the composer box.)
 * - Failed steer rows (Zap, red): the POST failed, so the text never entered
 *   the thread — kept recoverable with retry / edit / queue actions. They stay
 *   OUTSIDE the queued group: a failure is an action item, so no disclosure
 *   may ever hide one.
 * - Queued rows (Clock): client-side follow-ups auto-sent after the run. A lone
 *   one stays a plain chip; two or more collapse into `QueuedOutbox`.
 */
function PendingSteerChips({
  conversationId,
  steering,
  onEditToComposer,
  onRestoreToComposer,
}: {
  conversationId: string;
  steering: SteeringControls;
  onEditToComposer: (
    text: string,
    files?: TMessage['files'],
    context?: QueuedMessageContext,
  ) => void;
  onRestoreToComposer: RestoreToComposer;
}) {
  const localize = useLocalize();
  const steers = useRecoilValue(store.pendingSteersByConvoId(conversationId));
  const queued = useRecoilValue(store.queuedMessagesByConvoId(steering.queueKey));
  const drainHold = useRecoilValue(store.queueDrainHoldByConvoId(steering.queueKey));
  const failedSteers = useMemo(() => steers.filter((steer) => steer.status === 'failed'), [steers]);
  /** Only one interrupt can be in flight: a second preempt while one is
   *  unresolved would arm a second seal, so escalation buttons disable. The
   *  escalating flag covers a bubble arm's round trip, before its chip
   *  relabels for the chip-derived check to see. */
  const escalating = useAtomValue(escalatingSteerFamily(conversationId));
  const interruptPending = useMemo(
    () => escalating || steers.some((steer) => steer.preempt === true && steer.status !== 'failed'),
    [escalating, steers],
  );

  if (failedSteers.length === 0 && queued.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-1.5 px-2 pt-2"
      role="list"
      aria-label={localize('com_ui_queued_messages')}
      data-testid="pending-steer-chips"
    >
      {failedSteers.map((steer) => (
        <FailedSteerRow
          key={steer.steerId}
          steer={steer}
          steering={steering}
          onEditToComposer={onEditToComposer}
        />
      ))}
      {drainHold != null && drainHold.status == null && queued.length > 0 && (
        <QueueSendingBanner
          count={queued.length}
          dueAt={drainHold.dueAt}
          onUndo={steering.cancelQueueDrain}
        />
      )}
      {queued.length === 1 && (
        <QueuedRow
          key={queued[0].id}
          message={queued[0]}
          steering={steering}
          conversationId={conversationId}
          interruptPending={interruptPending}
          canBump={false}
          onRestoreToComposer={onRestoreToComposer}
        />
      )}
      {queued.length > 1 && (
        <QueuedOutbox
          queued={queued}
          steering={steering}
          conversationId={conversationId}
          interruptPending={interruptPending}
          onRestoreToComposer={onRestoreToComposer}
        />
      )}
    </div>
  );
}

export default memo(PendingSteerChips);
