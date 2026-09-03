import { useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import type { PartMetadata } from 'librechat-data-provider';
import type { ToolCallPhase } from '~/utils/toolCallPhase';
import { isError } from '~/components/Chat/Messages/Content/ToolOutput';
import { resolveToolCallPhase } from '~/utils/toolCallPhase';
import { useProgress, useExpandCollapse } from '~/hooks';
import store from '~/store';

interface ToolCallState {
  showCode: boolean;
  toggleCode: () => void;
  expandStyle: React.CSSProperties;
  expandRef: React.RefObject<HTMLDivElement>;
  /**
   * The card's settled state, resolved once. Label, announcement, icon and
   * animation all read this — deriving any of them separately is what let
   * them disagree.
   */
  phase: ToolCallPhase;
  hasOutput: boolean;
  hasContent: boolean;
}

export interface UseToolCallStateInput {
  initialProgress: number;
  isSubmitting: boolean;
  output: string;
  hasInput: boolean;
  onExpand?: () => void;
  runStepStatus?: PartMetadata['runStepStatus'];
  /**
   * A failure this call's own output cannot express — currently a
   * backgrounded task that settled as `error`, where the dispatch step's
   * output is the handle rather than the task's result. Folded into the
   * phase so those cards resolve their state through the same path as
   * every other card instead of patching the result afterwards.
   */
  extraError?: boolean;
}

export default function useToolCallState({
  initialProgress,
  isSubmitting,
  output,
  hasInput,
  onExpand,
  runStepStatus,
  extraError = false,
}: UseToolCallStateInput): ToolCallState {
  const autoExpand = useRecoilValue(store.autoExpandTools);
  const hasOutput = output.length > 0;
  const hasContent = hasInput || hasOutput;

  const [showCode, setShowCode] = useState(() => autoExpand && hasContent);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showCode);

  useEffect(() => {
    if (autoExpand && hasContent) {
      setShowCode(true);
    }
  }, [autoExpand, hasContent]);

  const isClosed = runStepStatus != null;
  /**
   * Passing 1 in for a closed step stops `useProgress` scheduling its 200ms
   * interval, which it keeps alive for any input below 1. The result no
   * longer needs masking: the phase treats an explicit close as terminal
   * outright, so a step that closes while the hook is still settling through
   * 0.99 can no longer read as in-flight.
   */
  const rawProgress = useProgress(isClosed ? 1 : initialProgress);
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
   * One resolution; everything the card shows is a read of this value. The
   * two progress inputs are deliberately distinct — see `resolveToolCallPhase`
   * for why the cancellation inference must not read the animated one.
   */
  const phase = resolveToolCallPhase({
    runStepStatus,
    displayProgress: rawProgress,
    reportedProgress: initialProgress,
    isSubmitting,
    hasError: (hasOutput && isError(output)) || extraError,
  });

  return {
    showCode,
    toggleCode,
    expandStyle,
    expandRef,
    phase,
    hasOutput,
    hasContent,
  };
}
