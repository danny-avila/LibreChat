import { memo, useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { X, Zap, Clock, Pencil } from 'lucide-react';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import type { TFile, TMessage } from 'librechat-data-provider';
import type { SteeringControls, QueuedMessageContext } from '~/hooks/Chat/useSteering';
import type { PendingSteer } from '~/store/families';
import type { MenuEntry } from './SteerMenu';
import FilePreviewDialog from '~/components/Chat/Messages/Content/FilePreviewDialog';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import { useSteerCancel, useSteerReclaim, useLocalize } from '~/hooks';
import ImagePreview from '~/components/Chat/Input/Files/ImagePreview';
import { RowMenu, useDefaultToggleEntry } from './SteerMenu';
import { carriedSteerContext, cn } from '~/utils';
import store from '~/store';

/** Restores a reclaimed steer into the composer, or refuses (false) when the
 *  composer has moved on — see `restoreReclaimedSteer` in `ChatForm`. */
type RestoreToComposer = (
  text: string,
  files: TMessage['files'],
  context: QueuedMessageContext,
  originConversationId: string,
) => boolean;

const splitFiles = (files?: TMessage['files']) => {
  const images: NonNullable<TMessage['files']> = [];
  const others: NonNullable<TMessage['files']> = [];
  for (const file of files ?? []) {
    (file.type?.startsWith('image/') === true ? images : others).push(file);
  }
  return { images, others };
};

/**
 * One steer on its way into the run, anchored above the composer as a message
 * bubble rather than a control chip — the words are already part of the
 * conversation, they just have no in-thread index yet. It leaves on
 * `on_steer_applied`, when the persisted STEER part lands at its authoritative
 * position in the response.
 *
 * Text and attachments render through the same leaves as the applied
 * `SteerPart` (markdown toggle, file preview) so the words don't reformat the
 * moment the server injects them.
 *
 * `sending` is still awaiting its 202 ACK (no server id yet, so nothing to
 * cancel); `pending` is acknowledged and waiting on the next tool-batch
 * boundary. Every control here reclaims the steer from the server queue first,
 * so they are offered only once `pending` — while `sending` there is no id to
 * reclaim with, and the words cannot be held back.
 */
const InFlightSteer = memo(function InFlightSteer({
  steer,
  steering,
  conversationId,
  onRestoreToComposer,
}: {
  steer: PendingSteer;
  steering: SteeringControls;
  conversationId: string;
  onRestoreToComposer: RestoreToComposer;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const cancelSteer = useSteerCancel(conversationId);
  const reclaimSteer = useSteerReclaim(conversationId);
  const toggleEntry = useDefaultToggleEntry(steering);
  const enableUserMsgMarkdown = useRecoilValue<boolean>(store.enableUserMsgMarkdown);
  const [selectedFile, setSelectedFile] = useState<Partial<TFile> | null>(null);
  const handlePreviewClose = useCallback((open: boolean) => {
    if (!open) {
      setSelectedFile(null);
    }
  }, []);

  const { images, others } = useMemo(() => splitFiles(steer.files), [steer.files]);
  const sending = steer.status === 'sending';

  /** Whether the words have already been re-homed by a terminal conversion (a
   *  run that ended/errored mid-reclaim queues the still-present chip). The
   *  queue action is safe either way — the conversion dedupes by id — but a
   *  composer restore would leave one copy queued and another in the draft. */
  const hasSettled = useRecoilCallback(
    ({ snapshot }) =>
      (steerId: string) =>
        snapshot
          .getLoadable(store.appliedSteerIdsByConvoId(conversationId))
          .getValue()
          .includes(steerId),
    [conversationId],
  );

  /**
   * Takes the steer back off the server queue so its words can be re-homed.
   * The chip is left alone until the answer is known: only `reclaimed` proves
   * the words never entered the run, and the re-homing callers below own the
   * removal from there.
   */
  const reclaim = useCallback(async (): Promise<boolean> => {
    const outcome = await reclaimSteer(steer);
    if (outcome === 'reclaimed') {
      return true;
    }
    showToast({
      message: localize(
        outcome === 'applied' ? 'com_ui_steer_already_applied' : 'com_ui_steer_cancel_failed',
      ),
      status: outcome === 'applied' ? 'info' : 'error',
    });
    return false;
  }, [reclaimSteer, steer, showToast, localize]);

  const entries: MenuEntry[] = [
    {
      key: 'edit',
      label: localize('com_ui_edit_message'),
      icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
      onClick: () => {
        void reclaim().then((reclaimed) => {
          if (!reclaimed) {
            return;
          }
          if (hasSettled(steer.steerId)) {
            /* The run ended while the reclaim was in flight and its terminal
             * conversion already queued these words. */
            showToast({ message: localize('com_ui_steer_run_ended_queued'), status: 'info' });
            return;
          }
          const restored = onRestoreToComposer(
            steer.text,
            steer.files,
            carriedSteerContext(steer),
            conversationId,
          );
          if (restored) {
            steering.removeSteer(steer.steerId);
            return;
          }
          /* The composer moved on while the reclaim was in flight. The words
           * are already off the server, so queue them rather than overwrite a
           * newer draft — neither text is the one to throw away. */
          steering.queueReclaimedSteer(steer);
          showToast({ message: localize('com_ui_steer_edit_queued'), status: 'info' });
        });
      },
    },
    {
      key: 'queue',
      label: localize('com_ui_convert_to_queue'),
      icon: <Clock className="h-4 w-4 text-cyan-500" aria-hidden="true" />,
      onClick: () => {
        void reclaim().then((reclaimed) => {
          if (reclaimed) {
            steering.queueReclaimedSteer(steer);
          }
        });
      },
    },
    {
      /* Cancel needs no reclaim gate — it drops the words, so there is nothing
       * to re-home; the optimistic hook removes the chip and restores it only
       * if the server would still inject it. */
      key: 'cancel',
      label: localize('com_ui_steer_cancel'),
      icon: <X className="h-4 w-4" aria-hidden="true" />,
      onClick: () => void cancelSteer(steer),
    },
    toggleEntry,
  ];

  return (
    <div
      role="listitem"
      data-testid="in-flight-steer"
      data-steer-status={steer.status}
      className="group flex flex-col items-start gap-1.5"
    >
      {(images.length > 0 || others.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {others.map((file) => (
            <FileContainer
              key={file.file_id}
              file={file as TFile}
              onClick={() => setSelectedFile(file)}
            />
          ))}
          {images.map((file) => (
            <div
              key={file.file_id}
              className="overflow-hidden rounded-xl border border-border-light"
            >
              <ImagePreview
                url={file.preview ?? file.filepath}
                alt={file.filename ?? localize('com_ui_attached_image')}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex max-w-full items-center gap-1.5">
        <div
          className={cn(
            /* Outlined, not just filled: an in-flight steer is provisional —
             * the fill alone reads as a settled message. */
            'flex min-w-0 items-start gap-2 rounded-3xl border border-border-medium',
            'bg-surface-secondary py-2 pl-3 pr-4 text-sm text-text-primary',
            sending && 'opacity-70',
          )}
        >
          <Zap className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          <span className="sr-only">{localize('com_ui_steer_in_flight')}</span>
          <div
            className={cn(
              'markdown prose message-content dark:prose-invert light min-w-0 break-words',
              'dark:text-gray-20',
              !enableUserMsgMarkdown && 'whitespace-pre-wrap',
            )}
          >
            {/* No code execution: this bubble sits outside MessageContext, so
             *  Run Code would fire with no message/part to target. */}
            {enableUserMsgMarkdown ? (
              <MarkdownLite content={steer.text} codeExecution={false} />
            ) : (
              steer.text
            )}
          </div>
        </div>
        {!sending && (
          /* One always-visible affordance: a label-less menu hidden until hover
           * is undiscoverable, and edit/queue/cancel all live inside it now, so
           * the menu shows at rest on every pointer (matching the always-on
           * controls on the queued rows). */
          <div data-testid="steer-controls" className="flex shrink-0 items-center">
            <RowMenu label={localize('com_ui_more_options')} entries={entries} />
          </div>
        )}
      </div>
      {others.length > 0 && (
        <FilePreviewDialog
          open={selectedFile !== null}
          onOpenChange={handlePreviewClose}
          fileName={selectedFile?.filename ?? ''}
          fileId={selectedFile?.file_id}
          filePath={selectedFile?.filepath}
          fileType={selectedFile?.type ?? undefined}
          fileSize={(selectedFile as TFile | null)?.bytes}
        />
      )}
    </div>
  );
});

/**
 * Steers the server hasn't applied yet, stacked directly above the composer.
 * Anchoring them here (instead of guessing an in-thread injection point on the
 * streaming message) keeps the thread showing only what the server actually
 * committed, while the user still sees their words land somewhere stable.
 */
const InFlightSteers = memo(function InFlightSteers({
  steering,
  conversationId,
  onRestoreToComposer,
}: {
  steering: SteeringControls;
  conversationId: string;
  onRestoreToComposer: RestoreToComposer;
}) {
  const localize = useLocalize();
  const steers = useRecoilValue(store.pendingSteersByConvoId(conversationId));
  const inFlight = useMemo(() => steers.filter((steer) => steer.status !== 'failed'), [steers]);

  /** Steers append newest-last, so an overflowing stack would sit scrolled to
   *  the oldest — the steer just submitted (and its cancel) would be below the
   *  fold and read as dropped. Keyed on the newest id, not every render. */
  const listRef = useRef<HTMLDivElement>(null);
  const newestId = inFlight[inFlight.length - 1]?.steerId;
  useEffect(() => {
    const list = listRef.current;
    if (list != null) {
      list.scrollTop = list.scrollHeight;
    }
  }, [newestId]);

  if (inFlight.length === 0) {
    return null;
  }

  return (
    <div
      ref={listRef}
      role="list"
      aria-label={localize('com_ui_steer_in_flight')}
      data-testid="in-flight-steers"
      /* Capped: a steer runs to 16k chars and a run takes up to 10 of them.
       * Unbounded, the stack would push the composer off-screen — the old
       * in-thread slot could grow freely because it scrolled with the thread. */
      className="flex max-h-[35vh] flex-col items-start gap-2 overflow-y-auto px-2 pb-2"
    >
      {inFlight.map((steer) => (
        <InFlightSteer
          key={steer.steerId}
          steer={steer}
          steering={steering}
          conversationId={conversationId}
          onRestoreToComposer={onRestoreToComposer}
        />
      ))}
    </div>
  );
});

export default InFlightSteers;
