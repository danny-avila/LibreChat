import { useRecoilValue } from 'recoil';
import type { TMessageProps } from '~/common';
import MinimalHoverButtons from '~/components/Chat/Messages/MinimalHoverButtons';
import MessageContent from '~/components/Chat/Messages/Content/MessageContent';
import SearchContent from '~/components/Chat/Messages/Content/SearchContent';
import SiblingSwitch from '~/components/Chat/Messages/SiblingSwitch';
import { Plugin } from '~/components/Messages/Content';
import SubRow from '~/components/Chat/Messages/SubRow';
// eslint-disable-next-line import/no-cycle
import MultiMessage from './MultiMessage';
import { cn } from '~/utils';
import store from '~/store';

import Icon from './MessageIcon';
export default function Message(props: TMessageProps) {
  const fontSize = useRecoilValue(store.fontSize);
  const {
    message,
    siblingIdx,
    siblingCount,
    conversation,
    setSiblingIdx,
    currentEditId,
    setCurrentEditId,
  } = props;

  if (!message) {
    return null;
  }

  const { text, children, messageId = null, isCreatedByUser, error, unfinished } = message ?? {};

  let messageLabel = '';
  if (isCreatedByUser) {
    messageLabel = 'anonymous';
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
                    <Icon message={message} conversation={conversation} />
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
                  {/* Legacy Plugins */}
                  {message.plugin && <Plugin plugin={message.plugin} />}
                  {message.content ? (
                    <SearchContent message={message} />
                  ) : (
                    <MessageContent
                      edit={false}
                      error={error}
                      isLast={false}
                      ask={() => ({})}
                      text={text ?? ''}
                      message={message}
                      isSubmitting={false}
                      enterEdit={() => ({})}
                      unfinished={!!unfinished}
                      isCreatedByUser={isCreatedByUser ?? true}
                      siblingIdx={siblingIdx ?? 0}
                      setSiblingIdx={setSiblingIdx ?? (() => ({}))}
                    />
                  )}
                </div>
              </div>
              <SubRow classes="text-xs">
                <SiblingSwitch
                  siblingIdx={siblingIdx}
                  siblingCount={siblingCount}
                  setSiblingIdx={setSiblingIdx}
                />
                <MinimalHoverButtons message={message} />
              </SubRow>
            </div>
          </div>
        </div>
      </div>
      <MultiMessage
        key={messageId}
        messageId={messageId}
        messagesTree={children ?? []}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
      />
    </>
  );
}
