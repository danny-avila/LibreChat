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

/** Shape of one line in the collapsed ticker. Kept as a plain string for
 *  simple rendering; the `live` flag lets the UI animate the streaming
 *  preview if it wants to. */
export interface SubagentTickerLine {
  text: string;
  /** True when this line represents a still-streaming text/reasoning buffer. */
  live?: boolean;
}

const PREVIEW_MAX_CHARS = 60;
/** Keep the tail of the buffer so the user sees what's being generated now. */
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

interface TickerDeps {
  /** i18n-friendly formatters. When called with `args`/`output` the
   *  formatter receives a short already-truncated snippet (≤48 chars).
   *  `args`/`output` are empty strings when not extractable — the
   *  formatter decides whether to append them. */
  formatUsingTool?: (toolNames: string, args: string) => string;
  formatToolComplete?: (toolName: string, output: string) => string;
  writingPrefix?: string;
  reasoningPrefix?: string;
  errorPrefix?: string;
}

const defaultDeps: Required<TickerDeps> = {
  formatUsingTool: (names, args) => (args ? `Using ${names}(${args})` : `Using tool: ${names}`),
  formatToolComplete: (name, output) => (output ? `${name} → ${output}` : `Tool ${name} complete`),
  writingPrefix: 'Writing',
  reasoningPrefix: 'Reasoning',
  errorPrefix: 'Error',
};

/**
 * Turn the event stream into short status lines the ticker can display.
 *
 * Adjacent message/reasoning deltas collapse into a single live line that
 * updates in place (tail of the buffer). Tool call starts/completions
 * emit their own discrete line. Start/stop/run_step_delta events are
 * suppressed — they're either lifecycle-only or too granular to show.
 */
export function buildSubagentTickerLines(
  events: SubagentUpdateEvent[],
  deps: TickerDeps = {},
): SubagentTickerLine[] {
  const d = { ...defaultDeps, ...deps };
  const lines: SubagentTickerLine[] = [];
  let textBuffer = '';
  let thinkBuffer = '';
  let textLineIdx: number | null = null;
  let thinkLineIdx: number | null = null;

  const resetTextStreak = (): void => {
    textBuffer = '';
    textLineIdx = null;
  };
  const resetThinkStreak = (): void => {
    thinkBuffer = '';
    thinkLineIdx = null;
  };

  for (const event of events) {
    if (event.phase === 'message_delta') {
      const chunk = extractTextChunk(event.data as MessageDeltaData | undefined);
      if (!chunk) continue;
      textBuffer += chunk;
      const preview = `${d.writingPrefix}: ${truncatePreview(textBuffer)}`;
      if (textLineIdx === null) {
        lines.push({ text: preview, live: true });
        textLineIdx = lines.length - 1;
      } else {
        lines[textLineIdx] = { text: preview, live: true };
      }
      continue;
    }

    if (event.phase === 'reasoning_delta') {
      const chunk = extractThinkChunk(event.data as ReasoningDeltaData | undefined);
      if (!chunk) continue;
      thinkBuffer += chunk;
      const preview = `${d.reasoningPrefix}: ${truncatePreview(thinkBuffer)}`;
      if (thinkLineIdx === null) {
        lines.push({ text: preview, live: true });
        thinkLineIdx = lines.length - 1;
      } else {
        lines[thinkLineIdx] = { text: preview, live: true };
      }
      continue;
    }

    if (event.phase === 'run_step') {
      resetTextStreak();
      resetThinkStreak();

      const data = event.data as RunStepData | undefined;
      if (data?.stepDetails?.type === 'tool_calls') {
        const toolCalls = data.stepDetails.tool_calls ?? [];
        const named = toolCalls.filter(
          (tc): tc is { id?: string; name: string; args?: unknown } =>
            typeof tc?.name === 'string' && tc.name.length > 0,
        );
        if (named.length > 0) {
          const names = named.map((tc) => tc.name).join(', ');
          const argsSnippet = named.length === 1 ? summarizeArgs(named[0].args) : '';
          lines.push({ text: d.formatUsingTool(names, argsSnippet) });
        }
      }
      continue;
    }

    if (event.phase === 'run_step_completed') {
      const data = event.data as RunStepCompletedData | undefined;
      const tc = data?.result?.tool_call;
      if (typeof tc?.name === 'string' && tc.name.length > 0) {
        const outputSnippet = summarizeOutput(tc.output);
        lines.push({ text: d.formatToolComplete(tc.name, outputSnippet) });
      }
      continue;
    }

    if (event.phase === 'error') {
      const data = event.data as ErrorData | undefined;
      const msg = data?.message ?? '';
      lines.push({ text: msg ? `${d.errorPrefix}: ${msg}` : d.errorPrefix });
      continue;
    }
  }

  return lines;
}
