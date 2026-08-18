import type { TAttachment, TAttachmentMetadata, TFile } from 'librechat-data-provider';
import { ToolIcon, isError } from '~/components/Chat/Messages/Content/ToolOutput';
import { useLocalize } from '~/hooks';

export default function OpenAIVideoGen({
  initialProgress = 0.1,
  isSubmitting,
  output,
  attachments,
  hideAttachments = false,
}: {
  initialProgress: number;
  isSubmitting?: boolean;
  output?: string | null;
  attachments?: TAttachment[];
  hideAttachments?: boolean;
}) {
  const localize = useLocalize();
  const hasError = typeof output === 'string' && isError(output);
  const attachment = attachments?.[0] as (TFile & TAttachmentMetadata) | undefined;
  const wasCancelled = isSubmitting === false && initialProgress < 1;
  const storageFailed = isSubmitting === false && initialProgress >= 1 && !attachment?.filepath;
  const hasFailed = hasError || wasCancelled || storageFailed;
  const isInProgress = !hasFailed && (isSubmitting === true || initialProgress < 1);

  const status = hasFailed
    ? localize('com_ui_video_gen_failed')
    : isInProgress
      ? localize('com_ui_generating_video')
      : localize('com_ui_video_created');

  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {status}
      </span>
      <div className="relative my-1 flex h-5 shrink-0 items-center gap-2">
        <ToolIcon type="video_gen" isAnimating={isInProgress} />
        <span
          className={isInProgress ? 'progress-text-content shimmer font-medium' : 'font-medium'}
        >
          {status}
        </span>
      </div>
      {!hideAttachments && attachment?.filepath && (
        <video
          className="my-2 max-h-[70vh] w-full max-w-2xl rounded-xl bg-black"
          aria-label={attachment.filename || localize('com_ui_video_created')}
          src={attachment.filepath}
          controls
          preload="metadata"
        />
      )}
    </>
  );
}
