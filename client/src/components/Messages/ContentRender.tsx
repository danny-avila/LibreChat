import { useCallback, useMemo, memo } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import type { TMessageProps, TMessageIcon } from '~/common';
import { useAttachments, useLocalize, useMessageActions, useContentMetadata } from '~/hooks';
import ContentParts from '~/components/Chat/Messages/Content/ContentParts';
import PlaceholderRow from '~/components/Chat/Messages/ui/PlaceholderRow';
import SiblingSwitch from '~/components/Chat/Messages/SiblingSwitch';
import HoverButtons from '~/components/Chat/Messages/HoverButtons';
import MessageIcon from '~/components/Chat/Messages/MessageIcon';
import SubRow from '~/components/Chat/Messages/SubRow';
import { cn, getMessageAriaLabel } from '~/utils';
import { fontSizeAtom } from '~/store/fontSize';
import store from '~/store';

type ContentRenderProps = {
  message?: TMessage;
  isSubmitting?: boolean;
} & Pick<
  TMessageProps,
  'currentEditId' | 'setCurrentEditId' | 'siblingIdx' | 'setSiblingIdx' | 'siblingCount'
>;

const ContentRender = memo(
  ({
    message: msg,
    siblingIdx,
    siblingCount,
    setSiblingIdx,
    currentEditId,
    setCurrentEditId,
    isSubmitting = false,
  }: ContentRenderProps) => {
    const localize = useLocalize();
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
      latestMessage,
      handleContinue,
      handleFeedback,
      copyToClipboard,
      regenerateMessage,
    } = useMessageActions({
      message: msg,
      searchResults,
      currentEditId,
      setCurrentEditId,
    });
    const fontSize = useAtomValue(fontSizeAtom);
    const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);

    const handleRegenerateMessage = useCallback(() => regenerateMessage(), [regenerateMessage]);
    const isLast = useMemo(
      () =>
        !(msg?.children?.length ?? 0) && (msg?.depth === latestMessage?.depth || msg?.depth === -1),
      [msg?.children, msg?.depth, latestMessage?.depth],
    );
    const hasNoChildren = !(msg?.children?.length ?? 0);
    const isLatestMessage = msg?.messageId === latestMessage?.messageId;
    /** Only pass isSubmitting to the latest message to prevent unnecessary re-renders */
    const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

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

    const { hasParallelContent } = useContentMetadata(msg);

    if (!msg) {
      return null;
    }

    const getChatWidthClass = () => {
      if (maximizeChatSpace) {
        return 'w-full max-w-full md:px-5 lg:px-1 xl:px-5';
      }
      if (hasParallelContent) {
        return 'md:max-w-[58rem] xl:max-w-[70rem]';
      }
      return 'md:max-w-[47rem] xl:max-w-[55rem]';
    };

    const baseClasses = {
      common: 'group mx-auto flex flex-1 gap-3 transition-all duration-300 transform-gpu ',
      chat: getChatWidthClass(),
    };

    const conditionalClasses = {
      focus: 'focus:outline-none focus:ring-2 focus:ring-border-xheavy',
    };

    return (
      <div
        id={msg.messageId}
        aria-label={getMessageAriaLabel(msg, localize)}
        className={cn(
          baseClasses.common,
          baseClasses.chat,
          conditionalClasses.focus,
          'message-render',
        )}
      >
        {!hasParallelContent && (
          <div className="relative flex flex-shrink-0 flex-col items-center">
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
              <MessageIcon iconData={iconData} assistant={assistant} agent={agent} />
            </div>
          </div>
        )}

        <div
          className={cn(
            'relative flex flex-col',
            hasParallelContent ? 'w-full' : 'w-11/12',
            msg.isCreatedByUser ? 'user-turn' : 'agent-turn',
          )}
        >
          {!hasParallelContent && (
            <h2 className={cn('select-none font-semibold', fontSize)}>{messageLabel}</h2>
          )}

          <div className="flex flex-col gap-1">
            <div className="flex max-w-full flex-grow flex-col gap-0">
              <ContentParts
                edit={edit}
                isLast={isLast}
                enterEdit={enterEdit}
                siblingIdx={siblingIdx}
                messageId={msg.messageId}
                attachments={attachments}
                searchResults={searchResults}
                setSiblingIdx={setSiblingIdx}
                isLatestMessage={isLatestMessage}
                isSubmitting={effectiveIsSubmitting}
                isCreatedByUser={msg.isCreatedByUser}
                conversationId={conversation?.conversationId}
                content={msg.content as Array<TMessageContentParts | undefined>}
              />
            </div>
            {hasNoChildren && effectiveIsSubmitting ? (
              <PlaceholderRow />
            ) : (
              <SubRow classes="text-xs">
                <SiblingSwitch
                  siblingIdx={siblingIdx}
                  siblingCount={siblingCount}
                  setSiblingIdx={setSiblingIdx}
                />
                <HoverButtons
                  index={index}
                  message={msg}
                  isEditing={edit}
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
