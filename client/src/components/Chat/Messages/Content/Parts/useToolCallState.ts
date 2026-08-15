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
  /**
   * A step the run closed as `failed` is an error even when its output does
   * not look like one — the run knows something the output text does not.
   */
  const hasError = (hasOutput && isError(output)) || runStepStatus === 'failed';
  const hasContent = hasInput || hasOutput;

  const [showCode, setShowCode] = useState(() => autoExpand && hasContent);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showCode);

  useEffect(() => {
    if (autoExpand && hasContent) {
      setShowCode(true);
    }
  }, [autoExpand, hasContent]);

  const isClosed = runStepStatus != null;
  /** Passed the terminal value rather than masked afterwards: `useProgress`
   *  keeps a 200ms interval alive whenever its input is below 1, and a closed
   *  step usually never receives the completion that would raise it. */
  const progress = useProgress(isClosed ? 1 : initialProgress);
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
   *
   * The status is authoritative on its own terms — it is deliberately not
   * gated on `hasError`, so that parsing the output text can never demote a
   * step the run reported as stopped back into an in-flight state.
   */
  const cancelled = isClosed
    ? runStepStatus === 'cancelled'
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
