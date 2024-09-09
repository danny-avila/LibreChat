import { memo } from 'react';
import type { TMessageContentParts } from 'librechat-data-provider';
import Part from './Part';

type ContentPartsProps = {
  content: Array<TMessageContentParts | undefined>;
  messageId: string;
  isCreatedByUser: boolean;
  isLast: boolean;
  isSubmitting: boolean;
};

const ContentParts = memo(
  ({ content, messageId, isCreatedByUser, isLast, isSubmitting }: ContentPartsProps) => {
    return (
      <>
        {content
          .filter((part) => part)
          .map((part, idx) => (
            <Part
              key={`display-${messageId}-${idx}`}
              part={part}
              isSubmitting={isSubmitting}
              showCursor={idx === content.length - 1 && isLast}
              messageId={messageId}
              isCreatedByUser={isCreatedByUser}
            />
          ))}
      </>
    );
  },
);

export default ContentParts;
