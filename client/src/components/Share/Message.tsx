import type { TMessageProps } from '~/common';
import AuthorHeader from '~/components/Chat/Messages/Content/Parts/AuthorHeader';
import MinimalHoverButtons from '~/components/Chat/Messages/MinimalHoverButtons';
import MessageContent from '~/components/Chat/Messages/Content/MessageContent';
import MessageRow from '~/components/Chat/Messages/ui/MessageRow';
import SearchContent from '~/components/Chat/Messages/Content/SearchContent';
import SiblingSwitch from '~/components/Chat/Messages/SiblingSwitch';
import SubRow from '~/components/Chat/Messages/SubRow';
import { MessageContext } from '~/Providers';
import { getHeaderPrefixForScreenReader, getMessageAriaLabel } from '~/utils';
import MultiMessage from './MultiMessage';
import { useAttachments, useLocalize } from '~/hooks';
import Icon from './MessageIcon';

export default function Message(props: TMessageProps) {
  const localize = useLocalize();
  const {
    message,
    siblingIdx,
    siblingCount,
    conversation,
    setSiblingIdx,
    currentEditId,
    setCurrentEditId,
  } = props;

  const { attachments, searchResults } = useAttachments({
    messageId: message?.messageId,
    attachments: message?.attachments,
  });

  if (!message) {
    return null;
  }

  const {
    text = '',
    children,
    error = false,
    messageId = '',
    unfinished = false,
    isCreatedByUser = true,
  } = message;

  const messageLabel = isCreatedByUser ? localize('com_user_message') : (message.sender ?? '');

  return (
    <>
      <div className="w-full border-0 bg-transparent text-text-primary">
        <div className="m-auto justify-center px-4 py-3 md:px-6">
          <MessageRow
            id={messageId}
            icon={<Icon message={message} conversation={conversation} />}
            label={messageLabel}
            timestamp={message.createdAt ?? message.clientTimestamp}
            ariaLabel={getMessageAriaLabel(message, localize)}
            headerPrefix={getHeaderPrefixForScreenReader(message, localize)}
            isCreatedByUser={isCreatedByUser}
            className="final-completion"
            footer={
              <SubRow classes={isCreatedByUser ? 'justify-end text-xs' : 'text-xs'}>
                <SiblingSwitch
                  siblingIdx={siblingIdx}
                  siblingCount={siblingCount}
                  setSiblingIdx={setSiblingIdx}
                />
                <MinimalHoverButtons message={message} searchResults={searchResults} />
              </SubRow>
            }
          >
            <MessageContext.Provider
              value={{
                messageId,
                isExpanded: false,
                conversationId: conversation?.conversationId,
                isSubmitting: false,
                isLatestMessage: false,
              }}
            >
              {message.content ? (
                <SearchContent
                  message={message}
                  attachments={attachments}
                  searchResults={searchResults}
                  authorHeader={
                    isCreatedByUser ? undefined : (
                      <AuthorHeader
                        icon={<Icon message={message} conversation={conversation} />}
                        label={messageLabel}
                      />
                    )
                  }
                />
              ) : (
                <MessageContent
                  edit={false}
                  error={error}
                  isLast={false}
                  ask={() => {}}
                  text={text || ''}
                  message={message}
                  isSubmitting={false}
                  enterEdit={() => ({})}
                  unfinished={unfinished}
                  siblingIdx={siblingIdx ?? 0}
                  isCreatedByUser={isCreatedByUser}
                  setSiblingIdx={setSiblingIdx ?? (() => ({}))}
                />
              )}
            </MessageContext.Provider>
          </MessageRow>
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
