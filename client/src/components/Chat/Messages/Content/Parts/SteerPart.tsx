import { memo, useMemo, useState, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { InfoHoverCard, ESide } from '@librechat/client';
import type { TFile, TMessage } from 'librechat-data-provider';
import type { TMessageIcon } from '~/common';
import FilePreviewDialog from '~/components/Chat/Messages/Content/FilePreviewDialog';
import MessageTimestamp from '~/components/Chat/Messages/ui/MessageTimestamp';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import MessageIcon from '~/components/Chat/Messages/MessageIcon';
import Image from '~/components/Chat/Messages/Content/Image';
import { useAuthContext } from '~/hooks/AuthContext';
import { fontSizeAtom } from '~/store/fontSize';
import { useShareContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const USER_ICON: TMessageIcon = { isCreatedByUser: true };

/**
 * A mid-run steering message rendered as a standard user message inside the
 * assistant response — same icon, author header, and text presentation as any
 * user turn, placed where the words enter the run so the visible order equals
 * what the next turn replays (`ContentTypes.STEER` splits back into a
 * HumanMessage server-side). Only the server-applied part renders here, at its
 * authoritative index; a steer still in flight lives in the composer's chip
 * stack. Renders identically live, on reload, and in shared/search views.
 */
const SteerPart = memo(function SteerPart({
  steer,
  files,
  steerId,
  createdAt,
}: {
  steer: string;
  files?: TMessage['files'];
  /** Anchors the part for the message-nav rail (`#steer-<id>` rib target). */
  steerId?: string;
  createdAt?: number;
}) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const fontSize = useAtomValue(fontSizeAtom);
  const { isSharedConvo } = useShareContext();
  const usernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const enableUserMsgMarkdown = useRecoilValue<boolean>(store.enableUserMsgMarkdown);

  /** The share surface must never label the SHARER's steers with the
   *  viewer's identity; always the generic user label there. */
  const label = useMemo(() => {
    if (isSharedConvo === true || !usernameDisplay) {
      return localize('com_user_message');
    }
    return (user?.name ?? '') || user?.username || localize('com_user_message');
  }, [isSharedConvo, usernameDisplay, user?.name, user?.username, localize]);
  const timestamp = useMemo(
    () => (createdAt != null ? new Date(createdAt).toISOString() : null),
    [createdAt],
  );
  const imageFiles = useMemo(
    () => files?.filter((file) => file.type?.startsWith('image/')) ?? [],
    [files],
  );
  const otherFiles = useMemo(
    () => files?.filter((file) => !file.type?.startsWith('image/')) ?? [],
    [files],
  );
  const [selectedFile, setSelectedFile] = useState<Partial<TFile> | null>(null);
  const handlePreviewClose = useCallback((open: boolean) => {
    if (!open) {
      setSelectedFile(null);
    }
  }, []);

  if (typeof steer !== 'string' || steer.length === 0) {
    return null;
  }

  return (
    <div
      id={steerId ? `steer-${steerId}` : undefined}
      className={cn(
        /* Outdented past the response's icon column so the steer sits flush
         * with top-level message rows — it reads as a regular user message. */
        'steer-render group relative my-4 -ml-9 flex w-[calc(100%+2.25rem)] gap-3',
      )}
      data-testid="steer-part"
    >
      <div className="relative flex flex-shrink-0 flex-col items-center">
        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          <MessageIcon iconData={USER_ICON} />
        </div>
      </div>
      <div className="user-turn relative flex w-11/12 flex-col">
        <h2 className={cn('flex select-none items-center gap-1.5 font-semibold', fontSize)}>
          {label}
          {/* Subtle "?" explaining why a user message appears inside the
           *  response. Like the message hover buttons, it's revealed on
           *  hover/focus on hover-capable pointers, but stays visible on
           *  touch (no hover to reveal it) via [@media(hover:hover)]:opacity-0. */}
          <span
            data-testid="steer-info-affordance"
            className="transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
          >
            <InfoHoverCard side={ESide.Top} text={localize('com_ui_steered_info')} />
          </span>
          <MessageTimestamp value={timestamp} />
        </h2>
        <div className="flex flex-col items-start gap-2">
          {(imageFiles.length > 0 || otherFiles.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {otherFiles.map((file) => (
                <FileContainer
                  key={file.file_id}
                  file={file as TFile}
                  onClick={() => setSelectedFile(file)}
                />
              ))}
              {imageFiles.map((file) => (
                <Image
                  key={file.file_id}
                  imagePath={file.preview ?? file.filepath ?? ''}
                  height={file.height ?? 1920}
                  width={file.width ?? 1080}
                  altText={file.filename ?? localize('com_ui_attached_image')}
                />
              ))}
            </div>
          )}
          <div
            className={cn(
              'markdown prose message-content dark:prose-invert light w-full break-words',
              !enableUserMsgMarkdown && 'whitespace-pre-wrap',
              'dark:text-gray-20',
            )}
          >
            {enableUserMsgMarkdown ? <MarkdownLite content={steer} /> : steer}
          </div>
        </div>
      </div>
      {otherFiles.length > 0 && (
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

export default SteerPart;
