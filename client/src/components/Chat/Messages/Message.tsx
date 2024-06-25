import React, { useCallback, useMemo } from 'react';
import { useMessageProcess, useMessageActions } from '~/hooks';
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

const PlaceholderRow = React.memo(({ isLast, isCard }: { isLast: boolean; isCard?: boolean }) => {
  if (!isLast && !isCard) {
    return null;
  }
  return <div className="mt-1 h-[27px] bg-transparent" />;
});

type MessageRenderProps = {
  message?: TMessage;
  isCard?: boolean;
  isMultiMessage?: boolean;
  isSubmittingFamily?: boolean;
} & Pick<
  TMessageProps,
  'currentEditId' | 'setCurrentEditId' | 'siblingIdx' | 'setSiblingIdx' | 'siblingCount'
>;

const MessageRender = React.memo(
  ({
    isCard,
    siblingIdx,
    siblingCount,
    message: msg,
    setSiblingIdx,
    currentEditId,
    isMultiMessage,
    setCurrentEditId,
    isSubmittingFamily,
  }: MessageRenderProps) => {
    const {
      ask,
      edit,
      index,
      assistant,
      enterEdit,
      conversation,
      messageLabel,
      isSubmitting,
      latestMessage,
      handleContinue,
      copyToClipboard,
      setLatestMessage,
      regenerateMessage,
    } = useMessageActions({
      message: msg,
      currentEditId,
      isMultiMessage,
      setCurrentEditId,
    });

    const handleRegenerateMessage = useCallback(() => regenerateMessage(), [regenerateMessage]);
    const { isCreatedByUser, error, unfinished } = msg ?? {};
    const isLast = useMemo(
      () => !msg?.children?.length && (msg?.depth === latestMessage?.depth || msg?.depth === -1),
      [msg?.children, msg?.depth, latestMessage?.depth],
    );

    if (!msg) {
      return null;
    }

    const isLatest = isCard && !isSubmittingFamily && msg.messageId === latestMessage?.messageId;
    const clickHandler =
      isLast && isCard && !isSubmittingFamily && msg.messageId !== latestMessage?.messageId
        ? () => setLatestMessage(msg)
        : undefined;

    return (
      <div
        className={cn(
          'final-completion group mx-auto flex flex-1 gap-3 text-base',
          isCard
            ? 'relative w-full gap-1 rounded-lg border border-border-medium bg-surface-primary-alt p-2 md:w-1/2 md:gap-3 md:p-4'
            : '',
          isLatest ? 'bg-surface-secondary' : '',
          isLast && !isSubmittingFamily && isCard
            ? 'cursor-pointer transition-colors duration-300'
            : '',
        )}
        onClick={clickHandler}
      >
        {isLatest && (
          <div className="absolute right-0 top-0 m-2 h-3 w-3 rounded-full bg-text-primary"></div>
        )}
        <div className="relative flex flex-shrink-0 flex-col items-end">
          <div>
            <div className="pt-0.5">
              <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
                <Icon message={msg} conversation={conversation} assistant={assistant} />
              </div>
            </div>
          </div>
        </div>
        <div
          className={cn('relative flex w-11/12 flex-col', msg?.isCreatedByUser ? '' : 'agent-turn')}
        >
          <div className="select-none font-semibold">{messageLabel}</div>
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
          {!msg?.children?.length && (isSubmittingFamily || isSubmitting) ? (
            <PlaceholderRow isLast={isLast} isCard={isCard} />
          ) : (
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
  },
);

export default function Message(props: TMessageProps) {
  const {
    showSibling,
    conversation,
    handleScroll,
    siblingMessage,
    latestMultiMessage,
    isSubmittingFamily,
  } = useMessageProcess({ message: props.message });
  const { message, currentEditId, setCurrentEditId } = props;

  if (!message) {
    return null;
  }

  const { children, messageId = null } = message ?? {};

  return (
    <>
      <MessageContainer handleScroll={handleScroll}>
        {showSibling ? (
          <div className="m-auto my-2 flex justify-center p-4 py-2 text-base md:gap-6">
            <div className="flex w-full flex-row flex-wrap justify-between gap-1 md:max-w-5xl md:flex-nowrap md:gap-2 lg:max-w-5xl xl:max-w-6xl">
              <MessageRender
                {...props}
                message={message}
                isSubmittingFamily={isSubmittingFamily}
                isCard
              />
              <MessageRender
                {...props}
                isMultiMessage
                isCard
                message={siblingMessage ?? latestMultiMessage ?? undefined}
                isSubmittingFamily={isSubmittingFamily}
              />
            </div>
          </div>
        ) : (
          <div className="m-auto justify-center p-4 py-2 text-base md:gap-6 ">
            <div className="final-completion group mx-auto flex flex-1 gap-3 text-base md:max-w-3xl md:px-5 lg:max-w-[40rem] lg:px-1 xl:max-w-[48rem] xl:px-5">
              <MessageRender {...props} />
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
