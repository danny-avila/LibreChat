import { atom, atomFamily } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
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
  /** Bounded replay fence for events that overlap parent and detached SSE delivery. */
  recentEventKeys?: string[];
}

const MAX_RECENT_EVENT_KEYS = 256;
const REDACTED_REASONING_MARKER = '…';

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const eventKey = (event: SubagentUpdateEvent): string => {
  let data = '[redacted]';
  if (event.phase !== 'reasoning_delta') {
    try {
      data = JSON.stringify(event.data) ?? '';
    } catch {
      data = '[unserializable]';
    }
  }
  return hashString(
    [
      event.subagentRunId,
      event.parentToolCallId ?? '',
      event.memberAgentId ?? '',
      event.phase,
      event.timestamp,
      event.label ?? '',
      data,
    ].join('\u0000'),
  );
};

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

/**
 * Invocation atoms populated by either the parent generation stream or the selected detached
 * task stream. The conversation host drains this registry on navigation so both transports share
 * one cleanup boundary instead of leaking detached-only atom-family members for the app lifetime.
 */
const registeredSubagentProgressKeys = new Set<string>();

export function registerSubagentProgressKey(key: string): void {
  registeredSubagentProgressKeys.add(key);
}

export function takeRegisteredSubagentProgressKeys(): string[] {
  const keys = [...registeredSubagentProgressKeys];
  registeredSubagentProgressKeys.clear();
  return keys;
}

/** Shared reducer for foreground chat SSE and task-scoped detached activity SSE. */
export function reduceSubagentProgress(
  previous: SubagentProgress | null,
  events: SubagentUpdateEvent[],
): SubagentProgress | null {
  if (events.length === 0) return previous;
  const recentEventKeys = [...(previous?.recentEventKeys ?? [])];
  const seen = new Set(recentEventKeys);
  const uniqueEvents: SubagentUpdateEvent[] = [];
  for (const event of events) {
    const key = eventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueEvents.push(event);
    recentEventKeys.push(key);
  }
  if (uniqueEvents.length === 0) return previous;
  const boundedEventKeys = recentEventKeys.slice(-MAX_RECENT_EVENT_KEYS);
  let contentParts = previous?.contentParts ?? [];
  let aggregatorState = previous?.aggregatorState ?? initSubagentAggregatorState();
  let tickerState = previous?.tickerState ?? initSubagentTickerState();
  for (const event of uniqueEvents) {
    const foldEvent =
      event.phase === 'reasoning_delta' &&
      event.data == null &&
      aggregatorState.openThinkIdx == null
        ? {
            ...event,
            data: {
              delta: {
                content: [{ type: ContentTypes.THINK, think: REDACTED_REASONING_MARKER }],
              },
            },
          }
        : event;
    ({ parts: contentParts, state: aggregatorState } = foldSubagentEvent(
      contentParts,
      aggregatorState,
      foldEvent,
    ));
    tickerState = foldSubagentEventIntoTicker(tickerState, foldEvent);
  }
  const last = uniqueEvents[uniqueEvents.length - 1];
  return {
    subagentRunId: last.subagentRunId,
    subagentType: last.subagentType,
    subagentAgentId: last.subagentAgentId ?? previous?.subagentAgentId,
    contentParts,
    aggregatorState,
    tickerState,
    status: last.phase,
    latestLabel: last.label ?? previous?.latestLabel,
    recentEventKeys: boundedEventKeys,
  };
}
