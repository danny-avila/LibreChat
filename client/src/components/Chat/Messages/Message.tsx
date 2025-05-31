import React from 'react';
import { useRecoilValue } from 'recoil';
import { useMessageProcess } from '~/hooks';
import type { TMessageProps } from '~/common';
import MessageRender from './ui/MessageRender';

import MultiMessage from './MultiMessage';
import { cn } from '~/utils';
import store from '~/store';

const MessageContainer = React.memo(
  ({
    handleScroll,
    children,
  }: {
    handleScroll: (event?: unknown) => void;
    children: React.ReactNode;
  }) => {
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
  const {
    showSibling,
    conversation,
    handleScroll,
    siblingMessage,
    latestMultiMessage,
    isSubmittingFamily,
  } = useMessageProcess({ message: props.message });
  const { message, currentEditId, setCurrentEditId } = props;
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);

  if (!message || typeof message !== 'object') {
    return null;
  }

  const { children, messageId = null } = message;

  return (
    <>
      <MessageContainer handleScroll={handleScroll}>
        {showSibling ? (
          <div className="m-auto my-2 flex justify-center p-4 py-2 md:gap-6">
            <div
              className={cn(
                'flex w-full flex-row flex-wrap justify-between gap-1 md:flex-nowrap md:gap-2',
                maximizeChatSpace ? 'w-full max-w-full' : 'md:max-w-5xl xl:max-w-6xl',
              )}
            >
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
          <div className="m-auto justify-center p-4 py-2 md:gap-6">
            <MessageRender {...props} />
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
