import React, { memo } from 'react';
import { cn } from '~/utils';
import { formatTimestamp } from '~/utils/dateFormatter';
import { type TMessage } from 'librechat-data-provider';
import { useMessageTimestamp } from '~/hooks/Messages';

interface TimestampProps {
  message: TMessage;
}

const Timestamp = memo(
  ({ message }: TimestampProps) => {
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
            'ml-2 text-xs font-normal text-text-secondary-alt',
            'transition-opacity duration-200',
            'md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',
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
    return prevProps.message.messageId === nextProps.message.messageId;
  },
);

export default Timestamp;
