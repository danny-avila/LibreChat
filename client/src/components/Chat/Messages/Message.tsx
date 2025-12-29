import React from 'react';
import { useMessageProcess } from '~/hooks';
import type { TMessageProps } from '~/common';
import MessageRender from './ui/MessageRender';
import MultiMessage from './MultiMessage';

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
  const { conversation, handleScroll } = useMessageProcess({
    message: props.message,
  });
  const { message, currentEditId, setCurrentEditId } = props;

  if (!message || typeof message !== 'object') {
    return null;
  }

  const { children, messageId = null } = message;

  return (
    <>
      <MessageContainer handleScroll={handleScroll}>
        <div className="m-auto justify-center p-4 py-2 md:gap-6">
          <MessageRender {...props} />
        </div>
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
