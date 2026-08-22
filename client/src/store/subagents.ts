import { atom, atomFamily } from 'recoil';
import type {
  PartMetadata,
  SubagentUpdatePhase,
  TMessageContentParts,
  SubagentUpdateEvent,
} from 'librechat-data-provider';
import type {
  SubagentAggregatorState,
  SubagentContentPart,
  SubagentTickerState,
} from '~/utils/subagentContent';
import {
  foldSubagentEvent,
  foldSubagentEventIntoTicker,
  initSubagentAggregatorState,
  initSubagentTickerState,
} from '~/utils/subagentContent';

/**
 * Progress bucket captured per subagent tool call. Populated as
 * `ON_SUBAGENT_UPDATE` SSE events stream in from the backend. Keyed by the
 * parent invocation so provider-local tool call IDs cannot collide across
 * separate assistant messages.
 *
 * Both the panel content and the ticker are aggregated *incrementally*
 * into the atom as each envelope arrives — the atom never keeps the raw
 * event array. A long-running subagent can emit thousands of deltas
 * without the state growing past what its structural output (N text
 * runs + M tool calls + a bounded tail preview) needs.
 */
export interface SubagentProgress {
  /** Child run id from the SDK — unique per spawn; one tool_call may only have one. */
  subagentRunId: string;
  /** `type` identifier from the SubagentConfig (e.g. 'self', 'researcher'). */
  subagentType: string;
  /** Child agent id (for avatar / name lookup in the ticker header). */
  subagentAgentId?: string;
  /**
   * Fully aggregated child content parts. Bounded by structure (text
   * runs + reasoning runs + tool calls), not by delta volume.
   */
  contentParts: SubagentContentPart[];
  /** Cursor carried across `foldSubagentEvent` calls. */
  aggregatorState: SubagentAggregatorState;
  /** Ticker lines + live-cursor state, built incrementally. */
  tickerState: SubagentTickerState;
  /** Current lifecycle phase — drives the header "running" / "done" state. */
  status: SubagentUpdatePhase;
  /** Convenience: last event's `label` for quick ticker display. */
  latestLabel?: string;
}

/** One child invocation selected for the shared read-only activity panel. */
export type ActiveSubagentPanel = {
  host: 'conversation' | 'share';
  shareId?: string;
  parentConversationId: string;
  parentMessageId: string;
  toolCallId: string;
  partIndex: number;
  subagentType: string;
  prompt?: string;
  legacyOutput?: string | null;
  persistedContent?: TMessageContentParts[];
  initialProgress: number;
  isSubmitting: boolean;
  runStepStatus?: PartMetadata['runStepStatus'];
  durable?: {
    threadId: string;
    taskId: string;
  };
};

export const activeSubagentPanel = atom<ActiveSubagentPanel | null>({
  key: 'activeSubagentPanel',
  default: null,
});

/** Stable identity for one subagent invocation in the parent conversation. */
export const subagentProgressKey = (
  parentMessageId: string,
  toolCallId: string,
  partIndex: number,
) => `${parentMessageId}\u0000${toolCallId}\u0000${partIndex}`;

/** Progress state keyed by one concrete tool-call content-part occurrence. */
export const subagentProgressByToolCallId = atomFamily<SubagentProgress | null, string>({
  key: 'subagentProgressByToolCallId',
  default: null,
});

/** Shared reducer for foreground chat SSE and task-scoped detached activity SSE. */
export function reduceSubagentProgress(
  previous: SubagentProgress | null,
  events: SubagentUpdateEvent[],
): SubagentProgress | null {
  if (events.length === 0) return previous;
  let contentParts = previous?.contentParts ?? [];
  let aggregatorState = previous?.aggregatorState ?? initSubagentAggregatorState();
  let tickerState = previous?.tickerState ?? initSubagentTickerState();
  for (const event of events) {
    ({ parts: contentParts, state: aggregatorState } = foldSubagentEvent(
      contentParts,
      aggregatorState,
      event,
    ));
    tickerState = foldSubagentEventIntoTicker(tickerState, event);
  }
  const last = events[events.length - 1];
  return {
    subagentRunId: last.subagentRunId,
    subagentType: last.subagentType,
    subagentAgentId: last.subagentAgentId ?? previous?.subagentAgentId,
    contentParts,
    aggregatorState,
    tickerState,
    status: last.phase,
    latestLabel: last.label ?? previous?.latestLabel,
  };
}
