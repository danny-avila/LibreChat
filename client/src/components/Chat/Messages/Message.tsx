import { useRecoilValue } from 'recoil';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuthContext, useMessageHelpers, useLocalize } from '~/hooks';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import Icon from '~/components/Chat/Messages/MessageIcon';
import { Plugin } from '~/components/Messages/Content';
import MessageContent from './Content/MessageContent';
import SiblingSwitch from './SiblingSwitch';
// eslint-disable-next-line import/no-cycle
import MultiMessage from './MultiMessage';
import HoverButtons from './HoverButtons';
import SubRow from './SubRow';
import { cn } from '~/utils';
import store from '~/store';

const MessageContainer = React.memo(
  ({ handleScroll, children }: { handleScroll: () => void; children: React.ReactNode }) => {
    return (
      <div
        className="text-token-text-primary w-full border-0 bg-transparent dark:border-0 dark:bg-transparent"
        onWheel={handleScroll}
        onTouchMove={handleScroll}
      >
        {children}
      </div>
    );
  },
);

export default function Message(props: TMessageProps) {
  const [siblingMessage, setSiblingMessage] = useState<TMessage | null>(null);
  const UsernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const { user } = useAuthContext();
  const localize = useLocalize();

  const {
    ask,
    edit,
    index,
    isLast,
    assistant,
    enterEdit,
    handleScroll,
    conversation,
    isSubmitting,
    latestMessage,
    handleContinue,
    copyToClipboard,
    regenerateMessage,
  } = useMessageHelpers(props);

  const latestMultiMessage = useRecoilValue(store.latestMessageFamily(index + 1));
  const { message, siblingIdx, siblingCount, setSiblingIdx, currentEditId, setCurrentEditId } =
    props;

  const showSibling =
    (isLast && latestMultiMessage && !latestMultiMessage?.children?.length) || siblingMessage;

  useEffect(() => {
    if (
      isLast &&
      latestMultiMessage &&
      latestMultiMessage.conversationId === message?.conversationId
    ) {
      setSiblingMessage(latestMultiMessage);
    }
  }, [isLast, latestMultiMessage, message, setSiblingMessage, latestMessage]);

  const handleRegenerateMessage = useCallback(() => regenerateMessage(), [regenerateMessage]);

  if (!message) {
    return null;
  }

  const { children, messageId = null, isCreatedByUser, error, unfinished } = message ?? {};

  const renderMessage = (msg: TMessage | null, isMultiMessage?: boolean) => {
    const getMessageLabel = () => {
      if (msg?.isCreatedByUser) {
        return UsernameDisplay ? user?.name || user?.username : localize('com_user_message');
      } else if (assistant) {
        return assistant.name ?? 'Assistant';
      } else {
        return msg?.sender;
      }
    };

    if (!msg) {
      return null;
    }
    return (
      <div
        className={cn(
          'final-completion group mx-auto flex flex-1 gap-3 text-base',
          isMultiMessage ? 'rounded-lg border border-border-medium bg-surface-primary-alt p-4' : '',
        )}
      >
        <div className="relative flex flex-shrink-0 flex-col items-end">
          <div>
            <div className="pt-0.5">
              <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
                <Icon message={msg} conversation={conversation} assistant={assistant} />
              </div>
            </div>
          </div>
        </div>
        <div className={cn('relative flex w-11/12 flex-col', isCreatedByUser ? '' : 'agent-turn')}>
          <div className="select-none font-semibold">{getMessageLabel()}</div>
          <div className="flex-col gap-1 md:gap-3">
            <div className="flex max-w-full flex-grow flex-col gap-0">
              {msg?.plugin && <Plugin plugin={msg?.plugin} />}
              <MessageContent
                ask={ask}
                edit={edit}
                isLast={isLast}
                text={msg.text ?? ''}
                message={msg}
                enterEdit={enterEdit}
                error={!!error}
                isSubmitting={isSubmitting}
                unfinished={unfinished ?? false}
                isCreatedByUser={isCreatedByUser ?? true}
                siblingIdx={siblingIdx ?? 0}
                setSiblingIdx={setSiblingIdx ?? (() => ({}))}
              />
            </div>
          </div>
          {isLast && isSubmitting ? null : (
            <SubRow classes="text-xs">
              <SiblingSwitch
                siblingIdx={siblingIdx}
                siblingCount={siblingCount}
                setSiblingIdx={setSiblingIdx}
              />
              <HoverButtons
                index={index}
                isEditing={edit}
                message={msg}
                enterEdit={enterEdit}
                isSubmitting={isSubmitting}
                conversation={conversation ?? null}
                regenerate={handleRegenerateMessage}
                copyToClipboard={copyToClipboard}
                handleContinue={handleContinue}
                latestMessage={latestMessage}
                isLast={isLast}
              />
            </SubRow>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <MessageContainer handleScroll={handleScroll}>
        {showSibling ? (
          <div className="m-auto my-2 flex justify-center p-4 py-2 text-base md:gap-6">
            <div className="flex w-full flex-row justify-between gap-1 md:max-w-5xl lg:max-w-5xl xl:max-w-6xl">
              {renderMessage(message, true)}
              {renderMessage(siblingMessage ?? latestMultiMessage, true)}
            </div>
          </div>
        ) : (
          <div className="m-auto justify-center p-4 py-2 text-base md:gap-6 ">
            <div className="final-completion group mx-auto flex flex-1 gap-3 text-base md:max-w-3xl md:px-5 lg:max-w-[40rem] lg:px-1 xl:max-w-[48rem] xl:px-5">
              {renderMessage(message)}
            </div>
          </div>
        )}
      </MessageContainer>
      <MultiMessage
        key={messageId}
        messageId={messageId}
        conversation={conversation}
        messagesTree={children ?? []}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
      />
    </>
  );
}
