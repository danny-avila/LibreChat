import { memo, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps, TMessageIcon } from '~/common';
import MinimalHoverButtons from '~/components/Chat/Messages/MinimalHoverButtons';
import MessageTimestamp from '~/components/Chat/Messages/ui/MessageTimestamp';
import Icon from '~/components/Chat/Messages/MessageIcon';
import { useAuthContext, useLocalize } from '~/hooks';
import SearchContent from './Content/SearchContent';
import { fontSizeAtom } from '~/store/fontSize';
import SearchButtons from './SearchButtons';
import SubRow from './SubRow';
import { cn } from '~/utils';
import store from '~/store';

const MessageAvatar = ({ iconData }: { iconData: TMessageIcon }) => (
  <div className="relative flex flex-shrink-0 flex-col items-end">
    <div className="pt-0.5">
      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
        <Icon iconData={iconData} />
      </div>
    </div>
  </div>
);

const MessageBody = ({ message, messageLabel, fontSize }) => (
  <div
    className={cn('relative flex w-11/12 flex-col', message.isCreatedByUser ? '' : 'agent-turn')}
  >
    <div className={cn('select-none font-semibold', fontSize)}>
      {messageLabel}
      <MessageTimestamp value={message.createdAt ?? message.clientTimestamp} />
    </div>
    <SearchContent message={message} />
    <SubRow classes="text-xs">
      <MinimalHoverButtons message={message} />
      <SearchButtons message={message} />
    </SubRow>
  </div>
);

function searchFilesEqual(prev?: TMessage['files'], next?: TMessage['files']) {
  if (prev === next) {
    return true;
  }
  const prevLen = prev?.length ?? 0;
  const nextLen = next?.length ?? 0;
  if (prevLen !== nextLen) {
    return false;
  }
  return prev?.every((file, index) => file.file_id === next?.[index]?.file_id) ?? true;
}

/**
 * Field-level comparator for `memo(SearchMessage)`. The virtualized `rowRenderer`
 * closure and the file-remap `useMemo` in the Search route can hand a fresh
 * `message` object with identical content on every parent render, so a shallow
 * compare would defeat the memo — compare only the fields that drive the row.
 */
export function areSearchMessagePropsEqual(
  prev: Pick<TMessageProps, 'message'>,
  next: Pick<TMessageProps, 'message'>,
): boolean {
  const a = prev.message;
  const b = next.message;
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return a === b;
  }
  return (
    a.messageId === b.messageId &&
    a.text === b.text &&
    a.content === b.content &&
    a.createdAt === b.createdAt &&
    /** Timestamp falls back to `clientTimestamp` when `createdAt` is absent. */
    a.clientTimestamp === b.clientTimestamp &&
    a.isCreatedByUser === b.isCreatedByUser &&
    a.sender === b.sender &&
    a.model === b.model &&
    a.endpoint === b.endpoint &&
    a.iconURL === b.iconURL &&
    /** `SearchContent` renders an incomplete-response notice on `unfinished`. */
    a.unfinished === b.unfinished &&
    /** `SearchButtons` renders `title` and navigates by `conversationId`, so a
     *  rename/refetch that leaves the text and id intact must still re-render. */
    a.title === b.title &&
    a.conversationId === b.conversationId &&
    searchFilesEqual(a.files, b.files)
  );
}

function SearchMessage({ message }: Pick<TMessageProps, 'message'>) {
  const fontSize = useAtomValue(fontSizeAtom);
  const UsernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const { user } = useAuthContext();
  const localize = useLocalize();

  const iconData: TMessageIcon = useMemo(
    () => ({
      endpoint: message?.endpoint ?? '',
      model: message?.model ?? '',
      iconURL: message?.iconURL ?? '',
      isCreatedByUser: message?.isCreatedByUser ?? false,
    }),
    [message?.endpoint, message?.model, message?.iconURL, message?.isCreatedByUser],
  );

  const messageLabel = useMemo(() => {
    if (message?.isCreatedByUser) {
      return UsernameDisplay
        ? (user?.name ?? '') || (user?.username ?? '')
        : localize('com_user_message');
    }
    return message?.sender ?? '';
  }, [
    message?.isCreatedByUser,
    message?.sender,
    UsernameDisplay,
    user?.name,
    user?.username,
    localize,
  ]);

  if (!message) {
    return null;
  }

  return (
    <div className="text-token-text-primary w-full bg-transparent">
      <div className="m-auto p-4 py-2 md:gap-6">
        <div className="final-completion group mx-auto flex flex-1 gap-3 md:max-w-3xl md:px-5 lg:max-w-[40rem] lg:px-1 xl:max-w-[48rem] xl:px-5">
          <MessageAvatar iconData={iconData} />
          <MessageBody message={message} messageLabel={messageLabel} fontSize={fontSize} />
        </div>
      </div>
    </div>
  );
}

export default memo(SearchMessage, areSearchMessagePropsEqual);
