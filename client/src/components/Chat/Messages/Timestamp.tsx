import React, { memo } from 'react';
import { cn } from '~/utils';
import { formatTimestamp } from '~/utils/dateFormatter';
import { type TMessage } from 'librechat-data-provider';
import { useMessageTimestamp } from '~/hooks/Messages';

interface TimestampProps {
  message: TMessage;
  isVisible: boolean;
}

const Timestamp = memo(
  ({ message, isVisible }: TimestampProps) => {
    try {
      const timestamp = useMessageTimestamp(message.messageId, message);
      const displayTimestamp = timestamp || message.clientTimestamp;

      if (!displayTimestamp) {
        return null;
      }

      const formattedTime = formatTimestamp(displayTimestamp);

      return (
        <span
          className={cn(
            'ml-2 text-xs font-normal text-text-secondary-alt transition-opacity duration-300',
            isVisible ? 'opacity-100' : 'opacity-0',
            'inline-block',
          )}
        >
          {formattedTime}
        </span>
      );
    } catch (error) {
      console.error('Failed to render timestamp:', error);
      return null;
    }
  },
  (prevProps, nextProps) => {
    return (
      prevProps.message.messageId === nextProps.message.messageId &&
      prevProps.isVisible === nextProps.isVisible
    );
  },
);

export default Timestamp;
