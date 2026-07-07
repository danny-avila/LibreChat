import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import type { SubagentUpdatePhase } from 'librechat-data-provider';
import type { SubagentTickerLine } from '~/utils/subagentContent';
import type { SubagentRun } from '~/store/subagents';
import { useAgentsMapContext } from '~/Providers';
import { parseToolName } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

/** Most recent ticker lines retained for the live preview. */
export const TICKER_MAX_LINES = 3;
/** Trailing-edge refresh window for the inline live preview once the ticker
 *  has enough text to fill the row. Keeps long streaming lines from
 *  repainting every token while still feeling responsive. */
export const SUBAGENT_TICKER_THROTTLE_MS = 400;
/** Below this live-buffer length we skip throttling entirely so early tokens
 *  appear immediately instead of sitting in the throttle. */
export const TICKER_PASSTHROUGH_CHARS = 120;
/** Distance from the panel scroller's bottom that still counts as "following
 *  along": inside this window new content auto-scrolls; past it we pause. */
export const PANEL_AT_BOTTOM_THRESHOLD_PX = 120;
/** Max characters shown in the inline card's finished-state result summary. */
const RESULT_SUMMARY_MAX_CHARS = 120;

type AgentsMap = NonNullable<ReturnType<typeof useAgentsMapContext>>;
type SubagentAgent = AgentsMap[keyof AgentsMap];

/**
 * Trailing-edge throttle. Forwards `value` at most once per `intervalMs` when
 * `enabled`; pass-through when disabled so the final frame lands immediately.
 * Uses refs + `useReducer` (not `useState(value)`) so a new-reference input
 * each render doesn't drive an infinite update loop.
 */
export function useThrottledValue<T>(value: T, intervalMs: number, enabled: boolean): T {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const throttledRef = useRef<T>(value);
  const latestValueRef = useRef<T>(value);
  const lastFireAtRef = useRef<number>(Number.NEGATIVE_INFINITY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  latestValueRef.current = value;

  let effectiveValue: T;
  if (!enabled) {
    effectiveValue = value;
  } else {
    const now = performance.now();
    const sinceLast = now - lastFireAtRef.current;
    if (sinceLast >= intervalMs) {
      throttledRef.current = value;
      lastFireAtRef.current = now;
      effectiveValue = value;
    } else {
      effectiveValue = throttledRef.current;
    }
  }

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    if (Object.is(throttledRef.current, latestValueRef.current)) return;
    if (timerRef.current != null) return;
    const sinceLast = performance.now() - lastFireAtRef.current;
    const delay = Math.max(0, intervalMs - sinceLast);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      forceUpdate();
    }, delay);
  }, [value, intervalMs, enabled]);

  useEffect(
    () => () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    },
    [],
  );

  return effectiveValue;
}

export function extractSubagentType(args: SubagentRun['args']): string {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args) as { subagent_type?: string };
      return parsed?.subagent_type ?? 'agent';
    } catch {
      return 'agent';
    }
  }
  const a = args as { subagent_type?: string } | undefined;
  return a?.subagent_type ?? 'agent';
}

