import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { useToastContext } from '@librechat/client';
import {
  Zap,
  Send,
  Clock,
  Merge,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronsUp,
  ChevronDown,
  Paperclip,
} from 'lucide-react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import type { RestoreToComposer } from './InFlightSteers';
import type { QueuedMessage } from '~/store/families';
import type { MenuEntry } from './SteerMenu';
import {
  RowMenu,
  ICON_BTN_CLASS,
  PRIMARY_BTN_CLASS,
  EscalateNowButton,
  useDefaultToggleEntry,
  useInterruptToggleEntry,
} from './SteerMenu';
import { queueExpandedFamily } from '~/store/steer';
import { isMergeableQueuedMessage } from '~/utils';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export const ROW_CLASS =
  'flex w-full items-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary';

/** Depth cue for the collapsed stack. Kept INSIDE the row's own footprint (the
 *  wrapper reserves the peek height) because the composer box clips overflow. */
/** Enough to show a merged row's paragraphs without the row eating the box. */
const EDITOR_MAX_ROWS = 4;

const PEEK_CLASS =
  'pointer-events-none absolute h-full rounded-xl border border-border-light bg-surface-tertiary';

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

function QueuedRowBase({
  message,
  steering,
  conversationId,
  interruptPending,
  canBump,
  onRestoreToComposer,
}: {
  message: QueuedMessage;
  steering: SteeringControls;
  conversationId: string;
  interruptPending: boolean;
  /** False for the front row (already next) and for a lone queued message. */
  canBump: boolean;
  onRestoreToComposer: RestoreToComposer;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const toggleEntry = useDefaultToggleEntry(steering);
  const interruptToggle = useInterruptToggleEntry();
  const fileCount = message.files?.length ?? 0;
  const isRecovered = message.recoverySteerId != null;
  const editable = isMergeableQueuedMessage(message);
  const actionPendingRef = useRef(false);
  const [actionPending, setActionPending] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft != null;
  const editorRef = useRef<HTMLTextAreaElement>(null);
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
  const showPrimary = canSteerNow || (!steering.duringRunActive && steering.canSendQueuedNow);
  /** `canSteer` is defined as false while paused on approval, but the
   *  escalation control must stay visible-and-disabled there — hiding it
   *  during the pause is exactly the discoverability gap this button fixes. */
  const showEscalate =
    !isRecovered && (steering.pausedOnApproval || (steering.duringRunActive && steering.canSteer));

  /** Focus follows the explicit Edit action rather than mount, so the row can
   *  never steal focus from the composer on a re-render. */
  useEffect(() => {
    if (editing) {
      editorRef.current?.focus();
    }
  }, [editing]);

  const commitDraft = useCallback(() => {
    if (draft == null) {
      return;
    }
    steering.updateQueuedText(message.id, draft);
    setDraft(null);
  }, [draft, message.id, steering]);

  /** Removing the input never fires `blur`, and this row is remounted whenever
   *  the queue crosses the grouping threshold (a front row draining, say), so
   *  an in-progress edit has to be flushed on the way out or the words are
   *  lost. Writing for an id that has since drained is a no-op.
   *
   *  Held in a ref with an EMPTY dep list on purpose: `steering` is rebuilt at
   *  every run boundary, and a dep on it would fire this cleanup while the row
   *  is still mounted — committing mid-edit, which Escape could then no longer
   *  undo. */
  const draftRef = useRef<string | null>(null);
  draftRef.current = draft;
  const flushDraftRef = useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    if (draftRef.current != null) {
      steering.updateQueuedText(message.id, draftRef.current);
    }
  };
  useEffect(() => () => flushDraftRef.current(), []);

  /** An ordinary row is a living draft: it is rewritten in place. A recovered
   *  row's words are bound to a parked server source matched by exact text, so
   *  its Edit keeps the existing discard-then-hand-to-composer path. */
  const entries: MenuEntry[] = [
    {
      key: 'edit',
      label: localize(editable ? 'com_ui_queue_edit_inline' : 'com_ui_edit_message'),
      icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
      disabled: actionPending,
      onClick: () => {
        if (editable) {
          setDraft(message.text);
          return;
        }
        const context = { quotes: message.quotes, manualSkills: message.manualSkills };
        afterDiscard(() => {
          const restored = onRestoreToComposer(
            message.text,
            message.files,
            context,
            conversationId,
          );
          if (!restored) {
            showToast({ message: localize('com_ui_steer_edit_queued'), status: 'info' });
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
      <Clock className="h-4 w-4 shrink-0 text-cyan-500" aria-hidden="true" />
      {editing ? (
        /* A textarea, not an input: merged rows carry paragraph breaks and an
         * input silently flattens them on the first keystroke. Enter commits
         * and Shift+Enter adds a line, matching the composer. */
        <textarea
          ref={editorRef}
          value={draft}
          rows={Math.min(EDITOR_MAX_ROWS, draft.split('\n').length)}
          aria-label={localize('com_ui_queue_edit_inline')}
          data-testid="queued-message-edit"
          className="min-w-0 flex-1 resize-none bg-transparent text-sm text-text-primary outline-none"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            /** An IME candidate confirmation arrives as an unshifted Enter
             *  while composition is still active; committing there would save
             *  half-typed text. Same guard the composer and DynamicTags use. */
            if (event.nativeEvent.isComposing || event.keyCode === 229) {
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              commitDraft();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(null);
            }
          }}
        />
      ) : (
        <span
          className={cn('min-w-0 flex-1 truncate', editable && 'cursor-text')}
          title={editable ? localize('com_ui_queue_edit_inline') : message.text}
          onClick={editable ? () => setDraft(message.text) : undefined}
        >
          {message.text}
        </span>
      )}
      <AttachmentCount
        count={fileCount}
        label={localize('com_ui_queued_attachment_count', { 0: String(fileCount) })}
      />
      {canBump && !editing && (
        <button
          type="button"
          aria-label={localize('com_ui_queue_send_next')}
          title={localize('com_ui_queue_send_next')}
          data-testid="queued-send-next"
          disabled={actionPending}
          onClick={() => steering.bumpQueued(message.id)}
          className={ICON_BTN_CLASS}
        >
          <ChevronsUp className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {showPrimary && (
        <button
          type="button"
          className={PRIMARY_BTN_CLASS}
          disabled={actionPending}
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
          disabled={steering.pausedOnApproval || interruptPending || actionPending}
          onClick={() => steering.sendQueuedNow(message, { preempt: true })}
        />
      )}
      <button
        type="button"
        aria-label={localize('com_ui_remove_queued')}
        disabled={actionPending}
        onClick={() => {
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
          if (!isRecovered) {
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

/** Rows carry local edit state and a sibling's keystroke must not re-render
 *  the whole stack; the in-flight bubbles are memoized for the same reason. */
export const QueuedRow = memo(QueuedRowBase);

/**
 * The withheld automatic send. Progress is announced rather than merely drawn,
 * and the bar is a CSS animation so the window costs no re-renders while it
 * runs — this surface sits above a streaming thread.
 */
function QueueSendingBannerBase({
  count,
  dueAt,
  onUndo,
}: {
  count: number;
  dueAt: number;
  onUndo: () => void;
}) {
  const localize = useLocalize();
  const remaining = Math.max(0, dueAt - Date.now());
  return (
    <div
      role="listitem"
      className="flex w-full items-center gap-2 rounded-xl border border-border-light bg-surface-tertiary px-3 py-2 text-sm text-text-primary"
      data-testid="queue-sending-banner"
    >
      <Send className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate" aria-live="polite">
        {localize('com_ui_queue_sending', { 0: String(count) })}
      </span>
      <span
        aria-hidden="true"
        className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-surface-secondary"
      >
        <span
          className="block h-full w-full origin-left bg-text-secondary motion-safe:animate-queue-undo-grace"
          style={{ animationDuration: `${remaining}ms` }}
        />
      </span>
      <button
        type="button"
        className={PRIMARY_BTN_CLASS}
        data-testid="queue-undo-send"
        onClick={onUndo}
      >
        {localize('com_ui_queue_undo_send')}
      </button>
    </div>
  );
}

export const QueueSendingBanner = memo(QueueSendingBannerBase);

/**
 * Two or more waiting messages read as one outbox instead of a growing stack:
 * collapsed, the group is a single row (the next message to send) over layered
 * card edges, so the composer stops inflating with queue depth. Management
 * lives inside the expansion, where the rows keep every per-row affordance.
 */
function QueuedOutboxBase({
  queued,
  steering,
  conversationId,
  interruptPending,
  onRestoreToComposer,
}: {
  queued: QueuedMessage[];
  steering: SteeringControls;
  conversationId: string;
  interruptPending: boolean;
  onRestoreToComposer: RestoreToComposer;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [expanded, setExpanded] = useAtom(queueExpandedFamily(steering.queueKey));
  const mergeable = useMemo(() => queued.every(isMergeableQueuedMessage), [queued]);
  /** The expanded rows omit escalation on recovery-bound items (steering
   *  refuses them mid-run), so the shortcut naturally lands on the newest
   *  ELIGIBLE row. The collapsed proxy has to make the same choice, or the
   *  shortcut silently no-ops when a recovered row happens to sort last. */
  const escalatable = useMemo(() => {
    for (let i = queued.length - 1; i >= 0; i -= 1) {
      if (queued[i].recoverySteerId == null) {
        return queued[i];
      }
    }
    return undefined;
  }, [queued]);
  const [next] = queued;

  const clearAll = useCallback(() => {
    void (async () => {
      const cleared = await steering.clearQueued();
      if (cleared == null) {
        return;
      }
      const restored = onRestoreToComposer(
        cleared.text,
        cleared.files,
        { quotes: cleared.quotes, manualSkills: cleared.manualSkills },
        conversationId,
      );
      /** The gated restore refuses rather than clobber a draft the user has
       *  since staged. Hand the words back to the queue instead of dropping
       *  them — one row now, since they were folded on the way out. */
      if (!restored) {
        steering.enqueue(cleared.text, {
          files: cleared.files,
          quotes: cleared.quotes,
          manualSkills: cleared.manualSkills,
          skipUsageMark: true,
          id: cleared.id,
          createdAt: cleared.createdAt,
          /** Kept explicitly: an idle chat has no active epoch for `enqueue` to
           *  substitute, and an unfenced row can replace a newer generation
           *  instead of taking the predecessor-mismatch recovery path. */
          expectedPredecessorCreatedAt: cleared.expectedPredecessorCreatedAt,
        });
        showToast({ message: localize('com_ui_steer_edit_queued'), status: 'info' });
      }
    })();
  }, [conversationId, localize, onRestoreToComposer, showToast, steering]);

  /* One wrapper for both states, so the disclosure button keeps its position
   * in the tree: remounting it on toggle would drop keyboard focus mid-use.
   * It is the parent list's item — collapsed, the group IS the only item; the
   * rows become a nested list when expanded. */
  return (
    <div
      role="listitem"
      className={cn('relative flex flex-col gap-1.5', !expanded && 'pb-1.5')}
      data-testid="queue-group"
    >
      {!expanded && (
        <>
          <span aria-hidden="true" className={cn(PEEK_CLASS, 'inset-x-3 top-3 opacity-40')} />
          <span aria-hidden="true" className={cn(PEEK_CLASS, 'inset-x-1.5 top-1.5 opacity-70')} />
        </>
      )}
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={localize(expanded ? 'com_ui_queue_collapse' : 'com_ui_queue_expand')}
        data-testid="queue-group-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        className={cn(ROW_CLASS, 'relative text-left hover:bg-surface-hover')}
      >
        <Clock className="h-4 w-4 shrink-0 text-cyan-500" aria-hidden="true" />
        <span className="shrink-0 font-medium">
          {localize('com_ui_queue_count', { 0: String(queued.length) })}
        </span>
        {!expanded && (
          <span className="min-w-0 flex-1 truncate text-text-secondary">
            {localize('com_ui_queue_next_up', { 0: next.text })}
          </span>
        )}
        <span className="flex-1" />
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        )}
      </button>
      {/* Keyboard parity: the escalate shortcut clicks the LAST queued control
       *  in the document. Collapsing unmounts the rows, so the newest eligible
       *  message keeps a control here — offscreen, labelled, and only while
       *  the rows are hidden. */}
      {!expanded &&
        escalatable != null &&
        !interruptPending &&
        steering.duringRunActive &&
        steering.canSteer && (
          <button
            type="button"
            className="sr-only"
            data-escalate-steer="queued"
            data-testid="queued-escalate-newest"
            aria-label={localize('com_ui_queue_escalate_newest')}
            onClick={() => steering.sendQueuedNow(escalatable, { preempt: true })}
          />
        )}
      {expanded && (
        <div
          role="list"
          aria-label={localize('com_ui_queued_messages')}
          className="flex flex-col gap-1.5"
        >
          {queued.map((message, position) => (
            <QueuedRow
              key={message.id}
              message={message}
              steering={steering}
              conversationId={conversationId}
              interruptPending={interruptPending}
              canBump={position > 0}
              onRestoreToComposer={onRestoreToComposer}
            />
          ))}
        </div>
      )}
      {expanded && (
        <div className="flex items-center gap-2 px-1 pb-0.5">
          <button
            type="button"
            className={PRIMARY_BTN_CLASS}
            data-testid="queue-merge"
            disabled={!mergeable}
            title={mergeable ? undefined : localize('com_ui_queue_merge_blocked')}
            onClick={() => steering.mergeQueued()}
          >
            <Merge className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_queue_merge')}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            className={PRIMARY_BTN_CLASS}
            data-testid="queue-clear-all"
            onClick={clearAll}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_queue_clear_all')}
          </button>
        </div>
      )}
    </div>
  );
}

export const QueuedOutbox = memo(QueuedOutboxBase);
