import { memo } from 'react';
import { X, Zap } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import type { TFile } from 'librechat-data-provider';
import type { PendingSteer } from '~/store/families';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import Image from '~/components/Chat/Messages/Content/Image';
import { useSteerCancel, useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

/**
 * One steer on its way into the run, anchored above the composer as a message
 * bubble rather than a control chip — the words are already part of the
 * conversation, they just have no in-thread index yet. It leaves on
 * `on_steer_applied`, when the persisted STEER part lands at its authoritative
 * position in the response.
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
  const sending = steer.status === 'sending';
  const files = steer.files ?? [];

  return (
    <div
      role="listitem"
      data-testid="in-flight-steer"
      data-steer-status={steer.status}
      className="group flex flex-col items-start gap-1.5"
    >
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file) =>
            file.type?.startsWith('image/') === true ? (
              <div key={file.file_id} className="h-14 w-14 overflow-hidden rounded-lg">
                <Image
                  imagePath={file.preview ?? file.filepath ?? ''}
                  height={file.height ?? 1920}
                  width={file.width ?? 1080}
                  altText={file.filename ?? localize('com_ui_attached_image')}
                />
              </div>
            ) : (
              <FileContainer key={file.file_id} file={file as TFile} />
            ),
          )}
        </div>
      )}
      <div className="flex max-w-full items-center gap-1.5">
        <div
          className={cn(
            'min-w-0 rounded-3xl bg-surface-secondary px-4 py-2 text-sm text-text-primary',
            'whitespace-pre-wrap break-words',
            sending && 'opacity-70',
          )}
        >
          {steer.text}
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
  const inFlight = steers.filter((steer) => steer.status !== 'failed');

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
