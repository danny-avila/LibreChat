import { memo, useMemo } from 'react';
import { Zap } from 'lucide-react';
import type { TFile, TMessage } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import Image from '~/components/Chat/Messages/Content/Image';
import { useLocalize } from '~/hooks';

/**
 * A mid-run steering message rendered inline within the assistant response —
 * a user-style bubble marking where the user's words entered the run, with
 * any attachments that rode the steer. The part is server-persisted
 * (`ContentTypes.STEER`), so this renders identically live, on reload, and
 * in shared/search views.
 */
const SteerBubble = memo(function SteerBubble({
  steer,
  files,
}: {
  steer: string;
  files?: TMessage['files'];
}) {
  const localize = useLocalize();
  const imageFiles = useMemo(
    () => files?.filter((file) => file.type?.startsWith('image/')) ?? [],
    [files],
  );
  const otherFiles = useMemo(
    () => files?.filter((file) => !file.type?.startsWith('image/')) ?? [],
    [files],
  );
  if (typeof steer !== 'string' || steer.length === 0) {
    return null;
  }
  return (
    <div className="my-3 flex w-full flex-col items-end" data-testid="steer-bubble">
      <span className="mb-1 flex items-center gap-1 text-xs text-text-tertiary">
        <Zap className="h-3 w-3 text-amber-500" aria-hidden="true" />
        {localize('com_ui_steered_label')}
      </span>
      {(imageFiles.length > 0 || otherFiles.length > 0) && (
        <div className="mb-1.5 flex max-w-[85%] flex-wrap justify-end gap-2">
          {otherFiles.map((file) => (
            <FileContainer key={file.file_id} file={file as TFile} />
          ))}
          {imageFiles.map((file) => (
            <Image
              key={file.file_id}
              imagePath={file.preview ?? file.filepath ?? ''}
              height={file.height ?? 1920}
              width={file.width ?? 1080}
              altText={file.filename ?? 'Attached image'}
            />
          ))}
        </div>
      )}
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-surface-secondary px-4 py-2.5 text-text-primary">
        {steer}
      </div>
    </div>
  );
});

export default SteerBubble;
