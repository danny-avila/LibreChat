import { memo, useMemo, useRef, useState, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import {
  X,
  Zap,
  Send,
  Clock,
  Pencil,
  Trash2,
  Paperclip,
  RotateCcw,
  TextQuote,
  TriangleAlert,
} from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import type { SteeringControls, QueuedMessageContext } from '~/hooks/Chat/useSteering';
import type { PendingSteer, QueuedMessage } from '~/store/families';
import type { RestoreToComposer } from './InFlightSteers';
import type { MenuEntry } from './SteerMenu';
import {
  RowMenu,
  ICON_BTN_CLASS,
  PRIMARY_BTN_CLASS,
  EscalateNowButton,
  useDefaultToggleEntry,
  useInterruptToggleEntry,
} from './SteerMenu';
import { escalatingSteerFamily } from '~/store/steer';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const ROW_CLASS =
  'flex w-full items-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary';

function ContextCount({
  icon,
  count,
  label,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
}) {
  if (count === 0) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-xs text-text-secondary">
      {icon}
      {count}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function AttachmentCount({ count, label }: { count: number; label: string }) {
  return (
    <ContextCount
      icon={<Paperclip className="h-3.5 w-3.5" aria-hidden="true" />}
      count={count}
      label={label}
    />
  );
}

function QuoteCount({ count, label }: { count: number; label: string }) {
  return (
    <ContextCount
      icon={<TextQuote className="h-3.5 w-3.5" aria-hidden="true" />}
      count={count}
      label={label}
    />
  );
}

function QueuedRow({
  message,
  steering,
  conversationId,
  interruptPending,
  onEditToComposer,
  onRestoreToComposer,
}: {
  message: QueuedMessage;
  steering: SteeringControls;
  conversationId: string;
  interruptPending: boolean;
  onEditToComposer: (
    text: string,
    files?: TMessage['files'],
    context?: QueuedMessageContext,
  ) => void;
  onRestoreToComposer: RestoreToComposer;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const toggleEntry = useDefaultToggleEntry(steering);
  const interruptToggle = useInterruptToggleEntry();
  const fileCount = message.files?.length ?? 0;
  const quoteCount = message.quotes?.length ?? 0;
  const isRecovered = message.recoverySteerId != null;
  const isRejected = message.server?.status === 'rejected';
  const isUnconfirmed =
    message.server?.status === 'uncertain' && message.server.reconciliationExpired === true;
  const requiresDiscard = isRecovered || message.server?.id != null;
  const serverActionable =
    message.server == null ||
    message.server.status === 'rejected' ||
    (message.server.id != null && message.server.status === 'queued');
  const actionPendingRef = useRef(false);
  const [actionPending, setActionPending] = useState(false);
  /** A recovered item has a replayable parked source. Edit/remove must first
   * cancel that source by receipt; local-only rows settle synchronously through
   * the same control. The ref closes the pre-render double-click window. */
  const afterDiscard = useCallback(
    (action: () => boolean) => {
      if (actionPendingRef.current) {
        return;
      }
      actionPendingRef.current = true;
      setActionPending(true);
      void (async () => {
        let discarded = false;
        try {
          discarded = await steering.discardQueued(message);
        } catch {
          // The steering hook reports request failures and leaves the row in
          // place. Keep this guard for test/custom control implementations.
        }
        if (!discarded) {
          actionPendingRef.current = false;
          setActionPending(false);
          return;
        }
        if (!action()) {
          actionPendingRef.current = false;
          setActionPending(false);
        }
      })();
    },
    [message, steering],
  );
  // A recovered item is consumed atomically only when it starts a normal
  // generation. Re-steering it would leave or duplicate the parked source;
  // Edit/remove are safe because `afterDiscard` tombstones that source first.
  const canSteerNow = steering.duringRunActive && steering.canSteer && !isRecovered;
  const showPrimary =
    serverActionable && (canSteerNow || (!steering.duringRunActive && steering.canSendQueuedNow));
  /** `canSteer` is defined as false while paused on approval, but the
   *  escalation control must stay visible-and-disabled there — hiding it
   *  during the pause is exactly the discoverability gap this button fixes. */
  const showEscalate =
    !isRecovered && (steering.pausedOnApproval || (steering.duringRunActive && steering.canSteer));

  const entries: MenuEntry[] = [
    {
      key: 'edit',
      label: localize('com_ui_edit_message'),
      icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
      disabled: actionPending || !serverActionable,
      onClick: () => {
        const context = {
          quotes: message.quotes,
          manualSkills: message.manualSkills,
        };
        if (!requiresDiscard) {
          steering.removeQueued(message.id);
          onEditToComposer(message.text, message.files, {
            quotes: message.quotes,
            manualSkills: message.manualSkills,
          });
          return;
        }
        afterDiscard(() => {
          const restored = onRestoreToComposer(
            message.text,
            message.files,
            context,
            conversationId,
          );
          if (!restored) {
            showToast({
              message: localize('com_ui_steer_edit_queued'),
              status: 'info',
            });
            return false;
          }
          steering.removeQueued(message.id);
          return true;
        });
      },
    },
  ];
  const preferences: MenuEntry[] = [toggleEntry, interruptToggle];

  return (
    <div role="listitem" className={ROW_CLASS} data-testid="queued-message-row">
      {isRejected || isUnconfirmed ? (
        <TriangleAlert className="h-4 w-4 shrink-0 text-text-warning" aria-hidden="true" />
      ) : (
        <Clock className="h-4 w-4 shrink-0 text-cyan-500" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate" title={message.text}>
        {message.text}
      </span>
      <QuoteCount
        count={quoteCount}
        label={localize('com_ui_queued_quote_count', { 0: String(quoteCount) })}
      />
      <AttachmentCount
        count={fileCount}
        label={localize('com_ui_queued_attachment_count', {
          0: String(fileCount),
        })}
      />
      {(isRejected || isUnconfirmed) && (
        <span className="shrink-0 text-xs text-text-warning">
          {localize(
            isUnconfirmed ? 'com_ui_steer_delivery_unconfirmed' : 'com_ui_queued_turn_failed',
          )}
        </span>
      )}
      {showPrimary && (
        <button
          type="button"
          className={PRIMARY_BTN_CLASS}
          disabled={actionPending || !serverActionable}
          onClick={() => steering.sendQueuedNow(message)}
        >
          {canSteerNow ? (
            <>
              <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
              {localize('com_ui_steer')}
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden="true" />
              {localize('com_ui_send_now')}
            </>
          )}
        </button>
      )}
      {showEscalate && (
        <EscalateNowButton
          surface="queued"
          messageText={message.text}
          disabled={
            steering.pausedOnApproval || interruptPending || actionPending || !serverActionable
          }
          onClick={() => steering.sendQueuedNow(message, { preempt: true })}
        />
      )}
      <button
        type="button"
        aria-label={localize(
          isUnconfirmed ? 'com_ui_dismiss_unconfirmed_delivery' : 'com_ui_remove_queued',
        )}
        disabled={actionPending || (!serverActionable && !isUnconfirmed)}
        onClick={() => {
          if (isUnconfirmed) {
            steering.removeQueued(message.id);
            return;
          }
          const remove = () => {
            /* Same safety net as the in-flight cancel: once removal is safely
             * settled, return the words to the composer when it is free (the
             * gated restore refuses rather than clobber a draft). */
            onRestoreToComposer(
              message.text,
              message.files,
              { quotes: message.quotes, manualSkills: message.manualSkills },
              conversationId,
            );
            steering.removeQueued(message.id);
            return true;
          };
          if (!requiresDiscard) {
            remove();
            return;
          }
          afterDiscard(remove);
        }}
        className={ICON_BTN_CLASS}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <RowMenu
        label={localize('com_ui_more_options')}
        entries={entries}
        preferences={preferences}
      />
    </div>
  );
}

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
      <QuoteCount
        count={steer.quotes?.length ?? 0}
        label={localize('com_ui_queued_quote_count', {
          0: String(steer.quotes?.length ?? 0),
        })}
      />
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
 *   the thread — kept recoverable with retry / edit / queue actions.
 * - Queued rows (Clock): client-side follow-ups auto-sent after the run.
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
    <div className="flex flex-col gap-1.5 px-2 pt-2" data-testid="pending-steer-chips">
      {/* The list owns only listitem rows; the caption lives beside it so the
       *  ARIA list structure stays valid for assistive tech. */}
      <div
        className="flex flex-col gap-1.5"
        role="list"
        aria-label={localize('com_ui_queued_messages')}
      >
        {failedSteers.map((steer) => (
          <FailedSteerRow
            key={steer.steerId}
            steer={steer}
            steering={steering}
            onEditToComposer={onEditToComposer}
          />
        ))}
        {queued.map((message) => (
          <QueuedRow
            key={message.id}
            message={message}
            steering={steering}
            conversationId={conversationId}
            interruptPending={interruptPending}
            onEditToComposer={onEditToComposer}
            onRestoreToComposer={onRestoreToComposer}
          />
        ))}
      </div>
      {/* One caption for the whole queued group: the single fact users need
       *  ("did my message vanish?" it did not), shown only while a run is
       *  actually pending — after it, rows drain or convert on their own. */}
      {queued.length > 0 && steering.duringRunActive && (
        <div className="px-3 text-xs text-text-secondary" data-testid="queued-caption">
          {localize('com_ui_steer_queued_info')}
        </div>
      )}
    </div>
  );
}

export default memo(PendingSteerChips);
