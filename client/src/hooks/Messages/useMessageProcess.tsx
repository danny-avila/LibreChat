import { useEffect, useRef, useMemo } from 'react';
import throttle from 'lodash/throttle';
import type { TMessage } from 'librechat-data-provider';
import { useMessagesViewContext } from '~/Providers';
import { logger } from '~/utils';

export default function useMessageProcess({ message: _message }: { message?: TMessage | null }) {
  const { conversation, setAbortScroll, isSubmitting } = useMessagesViewContext();

  /** Use ref for isSubmitting to stabilize handleScroll across isSubmitting changes */
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  const handleScroll = useMemo(
    () =>
      throttle(() => {
        logger.log(
          'message_scrolling',
          `useMessageProcess: setting abort scroll to ${isSubmittingRef.current}`,
        );
        setAbortScroll(isSubmittingRef.current);
      }, 500),
    [setAbortScroll],
  );

  useEffect(() => () => handleScroll.cancel(), [handleScroll]);

  return {
    handleScroll,
    isSubmitting,
    conversation,
  };
}
