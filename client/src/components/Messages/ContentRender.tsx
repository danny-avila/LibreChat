import { useRecoilValue } from 'recoil';
import { useCallback, useMemo, memo } from 'react';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import type { TMessageProps, TMessageIcon } from '~/common';
import ContentParts from '~/components/Chat/Messages/Content/ContentParts';
import PlaceholderRow from '~/components/Chat/Messages/ui/PlaceholderRow';
import SiblingSwitch from '~/components/Chat/Messages/SiblingSwitch';
import HoverButtons from '~/components/Chat/Messages/HoverButtons';
import MessageIcon from '~/components/Chat/Messages/MessageIcon';
import { useAttachments, useMessageActions } from '~/hooks';
import { useGetConversationCosts } from '~/data-provider';
import SubRow from '~/components/Chat/Messages/SubRow';
import { cn, logger } from '~/utils';
import store from '~/store';

type ContentRenderProps = {
  message?: TMessage;
  isCard?: boolean;
  isMultiMessage?: boolean;
  isSubmittingFamily?: boolean;
} & Pick<
  TMessageProps,
  'currentEditId' | 'setCurrentEditId' | 'siblingIdx' | 'setSiblingIdx' | 'siblingCount'
>;

const ContentRender = memo(
  ({
    message: msg,
    isCard = false,
    siblingIdx,
    siblingCount,
    setSiblingIdx,
    currentEditId,
    isMultiMessage = false,
    setCurrentEditId,
    isSubmittingFamily = false,
  }: ContentRenderProps) => {
    const { attachments, searchResults } = useAttachments({
      messageId: msg?.messageId,
      attachments: msg?.attachments,
    });
    const {
      edit,
      index,
      agent,
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
    } = useMessageActions({
      message: msg,
      searchResults,
      currentEditId,
      isMultiMessage,
      setCurrentEditId,
    });
    const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
    const fontSize = useRecoilValue(store.fontSize);
    const convoId = conversation?.conversationId ?? '';
    const { data: convoCosts } = useGetConversationCosts(convoId, { enabled: !!convoId });

    const perMessageCost = useMemo(() => {
      if (!convoCosts || !convoCosts.perMessage || !msg?.messageId) {
        return null;
      }
      return convoCosts.perMessage.find((p) => p.messageId === msg.messageId) ?? null;
    }, [convoCosts, msg?.messageId]);

    const handleRegenerateMessage = useCallback(() => regenerateMessage(), [regenerateMessage]);
    const isLast = useMemo(
      () =>
        !(msg?.children?.length ?? 0) && (msg?.depth === latestMessage?.depth || msg?.depth === -1),
      [msg?.children, msg?.depth, latestMessage?.depth],
    );
    const isLatestMessage = msg?.messageId === latestMessage?.messageId;
    const showCardRender = isLast && !isSubmittingFamily && isCard;
    const isLatestCard = isCard && !isSubmittingFamily && isLatestMessage;

    const iconData: TMessageIcon = useMemo(
      () => ({
        endpoint: msg?.endpoint ?? conversation?.endpoint,
        model: msg?.model ?? conversation?.model,
        iconURL: msg?.iconURL,
        modelLabel: messageLabel,
        isCreatedByUser: msg?.isCreatedByUser,
      }),
      [
        messageLabel,
        conversation?.endpoint,
        conversation?.model,
        msg?.model,
        msg?.iconURL,
        msg?.endpoint,
        msg?.isCreatedByUser,
      ],
    );

    const clickHandler = useMemo(
      () =>
        showCardRender && !isLatestMessage
          ? () => {
              logger.log(`Message Card click: Setting ${msg?.messageId} as latest message`);
              logger.dir(msg);
              setLatestMessage(msg!);
            }
          : undefined,
      [showCardRender, isLatestMessage, msg, setLatestMessage],
    );

    if (!msg) {
      return null;
    }

    const baseClasses = {
      common: 'group mx-auto flex flex-1 gap-3 transition-all duration-300 transform-gpu ',
      card: 'relative w-full gap-1 rounded-lg border border-border-medium bg-surface-primary-alt p-2 md:w-1/2 md:gap-3 md:p-4',
      chat: maximizeChatSpace
        ? 'w-full max-w-full md:px-5 lg:px-1 xl:px-5'
        : 'md:max-w-[47rem] xl:max-w-[55rem]',
    };

    const conditionalClasses = {
      latestCard: isLatestCard ? 'bg-surface-secondary' : '',
      cardRender: showCardRender ? 'cursor-pointer transition-colors duration-300' : '',
      focus: 'focus:outline-none focus:ring-2 focus:ring-border-xheavy',
    };

    return (
      <div
        id={msg.messageId}
        aria-label={`message-${msg.depth}-${msg.messageId}`}
        className={cn(
          baseClasses.common,
          isCard ? baseClasses.card : baseClasses.chat,
          conditionalClasses.latestCard,
          conditionalClasses.cardRender,
          conditionalClasses.focus,
          'message-render',
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
        {isLatestCard && (
          <div className="absolute right-0 top-0 m-2 h-3 w-3 rounded-full bg-text-primary" />
        )}

        <div className="relative flex flex-shrink-0 flex-col items-center">
          <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
            <MessageIcon iconData={iconData} assistant={assistant} agent={agent} />
          </div>
        </div>

        <div
          className={cn(
            'relative flex w-11/12 flex-col',
            msg.isCreatedByUser ? 'user-turn' : 'agent-turn',
          )}
        >
          <h2 className={cn('select-none font-semibold', fontSize)}>
            {messageLabel}
            {perMessageCost && (
              <span className="ml-2 inline-flex items-center gap-2 px-2 py-0.5 text-xs text-muted-foreground">
                {perMessageCost.tokenCount > 0 && (
                  <span className="mr-2">
                    {perMessageCost.tokenType === 'prompt' ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="1em"
                        height="1em"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        className="inline"
                      >
                        <path
                          fillRule="evenodd"
                          d="M11.293 5.293a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1-1.414 1.414L13 8.414V18a1 1 0 1 1-2 0V8.414l-3.293 3.293a1 1 0 0 1-1.414-1.414l5-5Z"
                          clipRule="evenodd"
                        ></path>
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="1em"
                        height="1em"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        className="inline"
                      >
                        <path
                          fillRule="evenodd"
                          d="M12.707 18.707a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414L11 15.586V6a1 1 0 1 1 2 0v9.586l3.293-3.293a1 1 0 0 1 1.414 1.414l-5 5Z"
                          clipRule="evenodd"
                        ></path>
                      </svg>
                    )}
                    {perMessageCost.tokenCount}t
                  </span>
                )}
                <span className="whitespace-pre">${Math.abs(perMessageCost.usd).toFixed(6)}</span>
              </span>
            )}
          </h2>

          <div className="flex flex-col gap-1">
            <div className="flex max-w-full flex-grow flex-col gap-0">
              <ContentParts
                edit={edit}
                isLast={isLast}
                enterEdit={enterEdit}
                siblingIdx={siblingIdx}
                messageId={msg.messageId}
                attachments={attachments}
                isSubmitting={isSubmitting}
                searchResults={searchResults}
                setSiblingIdx={setSiblingIdx}
                isCreatedByUser={msg.isCreatedByUser}
                conversationId={conversation?.conversationId}
                content={msg.content as Array<TMessageContentParts | undefined>}
              />
            </div>

            {(isSubmittingFamily || isSubmitting) && !(msg.children?.length ?? 0) ? (
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
                  handleFeedback={handleFeedback}
                  isLast={isLast}
                />
              </SubRow>
            )}
          </div>
        </div>
      </div>
    );
  },
);

export default ContentRender;
