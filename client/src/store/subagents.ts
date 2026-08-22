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
 * without retaining the raw event stream. The folded activity is also
 * capped by item count and encoded size to match the durable public view.
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
  /** Whether the folded events cover the run from its beginning or only the
   *  forward-only suffix observed after opening a detached task stream. */
  coverage?: 'complete' | 'suffix';
}

const MAX_RECENT_EVENT_KEYS = 256;
const MAX_LIVE_ACTIVITY_ITEMS = 100;
const MAX_LIVE_ACTIVITY_BYTES = 64 * 1024;
const MAX_SINGLE_ACTIVITY_ENCODED_BYTES = MAX_LIVE_ACTIVITY_BYTES - 2;
const MAX_SINGLE_ACTIVITY_TEXT_BYTES = 60 * 1024;
const REDACTED_REASONING_MARKER = '…';

const encodedBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const truncateUtf8 = (value: string, maxBytes: number, keepTail = false): string => {
  if (new TextEncoder().encode(value).byteLength <= maxBytes) return value;
  const chars = [...value];
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = keepTail ? chars.slice(-mid).join('') : chars.slice(0, mid).join('');
    if (new TextEncoder().encode(candidate).byteLength <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return keepTail ? chars.slice(-low).join('') : chars.slice(0, low).join('');
};

const fitStringField = <T>(
  value: string,
  candidate: (bounded: string) => T,
  maxBytes: number,
  keepTail = false,
): T => {
  const chars = [...value];
  let low = 0;
  let high = chars.length;
  let result = candidate('');
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const bounded = keepTail ? chars.slice(-mid).join('') : chars.slice(0, mid).join('');
    const next = candidate(bounded);
    if (encodedBytes(next) <= maxBytes) {
      low = mid;
      result = next;
    } else {
      high = mid - 1;
    }
  }
  return result;
};

const boundSingletonPart = (part: SubagentContentPart): SubagentContentPart => {
  if (part.type === ContentTypes.TEXT) {
    const rawBounded = truncateUtf8(part.text, MAX_SINGLE_ACTIVITY_TEXT_BYTES, true);
    return fitStringField(
      rawBounded,
      (text) => ({ ...part, text }),
      MAX_SINGLE_ACTIVITY_ENCODED_BYTES,
      true,
    );
  }
  if (part.type === ContentTypes.THINK) {
    const rawBounded = truncateUtf8(part.think, MAX_SINGLE_ACTIVITY_TEXT_BYTES, true);
    return fitStringField(
      rawBounded,
      (think) => ({ ...part, think }),
      MAX_SINGLE_ACTIVITY_ENCODED_BYTES,
      true,
    );
  }

  let bounded: SubagentContentPart = {
    ...part,
    tool_call: {
      ...part.tool_call,
      args: truncateUtf8(part.tool_call.args, 24 * 1024),
      ...(part.tool_call.output == null
        ? {}
        : { output: truncateUtf8(part.tool_call.output, 24 * 1024, true) }),
    },
  };
  if (encodedBytes(bounded) <= MAX_SINGLE_ACTIVITY_ENCODED_BYTES) return bounded;

  const fitToolField = (field: 'output' | 'args' | 'name' | 'id' | 'type', keepTail = false) => {
    if (bounded.type !== ContentTypes.TOOL_CALL) return;
    const current = bounded;
    const value = current.tool_call[field];
    if (typeof value !== 'string') return;
    bounded = fitStringField(
      value,
      (nextValue) => ({
        ...current,
        tool_call: { ...current.tool_call, [field]: nextValue },
      }),
      MAX_SINGLE_ACTIVITY_ENCODED_BYTES,
      keepTail,
    ) as SubagentContentPart;
  };
  fitToolField('output', true);
  if (encodedBytes(bounded) > MAX_SINGLE_ACTIVITY_ENCODED_BYTES) fitToolField('args');
  if (encodedBytes(bounded) > MAX_SINGLE_ACTIVITY_ENCODED_BYTES) fitToolField('name');
  if (encodedBytes(bounded) > MAX_SINGLE_ACTIVITY_ENCODED_BYTES) fitToolField('id');
  if (encodedBytes(bounded) > MAX_SINGLE_ACTIVITY_ENCODED_BYTES) fitToolField('type');
  return bounded;
};

