import { ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { SubagentUpdateEvent } from 'librechat-data-provider';

/**
 * Client-side helpers for rendering the live `SubagentCall` UI while
 * `ON_SUBAGENT_UPDATE` events stream in. Exports two pure transforms:
 *
 *   - `aggregateSubagentContent` — folds the raw event stream into an
 *     ordered array of TEXT / THINK / TOOL_CALL parts so the dialog can
 *     render the child's activity through the same `<Part />` pipeline
 *     the parent conversation uses. Frontend-only: on the backend we
 *     fold directly into the SDK's `createContentAggregator` in the
 *     `ON_SUBAGENT_UPDATE` handler, so no shared aggregator is needed.
 *   - `buildSubagentTickerLines` — short, user-readable status lines
 *     for the collapsed ticker. Aggregates message/reasoning deltas
 *     into running previews, surfaces tool-call lifecycle with
 *     args/output snippets, drops low-signal events.
 */

type RunStepData = {
  id?: string;
  stepDetails?: {
    type?: string;
    tool_calls?: Array<{
      id?: string;
      name?: string;
      args?: unknown;
      type?: string;
    }>;
  };
};

type RunStepCompletedData = {
  result?: {
    type?: string;
    tool_call?: {
      id?: string;
      name?: string;
      args?: unknown;
      output?: string;
      progress?: number;
    };
  };
};

type MessageDeltaData = {
  delta?: { content?: Array<{ type?: string; text?: string }> };
};

type ReasoningDeltaData = {
  delta?: { content?: Array<{ type?: string; think?: string }> };
};

type ErrorData = { message?: string };

type TextPart = { type: ContentTypes.TEXT; text: string };
type ThinkPart = { type: ContentTypes.THINK; think: string };
type ToolCallPart = {
  type: ContentTypes.TOOL_CALL;
  tool_call: {
    id: string;
    name: string;
    args: string;
    output?: string;
    progress: number;
    type?: string;
  };
};

/** Single content-part-shaped entry produced by the aggregator. The union
 *  matches the subset of `TMessageContentParts` a subagent run emits. */
export type SubagentContentPart = TextPart | ThinkPart | ToolCallPart;

const extractTextChunk = (data: MessageDeltaData | undefined): string => {
  const content = data?.delta?.content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      return block.text;
    }
  }
  return '';
};

const extractThinkChunk = (data: ReasoningDeltaData | undefined): string => {
  const content = data?.delta?.content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (block?.type === 'think' && typeof block.think === 'string') {
      return block.think;
    }
  }
  return '';
};

const stringifyArgs = (args: unknown): string =>
  typeof args === 'string' ? args : JSON.stringify(args ?? {});

/**
 * Cursor carried across `foldSubagentEvent` calls so the aggregator can
 * extend an in-flight TEXT/THINK run without re-scanning earlier parts
 * on every event. `null` means the corresponding buffer is closed;
 * otherwise it's the index of the still-growing part in `contentParts`.
 */
export interface SubagentAggregatorState {
  /** Index of the currently-open TEXT part, or `null` when none. */
  openTextIdx: number | null;
  /** Index of the currently-open THINK part, or `null` when none. */
  openThinkIdx: number | null;
  /** `tool_call.id` → its index in `contentParts` for O(1) updates. */
  toolCallIndexById: Record<string, number>;
}

/** Initial empty aggregator state. */
export function initSubagentAggregatorState(): SubagentAggregatorState {
  return {
    openTextIdx: null,
    openThinkIdx: null,
    toolCallIndexById: {},
  };
}

/**
 * Incrementally fold a single {@link SubagentUpdateEvent} into an existing
 * `contentParts` array, returning a new array + updated cursor state.
 * Pure function — never mutates inputs.
 *
 * Adjacent `message_delta` / `reasoning_delta` events extend the in-flight
 * TEXT / THINK part (tracked via the open*Idx cursors). When a delta
 * type switches, the opposite buffer is closed first so chronological
 * order is preserved — what the user saw is what lands in the array.
 *
 * `run_step` with `tool_calls` closes any open text/think and appends a
 * TOOL_CALL part per unique id. `run_step_completed` updates the matching
 * TOOL_CALL (output + progress). Late-arriving completions without a
 * prior `run_step` synthesize the part. `start` / `stop` / `error` /
 * `run_step_delta` contribute nothing to content.
 */
