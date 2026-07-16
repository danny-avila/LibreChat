import { memo, useMemo, useState, useCallback } from 'react';
import { X, Zap } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import type { TFile, TMessage } from 'librechat-data-provider';
import type { PendingSteer } from '~/store/families';
import FilePreviewDialog from '~/components/Chat/Messages/Content/FilePreviewDialog';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import ImagePreview from '~/components/Chat/Input/Files/ImagePreview';
import { useSteerCancel, useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

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
 * boundary.
 */
const InFlightSteer = memo(function InFlightSteer({
  steer,
  conversationId,
}: {
  steer: PendingSteer;
  conversationId: string;
}) {
  const localize = useLocalize();
  const cancelSteer = useSteerCancel(conversationId);
  const enableUserMsgMarkdown = useRecoilValue<boolean>(store.enableUserMsgMarkdown);
  const [selectedFile, setSelectedFile] = useState<Partial<TFile> | null>(null);
  const handlePreviewClose = useCallback((open: boolean) => {
    if (!open) {
      setSelectedFile(null);
    }
  }, []);

  const { images, others } = useMemo(() => splitFiles(steer.files), [steer.files]);
  const sending = steer.status === 'sending';

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
            'markdown prose message-content dark:prose-invert light min-w-0 break-words',
            'rounded-3xl bg-surface-secondary px-4 py-2 text-sm text-text-primary dark:text-gray-20',
            !enableUserMsgMarkdown && 'whitespace-pre-wrap',
            sending && 'opacity-70',
          )}
        >
          {enableUserMsgMarkdown ? <MarkdownLite content={steer.text} /> : steer.text}
        </div>
        <Zap
          className={cn('h-3.5 w-3.5 shrink-0 text-amber-500', sending && 'opacity-50')}
          aria-hidden="true"
        />
        <span className="sr-only">{localize('com_ui_steer_in_flight')}</span>
        {!sending && (
          <button
            type="button"
            aria-label={localize('com_ui_steer_cancel')}
            onClick={() => cancelSteer(steer)}
            data-testid="steer-cancel"
            className="shrink-0 rounded-full p-1 text-text-secondary opacity-0 transition-opacity duration-200 hover:bg-surface-tertiary hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
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
  conversationId,
}: {
  conversationId: string;
}) {
  const localize = useLocalize();
  const steers = useRecoilValue(store.pendingSteersByConvoId(conversationId));
  const inFlight = useMemo(() => steers.filter((steer) => steer.status !== 'failed'), [steers]);

  if (inFlight.length === 0) {
    return null;
  }

  return (
    <div
      role="list"
      aria-label={localize('com_ui_steer_in_flight')}
      data-testid="in-flight-steers"
      className="flex flex-col items-start gap-2 px-2 pb-2"
    >
      {inFlight.map((steer) => (
        <InFlightSteer key={steer.steerId} steer={steer} conversationId={conversationId} />
      ))}
    </div>
  );
});

export default InFlightSteers;
