import type { PartMetadata } from 'librechat-data-provider';

/**
 * The settled state of one tool call, as every part of its card should read
 * it: the visible label, the `aria-live` announcement, the icon, the shimmer,
 * and whether a duration is worth showing.
 *
 * Before this existed each card derived those independently — the label from
 * one expression, the announcement from another, the animation from a third —
 * and a change to one kept missing the others. Thirteen of the seventeen
 * review findings on #14873 were instances of that drift, and #14892 added a
 * fourteenth. One value, read everywhere, is what stops it: two presentations
 * of the same card can no longer disagree about what happened.
 */
export type ToolCallPhase = 'running' | 'completed' | 'cancelled' | 'failed';

export interface ToolCallPhaseInput {
  /**
   * The run's own terminal verdict from `on_run_step_closed`. Absent on parts
   * saved before the event existed and on endpoints that never emit it, which
   * is what the heuristic below is for.
   */
  runStepStatus?: PartMetadata['runStepStatus'];
  /** Streaming progress; `>= 1` means the card has settled. */
  progress: number;
  /** Whether the whole message is still streaming — a message-level fact. */
  isSubmitting: boolean;
  /**
   * Whether this call's own result reads as a failure: parsed error output,
   * or a card-specific signal such as a backgrounded task settling as `error`.
   */
  hasError: boolean;
}

/**
 * Resolve a tool call's phase from every signal that bears on it.
 *
 * The precedence rules encoded here were each established by a specific
 * review finding, and each is load-bearing:
 *
 * - **An explicit status is authoritative and never gated on output parsing.**
 *   Reading the result text can otherwise demote a step the run reported as
 *   stopped back into an in-flight state.
 * - **Explicit cancellation outranks a failure-shaped result.** A step the
 *   user stopped is cancelled even if its partial output parses as an error.
 * - **Under the legacy heuristic the opposite holds: failure outranks
 *   cancellation**, because that inference reads "not submitting and not
 *   finished" as a stop, which a genuine failure also satisfies. Applying the
 *   explicit-close precedence there relabelled real failures as user stops.
 * - **A closed step is never `running`**, whatever `progress` says.
 */
export function resolveToolCallPhase({
  runStepStatus,
  progress,
  isSubmitting,
  hasError,
}: ToolCallPhaseInput): ToolCallPhase {
  if (runStepStatus != null) {
    if (runStepStatus === 'cancelled') {
      return 'cancelled';
    }
    return runStepStatus === 'failed' || hasError ? 'failed' : 'completed';
  }

  if (hasError) {
    return 'failed';
  }
  if (!isSubmitting && progress < 1) {
    return 'cancelled';
  }
  return progress < 1 ? 'running' : 'completed';
}

/** Whether the card should present this phase as an error to the reader. */
export function isFailedPhase(phase: ToolCallPhase): boolean {
  return phase === 'failed';
}

/** Whether the card is still in flight — drives shimmer, pulse and tickers. */
export function isRunningPhase(phase: ToolCallPhase): boolean {
  return phase === 'running';
}
