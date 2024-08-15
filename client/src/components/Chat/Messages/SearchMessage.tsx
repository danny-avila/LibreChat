import { useRecoilValue } from 'recoil';
import { useAuthContext, useLocalize } from '~/hooks';
import type { TMessageProps } from '~/common';
import MinimalHoverButtons from '~/components/Chat/Messages/MinimalHoverButtons';
import Icon from '~/components/Chat/Messages/MessageIcon';
import SearchContent from './Content/SearchContent';
import SearchButtons from './SearchButtons';
import SubRow from './SubRow';
import { cn } from '~/utils';
import store from '~/store';

export default function Message({ message }: Pick<TMessageProps, 'message'>) {
  const UsernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const fontSize = useRecoilValue(store.fontSize);
  const { user } = useAuthContext();
  const localize = useLocalize();

  if (!message) {
    return null;
  }

  const { isCreatedByUser } = message;

  let messageLabel = '';
  if (isCreatedByUser) {
    messageLabel = UsernameDisplay
      ? (user?.name ?? '') || user?.username
      : localize('com_user_message');
  } else {
    messageLabel = message.sender;
  }

  return (
    <>
      <div className="text-token-text-primary w-full border-0 bg-transparent dark:border-0 dark:bg-transparent">
        <div className="m-auto justify-center p-4 py-2 md:gap-6 ">
          <div className="final-completion group mx-auto flex flex-1 gap-3 md:max-w-3xl md:px-5 lg:max-w-[40rem] lg:px-1 xl:max-w-[48rem] xl:px-5">
            <div className="relative flex flex-shrink-0 flex-col items-end">
              <div>
                <div className="pt-0.5">
                  <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
                    <Icon message={message} />
                  </div>
                </div>
              </div>
            </div>
            <div
              className={cn('relative flex w-11/12 flex-col', isCreatedByUser ? '' : 'agent-turn')}
            >
              <div className={cn('select-none font-semibold', fontSize)}>{messageLabel}</div>
              <div className="flex-col gap-1 md:gap-3">
                <div className="flex max-w-full flex-grow flex-col gap-0">
                  <SearchContent message={message} />
                </div>
              </div>
              <SubRow classes="text-xs">
                <MinimalHoverButtons message={message} />
                <SearchButtons message={message} />
              </SubRow>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
