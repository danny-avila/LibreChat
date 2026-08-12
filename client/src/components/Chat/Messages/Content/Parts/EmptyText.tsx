import { memo } from 'react';
import useSmoothStreaming from '~/hooks/Messages/useSmoothStreaming';

/** Streaming cursor placeholder — no bottom margin to match Container's structure and prevent CLS */
const EmptyTextPart = memo(() => {
  const smoothStreaming = useSmoothStreaming();

  return (
    <div className="text-message flex min-h-[20px] flex-col items-start gap-3 overflow-visible">
      <div className="markdown prose dark:prose-invert light w-full break-words">
        <div className="absolute">
          <p className="submitting relative">
            <span className={smoothStreaming ? '' : 'result-thinking'} />
          </p>
        </div>
      </div>
    </div>
  );
});

export default EmptyTextPart;
