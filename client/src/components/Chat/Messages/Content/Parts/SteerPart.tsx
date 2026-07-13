import { memo, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import type { TFile, TMessage } from 'librechat-data-provider';
import type { TMessageIcon } from '~/common';
import MessageTimestamp from '~/components/Chat/Messages/ui/MessageTimestamp';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import MessageIcon from '~/components/Chat/Messages/MessageIcon';
import Image from '~/components/Chat/Messages/Content/Image';
import { useAuthContext } from '~/hooks/AuthContext';
import { fontSizeAtom } from '~/store/fontSize';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const USER_ICON: TMessageIcon = { isCreatedByUser: true };

/**
 * A mid-run steering message rendered as a standard user message inside the
 * assistant response — same icon, author header, and text presentation as any
 * user turn, placed where the words enter the run so the visible order equals
 * what the next turn replays (`ContentTypes.STEER` splits back into a
 * HumanMessage server-side). Renders identically as the optimistic entry
 * (`pending`, before the server applies it), as the persisted part live and
 * on reload, and in shared/search views.
 */
const SteerPart = memo(function SteerPart({
  steer,
  files,
  createdAt,
  pending = false,
}: {
  steer: string;
  files?: TMessage['files'];
  createdAt?: number;
  pending?: boolean;
}) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const fontSize = useAtomValue(fontSizeAtom);
  const usernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const enableUserMsgMarkdown = useRecoilValue<boolean>(store.enableUserMsgMarkdown);

  const label = useMemo(() => {
    if (!usernameDisplay) {
      return localize('com_user_message');
    }
    return (user?.name ?? '') || user?.username || localize('com_user_message');
  }, [usernameDisplay, user?.name, user?.username, localize]);
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

  if (typeof steer !== 'string' || steer.length === 0) {
    return null;
  }

  return (
    <div
      className={cn('group relative my-4 flex w-full gap-3', pending && 'opacity-80')}
      data-testid="steer-part"
      data-steer-pending={pending || undefined}
    >
      <div className="relative flex flex-shrink-0 flex-col items-center">
        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          <MessageIcon iconData={USER_ICON} />
        </div>
      </div>
      <div className="user-turn relative flex w-11/12 flex-col">
        <h2 className={cn('select-none font-semibold', fontSize)}>
          {label}
          <MessageTimestamp value={timestamp} />
        </h2>
        <div className="flex flex-col items-start gap-2">
          {(imageFiles.length > 0 || otherFiles.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {otherFiles.map((file) => (
                <FileContainer key={file.file_id} file={file as TFile} />
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
    </div>
  );
});

export default SteerPart;
