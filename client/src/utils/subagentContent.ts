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
 * Walk the event stream and rebuild the child's content array.
 *
 * Adjacent `message_delta` / `reasoning_delta` events concatenate into a
 * single TEXT / THINK part. A text chunk arriving after reasoning closes
 * the open THINK buffer first so chronological order is preserved — the
 * parts array reflects what the user observed, not the order our buffers
 * happen to flush.
 *
 * Tool calls become TOOL_CALL parts. `run_step` with `tool_calls` closes
 * any open text/think so tool calls split text runs correctly.
 * `run_step_completed` finalizes the matching TOOL_CALL with its output
 * and progress = 1. Late-arriving completions without a prior `run_step`
 * synthesize the part.
 *
 * `start` / `stop` / `error` / `run_step_delta` do not contribute content.
 */
export function aggregateSubagentContent(events: SubagentUpdateEvent[]): SubagentContentPart[] {
  const parts: SubagentContentPart[] = [];
  let currentText: TextPart | null = null;
  let currentThink: ThinkPart | null = null;
  const toolCallById = new Map<string, ToolCallPart['tool_call']>();

  const closeText = (): void => {
    if (currentText && currentText.text.length > 0) {
      parts.push(currentText);
    }
    currentText = null;
  };
  const closeThink = (): void => {
    if (currentThink && currentThink.think.length > 0) {
      parts.push(currentThink);
    }
    currentThink = null;
  };

  for (const event of events) {
    if (event.phase === 'message_delta') {
      const chunk = extractTextChunk(event.data as MessageDeltaData | undefined);
      if (chunk) {
        /** Close the think buffer first so a reasoning→text transition
         *  flushes the THINK part BEFORE the TEXT part — preserves
         *  chronological order. */
        closeThink();
        if (!currentText) {
          currentText = { type: ContentTypes.TEXT, text: '' };
        }
        currentText.text += chunk;
      }
      continue;
    }

    if (event.phase === 'reasoning_delta') {
      const chunk = extractThinkChunk(event.data as ReasoningDeltaData | undefined);
      if (chunk) {
        /** Symmetric: close any open text buffer first. */
        closeText();
        if (!currentThink) {
          currentThink = { type: ContentTypes.THINK, think: '' };
        }
        currentThink.think += chunk;
      }
      continue;
    }

    if (event.phase === 'run_step') {
      const data = event.data as RunStepData | undefined;
      const detailType = data?.stepDetails?.type;
      if (detailType === 'tool_calls') {
        closeText();
        closeThink();
        const toolCalls = data?.stepDetails?.tool_calls ?? [];
        for (const tc of toolCalls) {
          if (typeof tc?.id !== 'string' || !tc.id || toolCallById.has(tc.id)) {
            continue;
          }
          const toolCallPart: ToolCallPart['tool_call'] = {
            id: tc.id,
            name: tc.name ?? '',
            args: stringifyArgs(tc.args),
            progress: 0.1,
            type: tc.type ?? ToolCallTypes.TOOL_CALL,
          };
          toolCallById.set(tc.id, toolCallPart);
          parts.push({
            type: ContentTypes.TOOL_CALL,
            tool_call: toolCallPart,
          });
        }
      }
      continue;
    }

    if (event.phase === 'run_step_completed') {
      const data = event.data as RunStepCompletedData | undefined;
      const tc = data?.result?.tool_call;
      if (typeof tc?.id !== 'string' || !tc.id) continue;
      const existing = toolCallById.get(tc.id);
      if (existing) {
        if (tc.name) existing.name = tc.name;
        if (typeof tc.args === 'string' || tc.args != null) {
          existing.args = stringifyArgs(tc.args);
        }
        if (tc.output != null) existing.output = tc.output;
        existing.progress = tc.progress ?? 1;
      } else {
        const toolCallPart: ToolCallPart['tool_call'] = {
          id: tc.id,
          name: tc.name ?? '',
          args: stringifyArgs(tc.args),
          output: tc.output,
          progress: tc.progress ?? 1,
          type: ToolCallTypes.TOOL_CALL,
        };
        toolCallById.set(tc.id, toolCallPart);
        parts.push({
          type: ContentTypes.TOOL_CALL,
          tool_call: toolCallPart,
        });
      }
      continue;
    }
  }

  closeText();
  closeThink();
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
