import { memo, useRef, useMemo, useState, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useDrag, useDrop } from 'react-dnd';
import { X, Pencil, GripVertical } from 'lucide-react';
import { useMediaQuery, useToastContext } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import type { SteeringControls, QueuedMessageContext } from '~/hooks/Chat/useSteering';
import type { QueuedMessage } from '~/store/families';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const ICON_BTN =
  'shrink-0 rounded-full p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy';

const DRAG_TYPE = 'queued-message';
/** Shared by every handle, so the keys are stated once per rail. */
const REORDER_HINT_ID = 'composer-queue-reorder-hint';

interface DragItem {
  id: string;
  index: number;
  /** The order the drag started from, so abandoning it puts things back. */
  order: string[];
}

/** Restores a message's text into the composer, or refuses (false) when the
 *  composer is occupied / on another chat — see `restoreReclaimedSteer` in
 *  `ChatForm`. Used by the queue rail's edit/trash actions. */
export type RestoreToComposer = (
  text: string,
  files: TMessage['files'],
  context: QueuedMessageContext,
  originConversationId: string,
) => boolean;

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

interface QueueRowProps {
  message: QueuedMessage;
  index: number;
  total: number;
  /** Every queued id in order, captured when a drag starts so abandoning it
   *  can put the queue back the way it was. */
  order: string[];
  steering: SteeringControls;
  conversationId: string;
  onEditToComposer: QueueProps['onEditToComposer'];
  onRestoreToComposer: RestoreToComposer;
  onAnnounce: (message: string) => void;
}