export function extractPrompt(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  for (const key of ['prompt', 'description', 'task', 'instructions']) {
    const value = args[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

export function tryPrompt(args: string): string | undefined {
  try {
    return extractPrompt(JSON.parse(args) as Record<string, unknown>);
  } catch {
    return undefined;
  }
}

export interface SubagentRunView {
  toolCallId: string;
  running: boolean;
  cancelled: boolean;
  finished: boolean;
  hasError: boolean;
  status?: SubagentUpdatePhase;
  subagentType: string;
  isSelfSpawn: boolean;
  subagentAgent?: SubagentAgent;
  subagentAgentId?: string;
  contentParts: TMessageContentParts[];
  prompt?: string;
  tickerLines: SubagentTickerLine[];
  output?: string | null;
  attachments?: TAttachment[];
  initialProgress: number;
}

/**
 * Single source of truth for a subagent run's derived UI state, shared by the
 * inline card and the right-side panel. Merges the static per-run registry
 * ({@link SubagentRun}) with the live progress atom and the parent's submit
 * state. The card passes `runOverride` (its own props, before the registry
 * write lands); the panel omits it and reads the registry by id.
 */
export function useSubagentRunView(
  toolCallId: string,
  runOverride?: SubagentRun,
  isSubmittingOverride?: boolean,
): SubagentRunView {
  const registered = useRecoilValue(store.subagentRunByIdSelector(toolCallId));
  const run = runOverride ?? registered;
  const progress = useRecoilValue(store.subagentProgressByToolCallId(toolCallId));
  /** The inline card passes its own `isSubmitting` prop (the message's stream
   *  state); the panel, rendered outside the message tree, omits it and falls
   *  back to the conversation's global submit atom. */
  const familyIsSubmitting = useRecoilValue(store.isSubmittingFamily(0));
  const isSubmitting = isSubmittingOverride ?? familyIsSubmitting;
  const agentsMap = useAgentsMapContext();

  const initialProgress = run?.initialProgress ?? 0;
  const hasError = progress?.status === 'error';
  const finished = initialProgress >= 1 || progress?.status === 'stop' || hasError;
  const cancelled = !isSubmitting && !finished;
  const running = !finished && !cancelled;

  const subagentType = progress?.subagentType ?? extractSubagentType(run?.args);
  const isSelfSpawn = subagentType === 'self';
  const subagentAgentId = progress?.subagentAgentId;
  const subagentAgent = subagentAgentId ? agentsMap?.[subagentAgentId] : undefined;

  const liveParts = progress?.contentParts as TMessageContentParts[] | undefined;
  const persisted = run?.persistedContent;
  const contentParts = useMemo<TMessageContentParts[]>(() => {
    if (persisted && persisted.length > 0) return persisted;
    if (liveParts && liveParts.length > 0) return liveParts;
    return [];
  }, [persisted, liveParts]);

  const tickerLines = useMemo<SubagentTickerLine[]>(() => {
    const lines = progress?.tickerState?.lines ?? [];
    return lines.slice(-TICKER_MAX_LINES);
  }, [progress?.tickerState?.lines]);

  const args = run?.args;
  const prompt = useMemo(
    () => (typeof args === 'string' ? tryPrompt(args) : extractPrompt(args)),
    [args],
  );

  return {
    toolCallId,
    running,
    cancelled,
    finished,
    hasError,
    status: progress?.status,
    subagentType,
    isSelfSpawn,
    subagentAgent,
    subagentAgentId,
    contentParts,
    prompt,
    tickerLines,
    output: run?.output,
    attachments: run?.attachments,
    initialProgress,
  };
}

/**
 * One-line at-rest summary for the finished inline card: the trailing text
 * part's opening sentence, else a "Used N tools" fallback. More useful than a
 * frozen last-activity line once the run is done.
 */
export function subagentResultSummary(
  contentParts: TMessageContentParts[],
  localize: ReturnType<typeof useLocalize>,
): string {
  for (let i = contentParts.length - 1; i >= 0; i--) {
    const part = contentParts[i];
    if (part.type === ContentTypes.TEXT) {
      const text = (part as { text?: string }).text?.replace(/\s+/g, ' ').trim();
      if (text) {
        return text.length > RESULT_SUMMARY_MAX_CHARS
          ? `${text.slice(0, RESULT_SUMMARY_MAX_CHARS).trimEnd()}…`
          : text;
      }
    }
  }
  const toolCount = contentParts.filter((p) => p.type === ContentTypes.TOOL_CALL).length;
  if (toolCount > 0) {
    return localize('com_ui_used_n_tools', { 0: String(toolCount) });
  }
  return '';
}

/** Stable key for a ticker line so React reuses the DOM node across in-place
 *  updates to the same live line. */
export function tickerLineKey(line: SubagentTickerLine): string {
  switch (line.kind) {
    case 'writing':
    case 'reasoning':
      return line.kind;
    case 'using_tool':
      return `using:${line.toolNames.join(',')}`;
    case 'tool_complete':
      return `done:${line.toolName}`;
    case 'error':
      return `error:${line.message ?? ''}`;
  }
}

/** Inline code-style tool-name badge for ticker lines. */
function ToolNameBadge({ name }: { name: string }): JSX.Element {
  return (
    <code className="shrink-0 rounded bg-surface-tertiary px-1 text-text-primary">{name}</code>
  );
}

/** Renders one tool id: MCP tools split into `<server> · <code>tool</code>`,
 *  native tools resolve their friendly name, unknown ids fall back to a code
 *  badge. */
function ToolIdentifier({
  rawName,
  localize,
}: {
  rawName: string;
  localize: ReturnType<typeof useLocalize>;
}): JSX.Element {
  const parsed = parseToolName(rawName);
  if (parsed.mcpServer) {
    return (
      <span className="inline-flex min-w-0 shrink items-baseline gap-1">
        <span className="truncate">{parsed.mcpServer}</span>
        <span className="shrink-0 text-text-tertiary">·</span>
        <ToolNameBadge name={parsed.toolName} />
      </span>
    );
  }
  if (parsed.friendlyKey) {
    return <span className="truncate">{localize(parsed.friendlyKey)}</span>;
  }
  return <ToolNameBadge name={parsed.toolName} />;
}

/**
 * Renders one ticker line as a single truncating row (no `dir="rtl"` tail
 * trick — standard LTR truncation reads more predictably in the compact card).
 * Tool lines route through {@link ToolIdentifier} for MCP/native-friendly
 * naming, matching the main tool UI.
 */
export function TickerLineView({ line }: { line: SubagentTickerLine }): JSX.Element {
  const localize = useLocalize();
  if (line.kind === 'writing' || line.kind === 'reasoning') {
    const prefix =
      line.kind === 'writing'
        ? localize('com_ui_subagent_ticker_writing')
        : localize('com_ui_subagent_ticker_reasoning');
    return (
      <span className="flex w-full items-baseline gap-1 overflow-hidden text-text-secondary">
        <span className="shrink-0">{prefix}:</span>
        <span className="min-w-0 flex-1 truncate">{line.body}</span>
      </span>
    );
  }
  if (line.kind === 'using_tool') {
    const prefix = localize('com_ui_subagent_ticker_using');
    return (
      <span className="flex w-full items-baseline gap-1 overflow-hidden whitespace-nowrap text-text-secondary">
        <span className="shrink-0">{prefix}</span>
        <span className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden">
          {line.toolNames.map((name, i) => (
            <span key={`${i}-${name}`} className="flex min-w-0 items-baseline gap-1">
              {i > 0 && <span className="shrink-0 text-text-tertiary">,</span>}
              <ToolIdentifier rawName={name} localize={localize} />
            </span>
          ))}
          {line.argsSnippet && (
            <span className="min-w-0 truncate text-text-tertiary">({line.argsSnippet})</span>
          )}
        </span>
      </span>
    );
  }
  if (line.kind === 'tool_complete') {
    return (
      <span className="flex w-full items-baseline gap-1 overflow-hidden whitespace-nowrap text-text-secondary">
        <ToolIdentifier rawName={line.toolName} localize={localize} />
        <span className="shrink-0 text-text-tertiary">→</span>
        <span className="min-w-0 flex-1 truncate">
          {line.outputSnippet ?? localize('com_ui_subagent_ticker_tool_done')}
        </span>
      </span>
    );
  }
  const errorPrefix = localize('com_ui_subagent_ticker_error');
  return (
    <span className="flex w-full items-baseline gap-1 overflow-hidden text-text-warning">
      <span className="shrink-0">{errorPrefix}:</span>
      <span className="min-w-0 flex-1 truncate">{line.message ?? ''}</span>
    </span>
  );
}
