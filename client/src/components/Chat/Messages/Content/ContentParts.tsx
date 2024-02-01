import { Suspense } from 'react';
// import type { ContentPart } from 'librechat-data-provider';
import { UnfinishedMessage } from './MessageContent';
import { DelayedRender } from '~/components/ui';
import Part from './Part';

// Content Component
const ContentParts = ({
  edit,
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
  } else if (edit) {
    // return <EditMessage text={text} isSubmitting={isSubmitting} {...props} />;
  } else {
    const { message } = props;
    const { messageId } = message;

    return (
      <>
        {content.map((part, idx) => {
          return (
            <Part
              key={`display-${messageId}-${idx}`}
              showCursor={idx === content.length - 1 && isLast}
              isSubmitting={isSubmitting}
              part={part}
              {...props}
            />
          );
        })}
        {!isSubmitting && unfinished && (
          <Suspense>
            <DelayedRender delay={250}>
              <UnfinishedMessage key={`unfinished-${messageId}`} />
            </DelayedRender>
          </Suspense>
        )}
      </>
    );
  }
};

export default ContentParts;
