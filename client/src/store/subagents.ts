import { atomFamily } from 'recoil';
import type { SubagentUpdateEvent, SubagentUpdatePhase } from 'librechat-data-provider';
import type { SubagentAggregatorState, SubagentContentPart } from '~/utils/subagentContent';

/**
 * Progress bucket captured per subagent tool call. Populated as
 * `ON_SUBAGENT_UPDATE` SSE events stream in from the backend. Keyed by the
 * parent's `tool_call_id` so the `SubagentCall` renderer can look the bucket
 * up from the tool call it's rendering.
 */
export interface SubagentProgress {
  /** Child run id from the SDK — unique per spawn; one tool_call may only have one. */
  subagentRunId: string;
  /** `type` identifier from the SubagentConfig (e.g. 'self', 'researcher'). */
  subagentType: string;
  /**
   * Recent events, trimmed to a rolling window — used only by the ticker
   * for tail-preview building. **NOT** the source of truth for the dialog
   * content: a long-running subagent's trimmed window may have shed the
   * `run_step` that created a tool_call, so rebuilding content from this
   * would lose tool history. See {@link SubagentProgress.contentParts}.
   */
  events: SubagentUpdateEvent[];
  /**
   * Fully aggregated child content parts, built incrementally by
   * `foldSubagentEvent` as each envelope arrives. Never trimmed — its
   * size is bounded by the number of distinct text/reasoning runs + tool
   * calls, which is small (≤20 for typical runs) regardless of delta
   * volume. This is what the dialog renders.
   */
  contentParts: SubagentContentPart[];
  /** Cursor carried across incremental folds (open buffer indices + tool-call id → index map). */
  aggregatorState: SubagentAggregatorState;
  /** Current lifecycle phase — drives the ticker's "running" / "done" state. */
  status: SubagentUpdatePhase;
  /** Convenience: last event's `label` for quick ticker display. */
  latestLabel?: string;
}

/** Progress state keyed by parent tool_call_id. */
export const subagentProgressByToolCallId = atomFamily<SubagentProgress | null, string>({
  key: 'subagentProgressByToolCallId',
  default: null,
});