function QueueRow({
  message,
  index,
  total,
  order,
  steering,
  conversationId,
  onEditToComposer,
  onRestoreToComposer,
  onAnnounce,
}: QueueRowProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const rowRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLButtonElement>(null);
  const { reorderQueued, restoreQueuedOrder } = steering;
  /* The queue is sent in order, so one message cannot be ahead of or behind
     itself: the handle only means something once there is somewhere to go. */
  const reorderable = total > 1;
  /* HTML5 drag needs a hover-capable pointer; on touch it would take the
     gesture away from scrolling the rail. Arrow keys reorder either way. */
  const canDrag = useMediaQuery('(hover: hover)');

  const [, drop] = useDrop<DragItem>({
    accept: DRAG_TYPE,
    hover(item, monitor) {
      const bounds = rowRef.current?.getBoundingClientRect();
      const pointer = monitor.getClientOffset();
      if (item.index === index || bounds == null || pointer == null) {
        return;
      }
      /* Swap on the crossing of the midpoint rather than on entry, so a row
         does not flip back and forth under a pointer resting on its edge. */
      const middle = (bounds.bottom - bounds.top) / 2;
      const offset = pointer.y - bounds.top;
      if (item.index < index ? offset < middle : offset > middle) {
        return;
      }
      reorderQueued(item.id, index);
      item.index = index;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: DRAG_TYPE,
    canDrag: reorderable && canDrag,
    item: (): DragItem => ({ id: message.id, index, order }),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    /* The rows are moved as the pointer crosses them, so a drag the user
       abandons — Escape, or a release outside the rail — has already changed
       the queue. Dropping nowhere puts the order back. */
    end: (item, monitor) => {
      if (!monitor.didDrop()) {
        restoreQueuedOrder(item.order);
      }
    },
  });

  const move = useCallback(
    (offset: number) => {
      const target = index + offset;
      if (!reorderable || target < 0 || target >= total) {
        return;
      }
      reorderQueued(message.id, target);
      onAnnounce(localize('com_ui_queue_moved', { 0: String(target + 1), 1: String(total) }));
      /* The row travels with its message, so the handle keeps the focus it
         had; the position it reports is what changed. */
      gripRef.current?.focus();
    },
    [index, total, reorderable, reorderQueued, message.id, onAnnounce, localize],
  );

  drop(rowRef);
  drag(gripRef);

  const fileCount = message.files?.length ?? 0;
  /** Paused-on-approval: `sendQueuedNow` can neither steer (no live reply
   *  accepting input) nor send (a run is still active), so it would just
   *  re-queue the message with nothing visible happening. */
  const sendDisabled = steering.duringRunActive && !steering.canSteer;

  return (
    <div
      ref={rowRef}
      role="listitem"
      data-testid="queued-message-row"
      className={cn(
        'flex items-center gap-2 border-b border-border-light px-3 py-1.5 text-sm last:border-b-0',
        isDragging && 'opacity-40',
      )}
    >
      <button
        ref={gripRef}
        type="button"
        data-testid="queued-message-grip"
        /* Kept even when there is nowhere to move to, rather than swapped for
           an icon: a queue that drains to one message would otherwise unmount
           the handle a keyboard user was holding, dropping focus to the top of
           the page. */
        aria-disabled={!reorderable}
        aria-label={localize('com_ui_queue_reorder', {
          0: String(index + 1),
          1: String(total),
        })}
        /* A handle announces what it is but not how to work it, and the keys
           are the only way through it without a pointer. */
        aria-describedby={reorderable ? REORDER_HINT_ID : undefined}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
            return;
          }
          /* Both keys scroll the rail's container otherwise, which would
             chase the row the press just moved. */
          event.preventDefault();
          move(event.key === 'ArrowUp' ? -1 : 1);
        }}
        className={cn(
          ICON_BTN,
          'p-0.5',
          reorderable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-40',
          canDrag && reorderable && 'touch-none',
        )}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="min-w-0 flex-1 truncate text-text-primary" title={message.text}>
        {message.text}
      </span>
      {fileCount > 0 && (
        <span
          className="shrink-0 text-xs text-text-secondary"
          title={localize('com_ui_queued_attachment_count', { 0: String(fileCount) })}
        >
          <span className="sr-only">
            {localize('com_ui_queued_attachment_count', { 0: String(fileCount) })}
          </span>
          <span aria-hidden="true">
            {localize(fileCount === 1 ? 'com_ui_attachment_count_one' : 'com_ui_attachment_count', {
              count: fileCount,
            })}
          </span>
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
          /* Only dropped once the words are somewhere else. The composer
             refuses when it is occupied or the user has moved to another
             chat, and removing the message anyway destroyed it. */
          const restored = onRestoreToComposer(
            message.text,
            message.files,
            { quotes: message.quotes, manualSkills: message.manualSkills },
            conversationId,
          );
          if (restored) {
            steering.removeQueued(message.id);
            return;
          }
          /* Refusing silently reads as a dead button: the row stays, nothing
             moves, and the reason (a draft in the box, another chat on screen)
             is somewhere the click was not. */
          showToast({
            message: localize('com_ui_queue_remove_blocked'),
            status: 'warning',
          });
        }}
        className={ICON_BTN}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Messages waiting for the current reply to finish, as a rail tucked behind
 * the composer's top edge. One row per message, three visible actions and no
 * overflow menu: the menu is where the old design hid a global preference
 * among item actions.
 *
 * The rail is also the running order: whatever sits at the top is what gets
 * sent when the reply lands, so rows can be dragged past one another by the
 * handle, or moved with the arrow keys while it holds focus. Only the drag is
 * pointer-bound, which is why the keys are on the handle rather than under it.
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
  /* Spoken only for the keys. A drag reorders on every crossing, and a reader
     narrating each one would be behind the pointer and in the way of it. */
  const [announcement, setAnnouncement] = useState('');
  const order = useMemo(() => queued.map((message) => message.id), [queued]);

  /* Cleared when the rail empties or the conversation changes: the region is
     removed with the rail and re-inserted with its old text still in it, which
     readers announce on insertion — so an unrelated new message replayed the
     last move. */
  const [spokenFor, setSpokenFor] = useState(steering.queueKey);
  if (spokenFor !== steering.queueKey || (queued.length === 0 && announcement !== '')) {
    setSpokenFor(steering.queueKey);
    setAnnouncement('');
  }

  if (queued.length === 0) {
    return null;
  }

  return (
    /* Inset and only rounded on top: the rail reads as paper tucked behind
       the composer rather than a second composer stacked on it.

       The rows are the list; the hint and the live region are not items, and a
       list that owns them reports the wrong count. */
    <div className="mx-3 overflow-hidden rounded-t-2xl border border-b-0 border-border-light bg-surface-secondary">
      <div
        role="list"
        aria-label={localize('com_ui_queued_messages')}
        data-testid="composer-queue"
        className="flex flex-col"
      >
        {queued.map((message: QueuedMessage, index: number) => (
          <QueueRow
            key={message.id}
            message={message}
            index={index}
            total={queued.length}
            order={order}
            steering={steering}
            conversationId={conversationId}
            onEditToComposer={onEditToComposer}
            onRestoreToComposer={onRestoreToComposer}
            onAnnounce={setAnnouncement}
          />
        ))}
      </div>
      {queued.length > 1 && (
        <span id={REORDER_HINT_ID} className="sr-only">
          {localize('com_ui_queue_reorder_hint')}
        </span>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

export default memo(Queue);
