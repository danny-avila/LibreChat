import { memo, useId, useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { useToastContext } from '@librechat/client';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import { X, Zap, Clock, Pencil, ChevronUp, ChevronDown } from 'lucide-react';
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
import { steerOverlayHeightFamily } from '~/store/steer';
import { carriedSteerContext, cn } from '~/utils';
import store from '~/store';

/** Restores a message's text into the composer, or refuses (false) when the
 *  composer is occupied / on another chat — see `restoreReclaimedSteer` in
 *  `ChatForm`. Shared by the in-flight cancel and the queued trash safety net. */
export type RestoreToComposer = (
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

/** Collapsed preview height (px) for a long steer before "Show more". Matched
 *  to the JS overflow check below so the toggle appears exactly when clipped;
 *  the tolerance absorbs the trailing markdown margin so content that fits but
 *  for its own bottom margin does not trip a pointless toggle. */
const STEER_COLLAPSED_MAX_HEIGHT = 128;
const STEER_OVERFLOW_TOLERANCE = 8;

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

  /** Long steers (several paragraphs) collapse to a preview so the stack stays
   *  scannable; the toggle is offered only once the content actually overflows
   *  the cap. `scrollHeight` reports the full height even while clamped, so the
   *  same check holds whether expanded or not, and the observer re-measures on
   *  the width reflows that change wrapped-line count. */
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = contentRef.current;
    if (el == null) {
      return;
    }
    const measure = () =>
      setOverflowing(el.scrollHeight - STEER_COLLAPSED_MAX_HEIGHT > STEER_OVERFLOW_TOLERANCE);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      /* Non-destructive, but only when it is safe: cancel reliably first (the
       * optimistic hook removes the chip and restores it if the server would
       * still inject), then hand the words back to the composer ONLY on a
       * `reclaimed` outcome. On `applied` (cancel lost the race) or `failed`
       * the steer may still reach the run, so restoring would duplicate the
       * text — in the response, or beside the restored bubble. The gated
       * restore also refuses rather than clobber a draft typed meanwhile. */
      key: 'cancel',
      label: localize('com_ui_steer_cancel'),
      icon: <X className="h-4 w-4" aria-hidden="true" />,
      onClick: () => {
        void cancelSteer(steer).then((outcome) => {
          if (outcome !== 'reclaimed') {
            return;
          }
          const restored = onRestoreToComposer(
            steer.text,
            steer.files,
            carriedSteerContext(steer),
            conversationId,
          );
          if (!restored) {
            /* Reclaimed, but the composer moved on (draft typed, answer mode,
             * navigated). The chip is already gone, so queue the words as Edit
             * does rather than drop them — never lost, just re-homed. */
            steering.queueReclaimedSteer(steer);
            showToast({ message: localize('com_ui_steer_edit_queued'), status: 'info' });
          }
        });
      },
    },
    toggleEntry,
  ];

  return (
    <div
      role="listitem"
      data-testid="in-flight-steer"
      data-steer-status={steer.status}
      /* pointer-events-auto: the overlay container disables events so wheeling
       * over the gaps reaches the messages behind; each bubble re-enables them
       * for its own controls and internal scroll. */
      className="group pointer-events-auto flex flex-col items-start gap-1.5"
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
      {/* items-start so the sticky controls have room to travel — see below. */}
      <div className="flex max-w-full items-start gap-1.5">
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
          <div className="flex min-w-0 flex-col items-start gap-1">
            <div
              ref={contentRef}
              id={contentId}
              className={cn('relative w-full', !expanded && 'overflow-hidden')}
              style={!expanded ? { maxHeight: STEER_COLLAPSED_MAX_HEIGHT } : undefined}
            >
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
              {!expanded && overflowing && (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface-secondary to-transparent"
                  aria-hidden="true"
                />
              )}
            </div>
            {overflowing && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                aria-controls={contentId}
                className="inline-flex items-center gap-1 rounded text-xs font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
              >
                {expanded ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {expanded ? localize('com_ui_show_less') : localize('com_ui_show_more')}
              </button>
            )}
          </div>
        </div>
        {!sending && (
          /* One always-visible affordance: a label-less menu hidden until hover
           * is undiscoverable, and edit/queue/cancel all live inside it now, so
           * the menu shows at rest on every pointer (matching the always-on
           * controls on the queued rows). `sticky` keeps it in view while the
           * user scrolls through a tall, expanded steer (the stack scrolls once
           * it passes 35vh). */
          <div data-testid="steer-controls" className="sticky top-2 flex shrink-0 items-center">
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
  const setOverlayHeight = useSetAtom(steerOverlayHeightFamily(conversationId));

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

  /** The overlay is pulled out of flow (absolute), so the messages no longer
   *  shrink to fit it. Publish its rendered height so the message scroll area
   *  can reserve an equal band of bottom padding — keeping the newest message
   *  clear of the overlay at rest while older ones scroll behind it. */
  useEffect(() => {
    const list = listRef.current;
    if (list == null) {
      setOverlayHeight(0);
      return;
    }
    const publish = () => setOverlayHeight(list.offsetHeight);
    publish();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(publish);
    observer.observe(list);
    return () => observer.disconnect();
  }, [setOverlayHeight, inFlight.length]);

  /** Drop the reserved band when the overlay leaves (run ends while steers are
   *  still in flight, or conversation switch) — the measure effect above only
   *  resets when it re-runs, which unmount does not do. */
  useEffect(() => () => setOverlayHeight(0), [setOverlayHeight]);

  if (inFlight.length === 0) {
    return null;
  }

  return (
    <div
      ref={listRef}
      role="list"
      aria-label={localize('com_ui_steer_in_flight')}
      data-testid="in-flight-steers"
      /* Floats above the composer over the bottom of the thread instead of
       * displacing it, so scrolling up reveals the messages behind. Capped: a
       * steer runs to 16k chars and a run takes up to 10 of them; unbounded it
       * would cover the whole thread. pointer-events-none lets wheeling over
       * the gaps reach those messages (each bubble opts back in). */
      className="pointer-events-none absolute inset-x-0 bottom-full flex max-h-[35vh] flex-col items-start gap-2 overflow-y-auto px-2 pb-2"
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
