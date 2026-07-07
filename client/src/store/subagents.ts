import { atom, atomFamily, selectorFamily } from 'recoil';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import type { SubagentUpdatePhase } from 'librechat-data-provider';
import type {
  SubagentAggregatorState,
  SubagentContentPart,
  SubagentTickerState,
} from '~/utils/subagentContent';

/**
 * Progress bucket captured per subagent tool call. Populated as
 * `ON_SUBAGENT_UPDATE` SSE events stream in from the backend. Keyed by the
 * parent's `tool_call_id` so the `SubagentCall` renderer can look the bucket
 * up from the tool call it's rendering.
 *
 * Both the dialog content and the ticker are aggregated *incrementally*
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

/** Progress state keyed by parent tool_call_id. */
export const subagentProgressByToolCallId = atomFamily<SubagentProgress | null, string>({
  key: 'subagentProgressByToolCallId',
  default: null,
});

/**
 * Static per-run data the inline card holds as props (persisted content,
 * final output, prompt args, attachments) registered into a shared map so
 * the right-side {@link SubagentPanel}, rendered far up the tree in
 * `Presentation`, can render a run it never received as props. The live
 * activity (streaming parts, ticker, status) still comes from
 * {@link subagentProgressByToolCallId}; this registry only carries what the
 * progress atom lacks. Keyed by the parent `tool_call_id`.
 *
 * Mirrors `artifactsState`: entries persist after a card unmounts (message
 * virtualization) so an open panel keeps its data; the whole map resets on
 * conversation change via `useResetSubagentOnConversationChange`.
 */
export interface SubagentRun {
  toolCallId: string;
  args?: string | Record<string, unknown>;
  output?: string | null;
  attachments?: TAttachment[];
  persistedContent?: TMessageContentParts[];
  initialProgress: number;
}

export const subagentRunsState = atom<Record<string, SubagentRun> | undefined>({
  key: 'subagentRunsState',
  default: undefined,
});

/** Per-run slice of {@link subagentRunsState}, so the panel and card
 *  subscribe only to their own entry. */
export const subagentRunByIdSelector = selectorFamily<SubagentRun | undefined, string>({
  key: 'subagentRunById',
  get:
    (toolCallId) =>
    ({ get }) =>
      get(subagentRunsState)?.[toolCallId],
});

/**
 * The subagent run currently focused in the shared right-side panel. The
 * true open-gate (mirrors `currentArtifactId`): `null` ⇒ panel closed.
 * Reset on conversation change; set by the inline card's click / stream
 * auto-focus through `useOpenRightPanel`.
 */
export const currentSubagentRunId = atom<string | null>({
  key: 'currentSubagentRunId',
  default: null,
});

/**
 * Sticky visibility toggle for the subagent panel (mirrors
 * `artifactsVisibility`): survives conversation change so a user who closed
 * the panel keeps it closed, while `currentSubagentRunId` alone drives which
 * run is shown.
 */
export const subagentPanelVisibility = atom<boolean>({
  key: 'subagentPanelVisibility',
  default: true,
});
