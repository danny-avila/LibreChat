import { memo, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { X, Zap, Send, Clock, Pencil, Trash2, ZapOff, Paperclip, RotateCcw } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import type { SteeringControls, QueuedMessageContext } from '~/hooks/Chat/useSteering';
import type { PendingSteer, QueuedMessage } from '~/store/families';
import type { RestoreToComposer } from './InFlightSteers';
import type { MenuEntry } from './SteerMenu';
import {
  RowMenu,
  ICON_BTN_CLASS,
  PRIMARY_BTN_CLASS,
  useDefaultToggleEntry,
  useInterruptChordHint,
  useInterruptToggleEntry,
} from './SteerMenu';
import { escalatingSteerFamily } from '~/store/steer';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const ROW_CLASS =
  'flex w-full items-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary';

function AttachmentCount({ count, label }: { count: number; label: string }) {
  if (count === 0) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-xs text-text-secondary">
      <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
      {count}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Escalate one message past the queue: interrupt & steer it now, at the next
 * safe token boundary instead of the next tool step. Icon-only ZapOff, the
 * interrupt glyph everywhere in this UI; the tooltip teaches the composer
 * chord that does this in one step. Disabled while another interrupt is
 * unresolved or the run is paused on approval.
 */
function InterruptNowButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const localize = useLocalize();
  const chordHint = useInterruptChordHint();
  const label = localize('com_ui_interrupt_steer_now');
  return (
    <Ariakit.TooltipProvider placement="top" timeout={300}>
      <Ariakit.TooltipAnchor
        render={
          <button
            type="button"
            aria-label={label}
            data-testid="queued-interrupt-now"
            disabled={disabled}
            onClick={onClick}
            className={cn(ICON_BTN_CLASS, 'disabled:cursor-not-allowed disabled:opacity-40')}
          >
            <ZapOff className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </button>
        }
      />
      <Ariakit.Tooltip className="z-50 rounded-lg bg-surface-tertiary px-2 py-1 text-xs text-text-primary shadow-lg">
        {chordHint == null ? label : `${label} · ${chordHint}`}
      </Ariakit.Tooltip>
    </Ariakit.TooltipProvider>
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
  const toggleEntry = useDefaultToggleEntry(steering);
  const interruptToggle = useInterruptToggleEntry();
  const fileCount = message.files?.length ?? 0;
  const canSteerNow = steering.duringRunActive && steering.canSteer;
  const showPrimary = canSteerNow || !steering.duringRunActive;
  /** `canSteer` is defined as false while paused on approval, but the
   *  escalation control must stay visible-and-disabled there — hiding it
   *  during the pause is exactly the discoverability gap this button fixes. */
  const showEscalate = steering.duringRunActive && (steering.canSteer || steering.pausedOnApproval);

  const entries: MenuEntry[] = [
    {
      key: 'edit',
      label: localize('com_ui_edit_message'),
      icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
      onClick: () => {
        steering.removeQueued(message.id);
        onEditToComposer(message.text, message.files, {
          quotes: message.quotes,
          manualSkills: message.manualSkills,
        });
      },
    },
    toggleEntry,
    interruptToggle,
  ];

  return (
    <div role="listitem" className={ROW_CLASS} data-testid="queued-message-row">
      <Clock className="h-4 w-4 shrink-0 text-cyan-500" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate" title={message.text}>
        {message.text}
      </span>
      <AttachmentCount
        count={fileCount}
        label={localize('com_ui_queued_attachment_count', { 0: String(fileCount) })}
      />
      {showPrimary && (
        <button
          type="button"
          className={PRIMARY_BTN_CLASS}
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
        <InterruptNowButton
          disabled={steering.pausedOnApproval || interruptPending}
          onClick={() => steering.sendQueuedNow(message, { preempt: true })}
        />
      )}
      <button
        type="button"
        aria-label={localize('com_ui_remove_queued')}
        onClick={() => {
          /* Same safety net as the in-flight cancel: return the words to the
           * composer when it is free (the gated restore refuses rather than
           * clobber a draft), then remove either way. */
          onRestoreToComposer(
            message.text,
            message.files,
            { quotes: message.quotes, manualSkills: message.manualSkills },
            conversationId,
          );
          steering.removeQueued(message.id);
        }}
        className={ICON_BTN_CLASS}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <RowMenu label={localize('com_ui_more_options')} entries={entries} />
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

  const entries: MenuEntry[] = [
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
        steering.convertSteerToQueue(steer.steerId, steer.text, steer.files, {
          quotes: steer.quotes,
          manualSkills: steer.manualSkills,
        }),
    },
    toggleEntry,
    interruptToggle,
  ];

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
      <span className="shrink-0 text-xs text-red-500">{localize('com_ui_steer_failed')}</span>
      <button
        type="button"
        className={PRIMARY_BTN_CLASS}
        onClick={() =>
          steering.retrySteer(
            steer.steerId,
            steer.text,
            steer.files,
            { quotes: steer.quotes, manualSkills: steer.manualSkills },
            { preempt: steer.preempt === true },
          )
        }
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {localize('com_ui_steer_retry')}
      </button>
      <button
        type="button"
        aria-label={localize('com_ui_remove_queued')}
        onClick={() => steering.removeSteer(steer.steerId)}
        className={ICON_BTN_CLASS}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <RowMenu label={localize('com_ui_more_options')} entries={entries} />
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
   *  unresolved would race the same seal, so escalation buttons disable. The
   *  escalating flag covers a bubble escalation's reclaim window, before its
   *  preempt chip exists for the chip-derived check to see. */
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
  );
}

export default memo(PendingSteerChips);
