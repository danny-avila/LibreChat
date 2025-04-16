import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { useAuthContext, useLocalize } from '~/hooks';
import type { TMessageProps, TMessageIcon } from '~/common';
import MinimalHoverButtons from '~/components/Chat/Messages/MinimalHoverButtons';
import Icon from '~/components/Chat/Messages/MessageIcon';
import SearchContent from './Content/SearchContent';
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
    <div className={cn('select-none font-semibold', fontSize)}>{messageLabel}</div>
    <SearchContent message={message} />
    <SubRow classes="text-xs">
      <MinimalHoverButtons message={message} />
      <SearchButtons message={message} />
    </SubRow>
  </div>
);

export default function SearchMessage({ message }: Pick<TMessageProps, 'message'>) {
  const UsernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const fontSize = useRecoilValue(store.fontSize);
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
