import { atomFamily } from 'recoil';
import type { SubagentUpdateEvent, SubagentUpdatePhase } from 'librechat-data-provider';

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
  /** Ordered list of update envelopes, newest last. */
  events: SubagentUpdateEvent[];
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
