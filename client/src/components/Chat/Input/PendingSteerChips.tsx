import { memo, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import {
  X,
  Zap,
  Send,
  Clock,
  Pencil,
  Trash2,
  Paperclip,
  RotateCcw,
  MoreHorizontal,
} from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import type { SteeringControls, QueuedMessageContext } from '~/hooks/Chat/useSteering';
import type { PendingSteer, QueuedMessage } from '~/store/families';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const ROW_CLASS =
  'flex w-full items-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary';
const PRIMARY_BTN_CLASS =
  'flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy';
const ICON_BTN_CLASS =
  'shrink-0 rounded-full p-1 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy';
const MENU_CLASS =
  'z-50 min-w-[13rem] rounded-xl border border-border-light bg-surface-secondary p-1.5 text-text-primary shadow-lg outline-none';
const MENU_ITEM_CLASS =
  'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-primary data-[active-item]:bg-surface-tertiary aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

type MenuEntry = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
};

/** Per-row "…" overflow menu (edit / mode toggle / conversions). */
function RowMenu({ label, entries }: { label: string; entries: MenuEntry[] }) {
  const menu = Ariakit.useMenuStore({ placement: 'top-end' });
  return (
    <>
      <Ariakit.MenuButton store={menu} aria-label={label} className={ICON_BTN_CLASS}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Ariakit.MenuButton>
      <Ariakit.Menu store={menu} portal gutter={6} className={MENU_CLASS}>
        {entries.map((entry) => (
          <Ariakit.MenuItem
            key={entry.key}
            className={MENU_ITEM_CLASS}
            onClick={() => {
              entry.onClick();
              menu.hide();
            }}
          >
            {entry.icon}
            {entry.label}
          </Ariakit.MenuItem>
        ))}
      </Ariakit.Menu>
    </>
  );
}

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
 * The overflow item that flips the Enter-during-run default. Shown as the
 * OPPOSITE of the current default (the action you would switch to), matching
 * the reference UX ("Turn on queueing" while steer is the default).
 */
function useDefaultToggleEntry(steering: SteeringControls): MenuEntry {
  const localize = useLocalize();
  return useMemo(() => {
    const next = steering.defaultAction === 'steer' ? 'queue' : 'steer';
    return {
      key: 'toggle-default',
      label:
        next === 'queue'
          ? localize('com_ui_turn_on_queueing')
          : localize('com_ui_turn_on_steering'),
      icon:
        next === 'queue' ? (
          <Clock className="h-4 w-4 text-cyan-500" aria-hidden="true" />
        ) : (
          <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
        ),
      onClick: () => steering.setDefaultAction(next),
    };
  }, [steering, localize]);
}

function QueuedRow({
  message,
  steering,
  onEditToComposer,
}: {
  message: QueuedMessage;
  steering: SteeringControls;
  onEditToComposer: (
    text: string,
    files?: TMessage['files'],
    context?: QueuedMessageContext,
  ) => void;
}) {
  const localize = useLocalize();
  const toggleEntry = useDefaultToggleEntry(steering);
  const fileCount = message.files?.length ?? 0;
  const canSteerNow = steering.duringRunActive && steering.canSteer;
  const showPrimary = canSteerNow || !steering.duringRunActive;

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
      <button
        type="button"
        aria-label={localize('com_ui_remove_queued')}
        onClick={() => steering.removeQueued(message.id)}
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
          steering.retrySteer(steer.steerId, steer.text, steer.files, {
            quotes: steer.quotes,
            manualSkills: steer.manualSkills,
          })
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
 * - Failed steer rows (Zap, red): the POST failed, so the text never entered
 *   the thread — kept recoverable with retry / edit / queue actions.
 *   (Sending/pending steers render in-thread as user messages instead.)
 * - Queued rows (Clock): client-side follow-ups auto-sent after the run.
 */
function PendingSteerChips({
  conversationId,
  steering,
  onEditToComposer,
}: {
  conversationId: string;
  steering: SteeringControls;
  onEditToComposer: (
    text: string,
    files?: TMessage['files'],
    context?: QueuedMessageContext,
  ) => void;
}) {
  const localize = useLocalize();
  const steers = useRecoilValue(store.pendingSteersByConvoId(conversationId));
  const queued = useRecoilValue(store.queuedMessagesByConvoId(steering.queueKey));
  const failedSteers = useMemo(() => steers.filter((steer) => steer.status === 'failed'), [steers]);

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
          onEditToComposer={onEditToComposer}
        />
      ))}
    </div>
  );
}

export default memo(PendingSteerChips);
