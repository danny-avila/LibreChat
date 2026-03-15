import { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocalize, useProgress, useExpandCollapse } from '~/hooks';
import { ToolIcon, OutputRenderer, isError } from './ToolOutput';
import ProgressText from './ProgressText';
import store from '~/store';

export default function RetrievalCall({
  initialProgress = 0.1,
  isSubmitting,
  output,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  output?: string;
}) {
  const progress = useProgress(initialProgress);
  const localize = useLocalize();

  const errorState = typeof output === 'string' && isError(output);
  const cancelled = !isSubmitting && initialProgress < 1 && !errorState;
  const hasOutput = !!output && !isError(output);
  const autoExpand = useRecoilValue(store.autoExpandTools);
  const [showOutput, setShowOutput] = useState(autoExpand);
  const expandStyle = useExpandCollapse(showOutput);

  return (
    <div className="my-1">
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {(() => {
          if (progress < 1 && !cancelled) {
            return localize('com_ui_searching_files');
          }
          if (cancelled) {
            return localize('com_ui_cancelled');
          }
          return localize('com_ui_retrieved_files');
        })()}
      </span>
      <div className="relative my-1 flex h-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={hasOutput ? () => setShowOutput((prev) => !prev) : undefined}
          inProgressText={localize('com_ui_searching_files')}
          finishedText={localize('com_ui_retrieved_files')}
          errorSuffix={errorState && !cancelled ? localize('com_ui_tool_failed') : undefined}
          icon={
            <ToolIcon type="file_search" isAnimating={progress < 1 && !cancelled && !errorState} />
          }
          hasInput={hasOutput}
          isExpanded={showOutput}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden">
          {hasOutput && (
            <div className="overflow-hidden rounded-lg border border-border-light bg-surface-secondary p-3">
              <OutputRenderer text={output} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
