import { Suspense } from 'react';
import type { TMessageContentParts } from 'librechat-data-provider';
import { UnfinishedMessage } from './MessageContent';
import { DelayedRender } from '~/components/ui';
import Part from './Part';

const ContentParts = ({
  error,
  unfinished,
  isSubmitting,
  isLast,
  content,
  ...props
}: // eslint-disable-next-line @typescript-eslint/no-explicit-any
any) => {
  if (error) {
    // return <ErrorMessage text={text} />;
  } else {
    const { message } = props;
    const { messageId } = message;

    return (
      <>
        {content
          .filter((part: TMessageContentParts | undefined) => part)
          .map((part: TMessageContentParts | undefined, idx: number) => {
            const showCursor = idx === content.length - 1 && isLast;
            return (
              <Part
                key={`display-${messageId}-${idx}`}
                showCursor={showCursor && isSubmitting}
                isSubmitting={isSubmitting}
                part={part}
                {...props}
              />
            );
          })}
        {!isSubmitting && unfinished && (
          <Suspense>
            <DelayedRender delay={250}>
              <UnfinishedMessage message={message} key={`unfinished-${messageId}`} />
            </DelayedRender>
          </Suspense>
        )}
      </>
    );
  }
};

export default ContentParts;