export function foldSubagentEvent(
  parts: SubagentContentPart[],
  state: SubagentAggregatorState,
  event: SubagentUpdateEvent,
): { parts: SubagentContentPart[]; state: SubagentAggregatorState } {
  if (event.phase === 'message_delta') {
    const chunk = extractTextChunk(event.data as MessageDeltaData | undefined);
    if (!chunk) return { parts, state };
    /** Reasoning→text transition: close the open THINK so the THINK part
     *  lands BEFORE the TEXT part in chronological order. */
    const afterThinkClose = state.openThinkIdx != null ? { ...state, openThinkIdx: null } : state;
    if (afterThinkClose.openTextIdx != null) {
      const idx = afterThinkClose.openTextIdx;
      const existing = parts[idx] as TextPart;
      const next = parts.slice();
      next[idx] = { type: ContentTypes.TEXT, text: existing.text + chunk };
      return { parts: next, state: afterThinkClose };
    }
    const next = parts.slice();
    const newIdx = next.length;
    next.push({ type: ContentTypes.TEXT, text: chunk });
    return { parts: next, state: { ...afterThinkClose, openTextIdx: newIdx } };
  }

  if (event.phase === 'reasoning_delta') {
    const chunk = extractThinkChunk(event.data as ReasoningDeltaData | undefined);
    if (!chunk) return { parts, state };
    const afterTextClose = state.openTextIdx != null ? { ...state, openTextIdx: null } : state;
    if (afterTextClose.openThinkIdx != null) {
      const idx = afterTextClose.openThinkIdx;
      const existing = parts[idx] as ThinkPart;
      const next = parts.slice();
      next[idx] = { type: ContentTypes.THINK, think: existing.think + chunk };
      return { parts: next, state: afterTextClose };
    }
    const next = parts.slice();
    const newIdx = next.length;
    next.push({ type: ContentTypes.THINK, think: chunk });
    return { parts: next, state: { ...afterTextClose, openThinkIdx: newIdx } };
  }

  if (event.phase === 'run_step') {
    const data = event.data as RunStepData | undefined;
    if (data?.stepDetails?.type !== 'tool_calls') return { parts, state };
    const toolCalls = data.stepDetails.tool_calls ?? [];
    let next = parts;
    const toolCallIndexById = { ...state.toolCallIndexById };
    for (const tc of toolCalls) {
      if (typeof tc?.id !== 'string' || !tc.id || tc.id in toolCallIndexById) continue;
      if (next === parts) next = parts.slice();
      toolCallIndexById[tc.id] = next.length;
      next.push({
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          id: tc.id,
          name: tc.name ?? '',
          args: stringifyArgs(tc.args),
          progress: 0.1,
          type: tc.type ?? ToolCallTypes.TOOL_CALL,
        },
      });
    }
    if (next === parts) return { parts, state: { ...state, toolCallIndexById } };
    /** New tool_call parts bound any open TEXT/THINK to the run before
     *  them — close the buffers. */
    return {
      parts: next,
      state: { openTextIdx: null, openThinkIdx: null, toolCallIndexById },
    };
  }

  if (event.phase === 'run_step_completed') {
    const data = event.data as RunStepCompletedData | undefined;
    const tc = data?.result?.tool_call;
    if (typeof tc?.id !== 'string' || !tc.id) return { parts, state };
    const existingIdx = state.toolCallIndexById[tc.id];
    if (existingIdx != null) {
      const existing = parts[existingIdx] as ToolCallPart;
      const merged: ToolCallPart = {
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          ...existing.tool_call,
          ...(tc.name ? { name: tc.name } : {}),
          ...(tc.args != null ? { args: stringifyArgs(tc.args) } : {}),
          ...(tc.output != null ? { output: tc.output } : {}),
          progress: tc.progress ?? 1,
        },
      };
      const next = parts.slice();
      next[existingIdx] = merged;
      return { parts: next, state };
    }
    /** Late-arriving completion without a prior run_step — synthesize the
     *  part (and close any open buffer like run_step would). */
    const next = parts.slice();
    const newIdx = next.length;
    next.push({
      type: ContentTypes.TOOL_CALL,
      tool_call: {
        id: tc.id,
        name: tc.name ?? '',
        args: stringifyArgs(tc.args),
        output: tc.output,
        progress: tc.progress ?? 1,
        type: ToolCallTypes.TOOL_CALL,
      },
    });
    return {
      parts: next,
      state: {
        openTextIdx: null,
        openThinkIdx: null,
        toolCallIndexById: { ...state.toolCallIndexById, [tc.id]: newIdx },
      },
    };
  }

  return { parts, state };
}

