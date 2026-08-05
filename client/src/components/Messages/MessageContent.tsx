import React from 'react';
import type { TMessageProps } from '~/common';
import { useMessageProcess, useMemoizedChatContext } from '~/hooks';
import { areMessageRowPropsEqual } from '~/utils';
import ContentRender from './ContentRender';

const MessageContainer = React.memo(function MessageContainer({
  handleScroll,
  children,
}: {
  handleScroll: (event?: unknown) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="text-token-text-primary w-full border-0 bg-transparent dark:border-0 dark:bg-transparent"
      onWheel={handleScroll}
      onTouchMove={handleScroll}
    >
      {children}
    </div>
  );
});

function MessageContent(props: TMessageProps) {
  const { handleScroll, isSubmitting } = useMessageProcess({
    message: props.message,
  });
  const { message } = props;
  const { chatContext, effectiveIsSubmitting } = useMemoizedChatContext(message, isSubmitting);

  if (!message || typeof message !== 'object') {
    return null;
  }

  return (
    <MessageContainer handleScroll={handleScroll}>
      <div className="m-auto justify-center p-4 py-2 md:gap-6">
        <ContentRender {...props} isSubmitting={effectiveIsSubmitting} chatContext={chatContext} />
      </div>
    </MessageContainer>
  );
}

export default React.memo(MessageContent, areMessageRowPropsEqual);