const boundContentParts = (
  parts: SubagentContentPart[],
  state: SubagentAggregatorState,
): { parts: SubagentContentPart[]; state: SubagentAggregatorState } => {
  const start = Math.max(0, parts.length - MAX_LIVE_ACTIVITY_ITEMS);
  let offset = parts.length;
  let totalBytes = 2;
  let bounded: SubagentContentPart[] = [];
  for (let index = parts.length - 1; index >= start; index -= 1) {
    const partBytes = encodedBytes(parts[index]);
    const separatorBytes = bounded.length === 0 ? 0 : 1;
    if (totalBytes + separatorBytes + partBytes > MAX_LIVE_ACTIVITY_BYTES) {
      if (bounded.length === 0) {
        bounded = [boundSingletonPart(parts[index])];
        offset = index;
      }
      break;
    }
    bounded.unshift(parts[index]);
    offset = index;
    totalBytes += separatorBytes + partBytes;
  }
  if (encodedBytes(bounded) > MAX_LIVE_ACTIVITY_BYTES) {
    bounded = [];
    offset = parts.length;
  }
  const rebase = (index: number | null): number | null =>
    index != null && index >= offset && index - offset < bounded.length ? index - offset : null;
  const toolCallIndexById = Object.fromEntries(
    bounded.flatMap((part, index) =>
      part.type === ContentTypes.TOOL_CALL ? [[part.tool_call.id, index]] : [],
    ),
  );
  return {
    parts: bounded,
    state: {
      openTextIdx: rebase(state.openTextIdx),
      openThinkIdx: rebase(state.openThinkIdx),
      toolCallIndexById,
    },
  };
};

const boundTickerState = (state: SubagentTickerState): SubagentTickerState => {
  const start = Math.max(0, state.lines.length - MAX_LIVE_ACTIVITY_ITEMS);
  let offset = state.lines.length;
  let totalBytes = 2;
  const lines = [] as SubagentTickerState['lines'];
  for (let index = state.lines.length - 1; index >= start; index -= 1) {
    const lineBytes = encodedBytes(state.lines[index]);
    const separatorBytes = lines.length === 0 ? 0 : 1;
    if (totalBytes + separatorBytes + lineBytes > MAX_LIVE_ACTIVITY_BYTES) break;
    lines.unshift(state.lines[index]);
    offset = index;
    totalBytes += separatorBytes + lineBytes;
  }
  const rebase = (index: number | null): number | null =>
    index != null && index >= offset ? index - offset : null;
  return {
    ...state,
    lines,
    textLineIdx: rebase(state.textLineIdx),
    thinkLineIdx: rebase(state.thinkLineIdx),
  };
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const eventKey = (event: SubagentUpdateEvent): string | undefined => {
  const activityEventId = event.activityEventId?.trim();
  if (!activityEventId) return undefined;
  return hashString(`${event.subagentRunId}\u0000${activityEventId}`);
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
  source: 'parent' | 'detached' = 'parent',
): SubagentProgress | null {
  if (events.length === 0) return previous;
  const recentEventKeys = [...(previous?.recentEventKeys ?? [])];
  const seen = new Set(recentEventKeys);
  const uniqueEvents: SubagentUpdateEvent[] = [];
  for (const event of events) {
    const key = eventKey(event);
    if (key != null && seen.has(key)) continue;
    if (key != null) seen.add(key);
    uniqueEvents.push(event);
    if (key != null) recentEventKeys.push(key);
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
  ({ parts: contentParts, state: aggregatorState } = boundContentParts(
    contentParts,
    aggregatorState,
  ));
  tickerState = boundTickerState(tickerState);
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
    coverage: previous?.coverage ?? (source === 'detached' ? 'suffix' : 'complete'),
  };
}
