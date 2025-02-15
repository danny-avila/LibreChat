import React, { useState, useCallback, useMemo, memo } from 'react';
import { useRecoilValue } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps, TMessageIcon } from '~/common';
import FeedbackTagOptions from '~/components/Chat/Messages/FeedbackTagOptions';
import MessageContent from '~/components/Chat/Messages/Content/MessageContent';
import PlaceholderRow from '~/components/Chat/Messages/ui/PlaceholderRow';
import SiblingSwitch from '~/components/Chat/Messages/SiblingSwitch';
import HoverButtons from '~/components/Chat/Messages/HoverButtons';
import MessageIcon from '~/components/Chat/Messages/MessageIcon';
import { Plugin } from '~/components/Messages/Content';
import SubRow from '~/components/Chat/Messages/SubRow';
import { MessageContext } from '~/Providers';
import { useMessageActions } from '~/hooks';
import { cn, logger } from '~/utils';
import store from '~/store';

type MessageRenderProps = {
  message?: TMessage;
  isCard?: boolean;
  isMultiMessage?: boolean;
  isSubmittingFamily?: boolean;
} & Pick<
  TMessageProps,
  'currentEditId' | 'setCurrentEditId' | 'siblingIdx' | 'setSiblingIdx' | 'siblingCount'
>;

const MessageRender = memo(
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
      handleFeedback,
      rated,
    } = useMessageActions({
      message: msg,
      currentEditId,
      isMultiMessage,
      setCurrentEditId,
    });
    const fontSize = useRecoilValue(store.fontSize);
    const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);

    const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
    const [showThankYou, setShowThankYou] = useState(false);

    const handleRegenerateMessage = useCallback(() => regenerateMessage(), [regenerateMessage]);
    const { isCreatedByUser, error, unfinished } = msg ?? {};
    const hasNoChildren = !(msg?.children?.length ?? 0);
    const isLast = useMemo(
      () => hasNoChildren && (msg?.depth === latestMessage?.depth || msg?.depth === -1),
      [hasNoChildren, msg?.depth, latestMessage?.depth],
    );

    const iconData: TMessageIcon = useMemo(
      () => ({
        endpoint: msg?.endpoint ?? conversation?.endpoint,
        model: msg?.model ?? conversation?.model,
        iconURL: msg?.iconURL ?? conversation?.iconURL,
        modelLabel: messageLabel,
        isCreatedByUser: msg?.isCreatedByUser,
      }),
      [
        messageLabel,
        conversation?.endpoint,
        conversation?.iconURL,
        conversation?.model,
        msg?.model,
        msg?.iconURL,
        msg?.endpoint,
        msg?.isCreatedByUser,
      ],
    );

    if (!msg) {
      return null;
    }

    const isLatestMessage = msg.messageId === latestMessage?.messageId;
    const showCardRender = isLast && !(isSubmittingFamily === true) && isCard === true;
    const isLatestCard = isCard === true && !(isSubmittingFamily === true) && isLatestMessage;
    const clickHandler =
      showCardRender && !isLatestMessage
        ? () => {
          logger.log(`Message Card click: Setting ${msg.messageId} as latest message`);
          logger.dir(msg);
          setLatestMessage(msg);
        }
        : undefined;

    // Style classes
    const baseClasses =
      'final-completion group mx-auto flex flex-1 gap-3 transition-all duration-300 transform-gpu';
    let layoutClasses = '';

    if (isCard ?? false) {
      layoutClasses =
        'relative w-full gap-1 rounded-lg border border-border-medium bg-surface-primary-alt p-2 md:w-1/2 md:gap-3 md:p-4';
    } else if (maximizeChatSpace) {
      layoutClasses = 'md:max-w-full md:px-5';
    } else {
      layoutClasses = 'md:max-w-3xl md:px-5 lg:max-w-[40rem] lg:px-1 xl:max-w-[48rem] xl:px-5';
    }

    const latestCardClasses = isLatestCard ? 'bg-surface-secondary' : '';
    const showRenderClasses = showCardRender ? 'cursor-pointer transition-colors duration-300' : '';

    return (
      <div
        id={msg.messageId}
        aria-label={`message-${msg.depth}-${msg.messageId}`}
        className={cn(
          baseClasses,
          layoutClasses,
          latestCardClasses,
          showRenderClasses,
          'message-render focus:outline-none focus:ring-2 focus:ring-border-xheavy',
        )}
        onClick={clickHandler}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && clickHandler) {
            clickHandler();
          }
        }}
        role={showCardRender ? 'button' : undefined}
        tabIndex={showCardRender ? 0 : undefined}
      >
        {isLatestCard === true && (
          <div className="absolute right-0 top-0 m-2 h-3 w-3 rounded-full bg-text-primary"></div>
        )}
        <div className="relative flex flex-shrink-0 flex-col items-end">
          <div>
            <div className="pt-0.5">
              <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
                <MessageIcon iconData={iconData} assistant={assistant} />
              </div>
            </div>
          </div>
        </div>
        <div
          className={cn(
            'relative flex w-11/12 flex-col',
            msg.isCreatedByUser === true ? '' : 'agent-turn',
          )}
        >
          <h2 className={cn('select-none font-semibold', fontSize)}>{messageLabel}</h2>
          <div className="flex-col gap-1 md:gap-3">
            <div className="flex max-w-full flex-grow flex-col gap-0">
              <MessageContext.Provider
                value={{
                  messageId: msg.messageId,
                  conversationId: conversation?.conversationId,
                }}
              >
                {msg.plugin && <Plugin plugin={msg.plugin} />}
                <MessageContent
                  ask={ask}
                  edit={edit}
                  isLast={isLast}
                  text={msg.text || ''}
                  message={msg}
                  enterEdit={enterEdit}
                  error={!!(error ?? false)}
                  isSubmitting={isSubmitting}
                  unfinished={unfinished ?? false}
                  isCreatedByUser={isCreatedByUser ?? true}
                  siblingIdx={siblingIdx ?? 0}
                  setSiblingIdx={setSiblingIdx ?? (() => ({}))}
                />
              </MessageContext.Provider>
            </div>
          </div>
          {hasNoChildren && (isSubmittingFamily === true || isSubmitting) ? (
            <PlaceholderRow isCard={isCard} />
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
                handleFeedback={handleFeedback}
                rated={rated}
              />
            </SubRow>
          )}
          {!isCreatedByUser && rated?.rating === 'thumbsDown' && isLatestMessage && (
            <SubRow classes="mt-3">
              {!feedbackSubmitted ? (
                <FeedbackTagOptions
                  tagChoices={rated.ratingContent?.tagChoices || []}
                  onSelectTag={(tag) => {
                    handleFeedback('thumbsDown', { ratingContent: { tags: [tag] } });
                    setFeedbackSubmitted(true);
                    setShowThankYou(true);
                    setTimeout(() => {
                      setShowThankYou(false);
                    }, 3000);
                  }}
                />
              ) : showThankYou ? (
                <div className="inline-flex rounded-lg border border-token-border-light p-4">
                  <div className="text-sm">Thanks for your feedback!</div>
                </div>
              ) : null}
            </SubRow>
          )}
        </div>
      </div>
    );
  },
);

export default MessageRender;