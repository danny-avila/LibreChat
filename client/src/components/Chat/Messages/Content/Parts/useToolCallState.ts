import { useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import type { PartMetadata } from 'librechat-data-provider';
import { isError } from '~/components/Chat/Messages/Content/ToolOutput';
import { useProgress, useExpandCollapse } from '~/hooks';
import store from '~/store';

interface ToolCallState {
  showCode: boolean;
  toggleCode: () => void;
  expandStyle: React.CSSProperties;
  expandRef: React.RefObject<HTMLDivElement>;
  progress: number;
  cancelled: boolean;
  hasError: boolean;
  hasOutput: boolean;
  hasContent: boolean;
}

export default function useToolCallState(
  initialProgress: number,
  isSubmitting: boolean,
  output: string,
  hasInput: boolean,
  onExpand?: () => void,
  runStepStatus?: PartMetadata['runStepStatus'],
): ToolCallState {
  const autoExpand = useRecoilValue(store.autoExpandTools);
  const hasOutput = output.length > 0;
  const hasError = hasOutput && isError(output);
  const hasContent = hasInput || hasOutput;

  const [showCode, setShowCode] = useState(() => autoExpand && hasContent);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showCode);

  useEffect(() => {
    if (autoExpand && hasContent) {
      setShowCode(true);
    }
  }, [autoExpand, hasContent]);

  const progress = useProgress(initialProgress);
  const toggleCode = useCallback(() => {
    setShowCode((prev) => {
      const next = !prev;
      if (next) {
        onExpand?.();
      }
      return next;
    });
  }, [onExpand]);
  /**
   * The step's own terminal status wins when the run emitted one; the
   * `isSubmitting` heuristic is a whole-message inference that cannot tell
   * which step stopped. Kept as the fallback for messages saved before
   * `on_run_step_closed` and endpoints that do not emit it.
   */
  const cancelled =
    runStepStatus != null
      ? (runStepStatus === 'cancelled' || runStepStatus === 'failed') && !hasError
      : !isSubmitting && progress < 1 && !hasError;

  return {
    showCode,
    toggleCode,
    expandStyle,
    expandRef,
    progress,
    cancelled,
    hasError,
    hasOutput,
    hasContent,
  };
}