/**
 * Batch wrapper around {@link foldSubagentEvent}: folds an entire event
 * stream in one go and returns just the parts. Kept for tests and for
 * legacy call-sites that don't need cursor state.
 */
export function aggregateSubagentContent(events: SubagentUpdateEvent[]): SubagentContentPart[] {
  let parts: SubagentContentPart[] = [];
  let state = initSubagentAggregatorState();
  for (const event of events) {
    ({ parts, state } = foldSubagentEvent(parts, state, event));
  }
  return parts;
}

/**
 * Discriminated-union ticker line. Keeping the label tokens + body/snippets
 * separate from their rendered strings lets the caller localize at
 * render time (hooks can't live in a pure aggregator) and — more
 * importantly — lets the UI split a fixed prefix (e.g. "Writing: ")
 * from a tail-truncatable body, so the prefix never gets clipped out
 * of view when the body overflows.
 */
export type SubagentTickerLine =
  | { kind: 'writing'; body: string }
  | { kind: 'reasoning'; body: string }
  | { kind: 'using_tool'; toolNames: string[]; argsSnippet?: string }
  | { kind: 'tool_complete'; toolName: string; outputSnippet?: string }
  | { kind: 'error'; message?: string };

/** Live-update cursor carried across incremental folds. Mirrors the
 *  content-parts aggregator pattern so the atom can own the ticker
 *  state and never has to re-aggregate from a trimmed event buffer. */
export interface SubagentTickerState {
  lines: SubagentTickerLine[];
  /** Index of the in-flight 'writing' line (for in-place tail updates). */
  textLineIdx: number | null;
  /** Index of the in-flight 'reasoning' line. */
  thinkLineIdx: number | null;
  /** Raw message-delta accumulator — truncated into `writing.body` but
   *  preserved so subsequent deltas extend the running preview. */
  textBuffer: string;
  thinkBuffer: string;
}

export function initSubagentTickerState(): SubagentTickerState {
  return {
    lines: [],
    textLineIdx: null,
    thinkLineIdx: null,
    textBuffer: '',
    thinkBuffer: '',
  };
}

/** Generous tail window so wide ticker containers aren't half-empty.
 *  Paired with CSS tail-ellipsis (direction:rtl + bdi in SubagentCall) so
 *  narrow viewports still clip from the oldest side — the reader always
 *  sees the characters being generated *now*. */
const PREVIEW_MAX_CHARS = 300;
const truncatePreview = (input: string): string => {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length <= PREVIEW_MAX_CHARS) return normalized;
  return `…${normalized.slice(-PREVIEW_MAX_CHARS)}`;
};

const SNIPPET_MAX_CHARS = 48;
/** Short head-truncation for tool args/output — caller labels what each
 *  side is. Whitespace collapsed so multi-line outputs stay one line. */
const truncateSnippet = (input: string): string => {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length <= SNIPPET_MAX_CHARS) return normalized;
  return `${normalized.slice(0, SNIPPET_MAX_CHARS)}…`;
};

/** Best-effort, non-rendering summary of a tool's args payload. Parsed JSON
 *  is collapsed into `key=value, key=value`; everything else falls back to
 *  the raw string. Returns `''` when nothing useful is extractable. */
const summarizeArgs = (args: unknown): string => {
  if (typeof args !== 'string' || args.length === 0) return '';
  const raw = args.trim();
  if (raw.length === 0 || raw === '{}' || raw === '[]') return '';
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => {
          const valueStr = typeof v === 'string' ? v : JSON.stringify(v);
          return `${k}=${valueStr}`;
        });
      if (entries.length === 0) return '';
      return truncateSnippet(entries.join(', '));
    }
  } catch {
    /* fall through to raw-string snippet */
  }
  return truncateSnippet(raw);
};

const summarizeOutput = (output: unknown): string => {
  if (typeof output === 'string') return truncateSnippet(output);
  if (output == null) return '';
  try {
    return truncateSnippet(JSON.stringify(output));
  } catch {
    return '';
  }
};

