import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import { Zap, Clock, Pencil, Trash2, RotateCcw, TextQuote, WandSparkles } from 'lucide-react';
import type { TMessage, TConversation } from 'librechat-data-provider';
import type { SteeringControls, QueuedMessageContext } from '~/hooks/Chat/useSteering';
import type { ComposerItem, ComposerItemKind } from '~/hooks/Input/useComposerItems';
import type { PendingSteer, QueuedMessage } from '~/store/families';
import type { RestoreToComposer } from '../InFlightSteers';
import type { ExtendedFile, FileSetter } from '~/common';
import type { MenuEntry } from '../SteerMenu';
import { RowMenu, useDefaultToggleEntry, ICON_BTN_CLASS, PRIMARY_BTN_CLASS } from '../SteerMenu';
import { useFileHandlingNoChatContext } from '~/hooks';
import Chip, { type ChipTone } from './Chip';
import FileRow from '../Files/FileRow';
import { useLocalize } from '~/hooks';
import store from '~/store';

const KIND_ICON: Record<ComposerItemKind, JSX.Element> = {
  quote: <TextQuote className="h-4 w-4" aria-hidden="true" />,
  skill: <WandSparkles className="h-4 w-4" aria-hidden="true" />,
};

const KIND_REMOVE_KEY = {
  quote: 'com_ui_remove_quote',
  skill: 'com_ui_remove_skill',
} as const;

function ItemChip({ item }: { item: ComposerItem }) {
  const localize = useLocalize();

  return (
    <Chip
      tone={item.kind as ChipTone}
      label={item.label}
      title={item.title}
      icon={KIND_ICON[item.kind]}
      onRemove={item.remove}
      removeLabel={localize(KIND_REMOVE_KEY[item.kind])}
      data-testid={`composer-chip-${item.kind}`}
    />
  );
}

function QueuedChip({
  message,
  steering,
  conversationId,
  onEditToComposer,
  onRestoreToComposer,
}: {
  message: QueuedMessage;
  steering: SteeringControls;
  conversationId: string;
  onEditToComposer: (
    text: string,
    files?: TMessage['files'],
    context?: QueuedMessageContext,
  ) => void;
  onRestoreToComposer: RestoreToComposer;
}) {
  const localize = useLocalize();
  const toggleEntry = useDefaultToggleEntry(steering);
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
    <Chip
      block
      tone="queued"
      label={message.text}
      icon={<Clock className="h-4 w-4" aria-hidden="true" />}
      data-testid="queued-message-row"
      trailing={
        <>
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
                localize('com_ui_send_now')
              )}
            </button>
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
        </>
      }
    />
  );
}

function FailedSteerChip({
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
    <Chip
      block
      tone="failed"
      label={steer.text}
      icon={<Zap className="h-4 w-4" aria-hidden="true" />}
      data-testid="steer-message-row"
      onRemove={() => steering.removeSteer(steer.steerId)}
      removeLabel={localize('com_ui_remove_queued')}
      trailing={
        <>
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
          <RowMenu label={localize('com_ui_more_options')} entries={entries} />
        </>
      }
    />
  );
}

interface TrayProps {
  items: ComposerItem[];
  conversationId: string;
  conversation: TConversation | null;
  /** Staged uploads, rendered by `FileRow` with their own delete semantics. */
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isRTL: boolean;
  steering: SteeringControls;
  steeringEnabled: boolean;
  onEditToComposer: (
    text: string,
    files?: TMessage['files'],
    context?: QueuedMessageContext,
  ) => void;
  onRestoreToComposer: RestoreToComposer;
}

/**
 * The composer's single staged-context region. Replaces the four stacked rows
 * (uploads, quotes, manual skills, queued/failed steers) with one region: file
 * cards first, then the pills, then the queued and failed rows — which carry
 * their own primary action and overflow menu — full width beneath them.
 *
 * Files keep `FileRow` rather than being flattened into pills: the card is
 * where an image preview opens full size, where upload progress and the storage
 * source are drawn, and where aborting a part-done upload differs from deleting
 * a finished one.
 */
function Tray({
  items,
  conversationId,
  conversation,
  files,
  setFiles,
  setFilesLoading,
  isRTL,
  steering,
  steeringEnabled,
  onEditToComposer,
  onRestoreToComposer,
}: TrayProps) {
  const localize = useLocalize();
  const steers = useRecoilValue(store.pendingSteersByConvoId(conversationId));
  const queued = useRecoilValue(store.queuedMessagesByConvoId(steering.queueKey));
  const { abortUpload } = useFileHandlingNoChatContext(undefined, {
    files,
    setFiles,
    setFilesLoading,
    conversation,
  });

  const failedSteers = steeringEnabled ? steers.filter((steer) => steer.status === 'failed') : [];
  const queuedMessages = steeringEnabled ? queued : [];

  if (
    items.length === 0 &&
    files.size === 0 &&
    failedSteers.length === 0 &&
    queuedMessages.length === 0
  ) {
    return null;
  }

  return (
    <div
      role="list"
      aria-label={localize('com_ui_composer_staged_context')}
      data-testid="composer-tray"
      className="flex flex-col gap-1.5 px-2 pt-2"
    >
      <FileRow
        files={files}
        setFiles={setFiles}
        isRTL={isRTL}
        abortUpload={abortUpload}
        setFilesLoading={setFilesLoading}
      />
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <ItemChip key={item.id} item={item} />
          ))}
        </div>
      )}
      {failedSteers.map((steer) => (
        <FailedSteerChip
          key={steer.steerId}
          steer={steer}
          steering={steering}
          onEditToComposer={onEditToComposer}
        />
      ))}
      {queuedMessages.map((message) => (
        <QueuedChip
          key={message.id}
          message={message}
          steering={steering}
          conversationId={conversationId}
          onEditToComposer={onEditToComposer}
          onRestoreToComposer={onRestoreToComposer}
        />
      ))}
    </div>
  );
}

export default memo(Tray);
