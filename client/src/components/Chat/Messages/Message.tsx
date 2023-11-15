/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from 'react';
import copy from 'copy-to-clipboard';
import SiblingSwitch from '~/components/Messages/SiblingSwitch';
import { SubRow, Plugin } from '~/components/Messages/Content';
import HoverButtons from '~/components/Messages/HoverButtons';
import MessageContent from './Content/MessageContent';
import { Icon } from '~/components/Endpoints';
import type { TMessageProps } from '~/common';
import { useChatContext } from '~/Providers';
// eslint-disable-next-line import/no-cycle
import MultiMessage from './MultiMessage';
import { cn } from '~/utils';

export default function Message(props: TMessageProps) {
  const {
    message,
    scrollToBottom,
    currentEditId,
    setCurrentEditId,
    siblingIdx,
    siblingCount,
    setSiblingIdx,
  } = props;

  const {
    ask,
    regenerate,
    autoScroll,
    abortScroll,
    isSubmitting,
    conversation,
    setAbortScroll,
    handleContinue,
    setLatestMessage,
  } = useChatContext();

  const { conversationId } = conversation ?? {};

  const { text, children, messageId = null, isCreatedByUser, error, unfinished } = message ?? {};

  const isLast = !children?.length;
  const edit = messageId === currentEditId;

  useEffect(() => {
    if (isSubmitting && scrollToBottom && !abortScroll) {
      scrollToBottom();
    }
  }, [isSubmitting, text, scrollToBottom, abortScroll]);

  useEffect(() => {
    if (scrollToBottom && autoScroll && conversationId !== 'new') {
      scrollToBottom();
    }
  }, [autoScroll, conversationId, scrollToBottom]);

  useEffect(() => {
    if (!message) {
      return;
    } else if (isLast) {
      setLatestMessage({ ...message });
    }
  }, [isLast, message, setLatestMessage]);

  if (!message) {
    return null;
  }

  const enterEdit = (cancel?: boolean) =>
    setCurrentEditId && setCurrentEditId(cancel ? -1 : messageId);

  const handleScroll = () => {
    if (isSubmitting) {
      setAbortScroll(true);
    } else {
      setAbortScroll(false);
    }
  };

  const commonClasses =
    'w-full border-b text-gray-800 group border-black/10 dark:border-gray-900/50 dark:text-gray-100 dark:border-none';
  const uniqueClasses = isCreatedByUser
    ? 'bg-white dark:bg-gray-800 dark:text-gray-20'
    : 'bg-white dark:bg-gray-800 dark:text-gray-70';

  const messageProps = {
    className: cn(commonClasses, uniqueClasses),
    titleclass: '',
  };

  const icon = Icon({
    ...conversation,
    ...message,
    model: message?.model ?? conversation?.model,
    size: 36,
  });

  const regenerateMessage = () => {
    if (isSubmitting && isCreatedByUser) {
      return;
    }

    regenerate(message);
  };

  const copyToClipboard = (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
    setIsCopied(true);
    copy(text ?? '');

    setTimeout(() => {
      setIsCopied(false);
    }, 3000);
  };

  return (
    <>
      <div {...messageProps} onWheel={handleScroll} onTouchMove={handleScroll}>
        <div className="relative m-auto flex gap-4 p-4 text-base md:max-w-2xl md:gap-6 md:py-6 lg:max-w-2xl lg:px-0 xl:max-w-3xl">
          <div className="relative flex h-[40px] w-[40px] flex-col items-end text-right text-xs md:text-sm">
            {typeof icon === 'string' && /[^\\x00-\\x7F]+/.test(icon as string) ? (
              <span className=" direction-rtl w-40 overflow-x-scroll">{icon}</span>
            ) : (
              icon
            )}
            <div className="sibling-switch invisible absolute left-0 top-2 -ml-4 flex -translate-x-full items-center justify-center gap-1 text-xs group-hover:visible">
              <SiblingSwitch
                siblingIdx={siblingIdx}
                siblingCount={siblingCount}
                setSiblingIdx={setSiblingIdx}
              />
            </div>
          </div>
          <div className="relative flex w-[calc(100%-50px)] flex-col gap-1  md:gap-3 lg:w-[calc(100%-115px)]">
            <div className="flex flex-grow flex-col gap-3">
              {/* Legacy Plugins */}
              {message?.plugin && <Plugin plugin={message?.plugin} />}
              <MessageContent
                ask={ask}
                edit={edit}
                isLast={isLast}
                text={text ?? ''}
                message={message}
                enterEdit={enterEdit}
                error={!!error}
                isSubmitting={isSubmitting}
                unfinished={unfinished ?? false}
                isCreatedByUser={isCreatedByUser ?? true}
                siblingIdx={siblingIdx ?? 0}
                setSiblingIdx={
                  setSiblingIdx ??
                  (() => {
                    return;
                  })
                }
              />
            </div>
            <HoverButtons
              isEditing={edit}
              isSubmitting={isSubmitting}
              message={message}
              conversation={conversation ?? null}
              enterEdit={enterEdit}
              regenerate={() => regenerateMessage()}
              handleContinue={handleContinue}
              copyToClipboard={copyToClipboard}
            />
            <SubRow subclasses="switch-container">
              <SiblingSwitch
                siblingIdx={siblingIdx}
                siblingCount={siblingCount}
                setSiblingIdx={setSiblingIdx}
              />
            </SubRow>
          </div>
        </div>
      </div>
      <MultiMessage
        key={messageId}
        messageId={messageId}
        conversation={conversation}
        messagesTree={children ?? []}
        scrollToBottom={scrollToBottom}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
      />
    </>
  );
}