/**
 * Incrementally fold a single {@link SubagentUpdateEvent} into the ticker
 * state. Pure — never mutates inputs. Stored in the Recoil atom so the
 * ticker always reflects the *full* run, not just the rolling event
 * window (which trims as deltas pile up and can drop earlier tool_call
 * lifecycle events).
 *
 * Message/reasoning deltas extend an in-flight line via the `textLineIdx`
 * / `thinkLineIdx` cursors. A `run_step` with tool_calls closes the
 * running buffers and appends a `using_tool` line. `run_step_completed`
 * appends a `tool_complete` line. `error` appends an `error` line.
 * Phases we ignore (`start`, `stop`, `run_step_delta`): pass-through.
 */
export function foldSubagentEventIntoTicker(
  state: SubagentTickerState,
  event: SubagentUpdateEvent,
): SubagentTickerState {
  if (event.phase === 'message_delta') {
    const chunk = extractTextChunk(event.data as MessageDeltaData | undefined);
    if (!chunk) return state;
    const textBuffer = state.textBuffer + chunk;
    const body = truncatePreview(textBuffer);
    const line: SubagentTickerLine = { kind: 'writing', body };
    if (state.textLineIdx == null) {
      const lines = state.lines.concat(line);
      return { ...state, textBuffer, lines, textLineIdx: lines.length - 1 };
    }
    const lines = state.lines.slice();
    lines[state.textLineIdx] = line;
    return { ...state, textBuffer, lines };
  }

  if (event.phase === 'reasoning_delta') {
    const chunk = extractThinkChunk(event.data as ReasoningDeltaData | undefined);
    if (!chunk) return state;
    const thinkBuffer = state.thinkBuffer + chunk;
    const body = truncatePreview(thinkBuffer);
    const line: SubagentTickerLine = { kind: 'reasoning', body };
    if (state.thinkLineIdx == null) {
      const lines = state.lines.concat(line);
      return { ...state, thinkBuffer, lines, thinkLineIdx: lines.length - 1 };
    }
    const lines = state.lines.slice();
    lines[state.thinkLineIdx] = line;
    return { ...state, thinkBuffer, lines };
  }

  if (event.phase === 'run_step') {
    /** A new run_step starts a fresh lifecycle marker and closes any
     *  in-flight streaming line — the delta cursors reset so the *next*
     *  message/reasoning delta starts its own line below the tool call. */
    const afterClose: SubagentTickerState = {
      ...state,
      textBuffer: '',
      thinkBuffer: '',
      textLineIdx: null,
      thinkLineIdx: null,
    };
    const data = event.data as RunStepData | undefined;
    if (data?.stepDetails?.type !== 'tool_calls') return afterClose;
    const toolCalls = data.stepDetails.tool_calls ?? [];
    const named = toolCalls.filter(
      (tc): tc is { id?: string; name: string; args?: unknown } =>
        typeof tc?.name === 'string' && tc.name.length > 0,
    );
    if (named.length === 0) return afterClose;
    const toolNames = named.map((tc) => tc.name);
    const argsSnippet = named.length === 1 ? summarizeArgs(named[0].args) : undefined;
    const line: SubagentTickerLine = {
      kind: 'using_tool',
      toolNames,
      ...(argsSnippet ? { argsSnippet } : {}),
    };
    return { ...afterClose, lines: afterClose.lines.concat(line) };
  }

  if (event.phase === 'run_step_completed') {
    const data = event.data as RunStepCompletedData | undefined;
    const tc = data?.result?.tool_call;
    if (typeof tc?.name !== 'string' || tc.name.length === 0) return state;
    const outputSnippet = tc.output != null ? summarizeOutput(tc.output) : undefined;
    const line: SubagentTickerLine = {
      kind: 'tool_complete',
      toolName: tc.name,
      ...(outputSnippet ? { outputSnippet } : {}),
    };
    return { ...state, lines: state.lines.concat(line) };
  }

  if (event.phase === 'error') {
    const data = event.data as ErrorData | undefined;
    const line: SubagentTickerLine = {
      kind: 'error',
      ...(data?.message ? { message: data.message } : {}),
    };
    return { ...state, lines: state.lines.concat(line) };
  }

  return state;
}

/**
 * Batch wrapper around {@link foldSubagentEventIntoTicker} — folds an
 * entire event stream in one shot. Kept for tests and any legacy
 * consumer that prefers a one-call API.
 */
export function buildSubagentTickerLines(events: SubagentUpdateEvent[]): SubagentTickerLine[] {
  let state = initSubagentTickerState();
  for (const event of events) {
    state = foldSubagentEventIntoTicker(state, event);
  }
  return state.lines;
}
