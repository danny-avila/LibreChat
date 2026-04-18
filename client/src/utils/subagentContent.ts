import { ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { SubagentUpdateEvent, TMessageContentParts } from 'librechat-data-provider';

/**
 * Pure-function helpers that turn a running `SubagentUpdateEvent[]` stream
 * into the structures the UI renders:
 *
 *   - `aggregateSubagentContent` — a `TMessageContentParts[]` array the
 *     SubagentCall dialog feeds into `<Part />` so the child's output
 *     renders exactly like a regular assistant message (text + reasoning
 *     + tool calls).
 *
 *   - `buildSubagentTickerLines` — short, user-readable status lines for
 *     the collapsed ticker. Aggregates message/reasoning deltas into
 *     running previews, surfaces tool-call lifecycle discretely, and
 *     drops low-signal events (start, stop, run_step_delta).
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
  id?: string;
  delta?: {
    content?: Array<{ type?: string; text?: string }>;
  };
};

type ReasoningDeltaData = {
  id?: string;
  delta?: {
    content?: Array<{ type?: string; think?: string }>;
  };
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

const stringifyArgs = (args: unknown): string =>
  typeof args === 'string' ? args : JSON.stringify(args ?? {});

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

/**
 * Walk the event stream and rebuild the child's content array. Adjacent
 * `message_delta` / `reasoning_delta` events concatenate into a single
 * TEXT / THINK part. Tool calls become TOOL_CALL parts and `run_step`
 * boundaries close out the running text/think buffers so tool calls and
 * later text don't get merged into one blob.
 */
export function aggregateSubagentContent(events: SubagentUpdateEvent[]): TMessageContentParts[] {
  const parts: TMessageContentParts[] = [];
  let currentText: TextPart | null = null;
  let currentThink: ThinkPart | null = null;
  const toolCallById = new Map<string, ToolCallPart['tool_call']>();

  const closeText = (): void => {
    if (currentText && currentText.text.length > 0) {
      parts.push(currentText as unknown as TMessageContentParts);
    }
    currentText = null;
  };
  const closeThink = (): void => {
    if (currentThink && currentThink.think.length > 0) {
      parts.push(currentThink as unknown as TMessageContentParts);
    }
    currentThink = null;
  };

  for (const event of events) {
    if (event.phase === 'message_delta') {
      const chunk = extractTextChunk(event.data as MessageDeltaData | undefined);
      if (chunk) {
        /** Close the think buffer first so a reasoning→text transition
         *  flushes the THINK part BEFORE the TEXT part — preserves the
         *  chronological order the user actually observed. Without this
         *  both buffers grow in parallel and the fixed flush order at the
         *  next step boundary can swap them (text-before-think, etc.). */
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
        /** Symmetric: a text→reasoning transition flushes the TEXT part
         *  first so the subsequent THINK part appears after it in order. */
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
            [ContentTypes.TOOL_CALL]: toolCallPart,
          } as unknown as TMessageContentParts);
        }
      }
      /** `message_creation` just marks a new AI turn — the following
       *  `message_delta` events will populate `currentText`, no extra
       *  work needed. */
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
          [ContentTypes.TOOL_CALL]: toolCallPart,
        } as unknown as TMessageContentParts);
      }
      continue;
    }

    /** start / stop / error / run_step_delta phases don't aggregate into
     *  the content array; the ticker handles those separately. */
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
      /** A new run step closes any in-flight text/reasoning streaks —
       *  subsequent deltas will start fresh lines, and the just-finished
       *  preview becomes a fixed entry in the scrollback. */
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
          /** For a single call we can show `Using name(args)`; for
           *  parallel calls, drop args to keep the line short — users
           *  can open the dialog to see the full payload. */
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

    /** start / stop / run_step_delta suppressed. */
  }

  return lines;
}
