import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { ArrowDown, ChevronRight, Users } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogDescription } from '@librechat/client';
import { ContentTypes, EModelEndpoint } from 'librechat-data-provider';
import type { TAttachment, TMessage, TMessageContentParts } from 'librechat-data-provider';
import ToolCall from '~/components/Chat/Messages/Content/ToolCall';
import ToolCallGroup from '~/components/Chat/Messages/Content/ToolCallGroup';
import Container from '~/components/Chat/Messages/Content/Container';
import type { PartWithIndex } from '~/components/Chat/Messages/Content/ParallelContent';
import MessageIcon from '~/components/Share/MessageIcon';
import { useAgentsMapContext } from '~/Providers';
import Text from './Text';
import Reasoning from './Reasoning';
import { AttachmentGroup } from './Attachment';
import { MessageContext } from '~/Providers/MessageContext';
import { useLocalize } from '~/hooks';
import { subagentProgressByToolCallId } from '~/store';
import type { SubagentTickerLine } from '~/utils/subagentContent';
import { cn, groupSequentialToolCalls, parseToolName } from '~/utils';

interface SubagentCallProps {
  toolCallId: string;
  initialProgress: number;
  /** True while the parent run is still streaming. Used — along with the
   *  tool_call's `progress` and any terminal subagent envelope — to decide
   *  whether the subagent is `running`, `cancelled`, or `finished`. */
  isSubmitting?: boolean;
  args?: string | Record<string, unknown>;
  output?: string | null;
  attachments?: TAttachment[];
  /** Aggregated content parts the backend attached to the tool_call at
   *  message-save time. Takes precedence over the in-memory Recoil atom
   *  so a page refresh shows the same history the user saw live. Older
   *  runs recorded before the persistence path landed will not have this
   *  field; those fall back to the atom (or the raw `output` string). */
  persistedContent?: TMessageContentParts[];
}

const TICKER_MAX_LINES = 3;
/** Trailing-edge throttle window for the live preview. Tuned down from
 *  the original 1.2s so the ticker feels snappy when the container is
 *  already full and frames are scrolling. */
const TICKER_THROTTLE_MS = 800;
/** Below this live-buffer length we skip throttling entirely. Without
 *  this the user would see "Reasoning: I" for ~1s while the model
 *  streams the rest of the sentence — the pass-through lets early
 *  tokens appear right away, and throttling only kicks in once the
 *  preview is long enough to "fill the container". */
const TICKER_PASSTHROUGH_CHARS = 120;
/** Distance from the dialog scroller's bottom that still counts as
 *  "following along". Inside this window new content auto-scrolls; past
 *  it we pause so the user can read. Slightly looser than the main
 *  messages view since the dialog is a smaller scroller. */
const DIALOG_AT_BOTTOM_THRESHOLD_PX = 120;

/**
 * Trailing-edge throttle. Forwards `value` at most once per `intervalMs`
 * when `enabled` is true; pass-through when false so the final frame
 * lands without waiting out the interval.
 *
 * Uses refs + `useReducer` for the re-render trigger instead of
 * `useState(value)`: storing the throttled value as state would drive
 * an infinite update loop whenever the upstream `value` is a new
 * reference each render (e.g. a `useMemo` whose deps are stable by
 * content but not by identity), because `setState` with a new-reference
 * input always schedules another render.
 */
function useThrottledValue<T>(value: T, intervalMs: number, enabled: boolean): T {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const throttledRef = useRef<T>(value);
  const latestValueRef = useRef<T>(value);
  /** Negative-infinity sentinel so the very first render always falls
   *  through the "past the window" branch and the caller sees the
   *  initial value synchronously — no dead 1.2s while the first frame
   *  sits in the throttle. */
  const lastFireAtRef = useRef<number>(Number.NEGATIVE_INFINITY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  latestValueRef.current = value;

  /** Clean up any pending timer on unmount. */
  useEffect(
    () => () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    },
    [],
  );

  if (!enabled) {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return value;
  }

  const now = performance.now();
  const sinceLast = now - lastFireAtRef.current;

  /** Past the throttle window — commit the latest value synchronously
   *  (via refs, so no render cascade) and return it. */
  if (sinceLast >= intervalMs) {
    throttledRef.current = value;
    lastFireAtRef.current = now;
    return value;
  }

  /** Inside the throttle window — hold the previous frame and schedule
   *  a trailing-edge fire if nothing is queued yet. `forceUpdate` kicks
   *  a re-render when the timer lands; that render's `sinceLast` check
   *  will then commit the latest `latestValueRef.current`. */
  if (timerRef.current == null) {
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      forceUpdate();
    }, intervalMs - sinceLast);
  }

  return throttledRef.current;
}

/**
 * Renders the parent's `subagent` tool call as a compact "what the child is
 * doing right now" ticker. The collapsed view shows short, user-readable
 * status lines — streaming text/reasoning previews plus tool-call lifecycle
 * markers — built from the `SubagentUpdateEvent` stream. Clicking opens a
 * dialog that renders the child's aggregated content parts through the same
 * `<Part />` pipeline the main conversation uses, so tool calls, reasoning
 * blocks, and the final response all look like a regular assistant message.
 *
 * Progress is sourced from the `subagentProgressByToolCallId` Recoil atom
 * family, populated by `useStepHandler` as `ON_SUBAGENT_UPDATE` SSE
 * envelopes arrive. The atom is keyed by the parent's `tool_call_id`.
 */
export default function SubagentCall({
  toolCallId,
  initialProgress,
  isSubmitting = false,
  args,
  output,
  attachments,
  persistedContent,
}: SubagentCallProps) {
  const localize = useLocalize();
  const progress = useRecoilValue(subagentProgressByToolCallId(toolCallId));
  const agentsMap = useAgentsMapContext();
  const [open, setOpen] = useState(false);

  const subagentType = progress?.subagentType ?? extractSubagentType(args);
  const isSelfSpawn = subagentType === 'self';
  /** Avatar lookup for the header icon. We use the child's agent id when
   *  present (explicit subagents); self-spawn falls back to the agents
   *  map being unavailable → the Users SVG. The tool UI has a similar
   *  icon-left-of-label pattern; this reuses `MessageIcon` so the agent's
   *  configured avatar lands here without a separate image pipeline. */
  const subagentAgentId = progress?.subagentAgentId;
  const subagentAgent = subagentAgentId ? agentsMap?.[subagentAgentId] : undefined;
  /**
   * Tri-state status resolution, aligned with `ToolCall.tsx`:
   *
   * - `finished`: the tool_call's own progress reached 1 (backend wrote a
   *   result) OR the subagent explicitly emitted a `stop` / `error` phase.
   * - `cancelled`: the stream has ended (`!isSubmitting`) before either
   *   condition was met — e.g. user stop, dropped connection, backend
   *   crash. Without this check, an interrupted run would render as
   *   permanently "working…".
   * - `running`: the parent is still streaming and no terminal signal has
   *   arrived yet.
   */
  const hasError = progress?.status === 'error';
  const finished = initialProgress >= 1 || progress?.status === 'stop' || hasError;
  const cancelled = !isSubmitting && !finished;
  const running = !finished && !cancelled;

  /**
   * Content parts for the dialog. Live state is incrementally aggregated
   * in the Recoil atom by `foldSubagentEvent` as each envelope arrives,
   * so the full child history is always available — no re-aggregation
   * at render time, and tool_call records can't be lost to the ticker's
   * event trim window. Persisted `subagent_content` (written by the
   * backend at message-save time) is the fallback for older runs
   * recorded before the incremental path landed and for rehydrated
   * messages after a page refresh.
   */
  const liveParts = progress?.contentParts as TMessageContentParts[] | undefined;
  const contentParts = useMemo<TMessageContentParts[]>(() => {
    if (liveParts && liveParts.length > 0) return liveParts;
    if (persistedContent && persistedContent.length > 0) return persistedContent;
    return [];
  }, [liveParts, persistedContent]);

  /** Last `TICKER_MAX_LINES` lines from the atom's incrementally-built
   *  ticker state, so history isn't lost to any event trimming. */
  const tickerLines = useMemo<SubagentTickerLine[]>(() => {
    const lines = progress?.tickerState?.lines ?? [];
    return lines.slice(-TICKER_MAX_LINES);
  }, [progress?.tickerState?.lines]);

  /** Only throttle once the running buffer is wide enough to "fill the
   *  container" — pre-threshold updates pass through so the user sees
   *  early tokens immediately, not a static "Reasoning: I" while more
   *  text piles up behind the throttle. */
  const shouldThrottleTicker = useMemo(() => {
    if (!running) return false;
    const liveBody = tickerLines.reduce((max, line) => {
      if (line.kind === 'writing' || line.kind === 'reasoning') {
        return Math.max(max, line.body.length);
      }
      return max;
    }, 0);
    return liveBody >= TICKER_PASSTHROUGH_CHARS;
  }, [running, tickerLines]);

  const displayedTickerLines = useThrottledValue(
    tickerLines,
    TICKER_THROTTLE_MS,
    shouldThrottleTicker,
  );

  const description = typeof args === 'string' ? tryDescription(args) : extractDescription(args);

  /** Base verb-only label ("Running agent" / "Ran agent"). The agent name
   *  is rendered separately as a muted sub-label so "agent" stays a
   *  constant visual anchor regardless of name length. */
  const headerText = hasError
    ? localize('com_ui_subagent_errored')
    : cancelled
      ? localize('com_ui_subagent_cancelled')
      : running
        ? localize('com_ui_subagent_running')
        : localize('com_ui_subagent_complete');
  /** Muted sub-label shown to the right of the base label: the
   *  configured agent name for named subagents. Self-spawns omit it
   *  (redundant — the header already says "agent") as do cases where
   *  the name isn't resolvable (agent map miss). */
  const subagentNameLabel = !isSelfSpawn && subagentAgent?.name ? subagentAgent.name : '';

  /**
   * Minimal `MessageContext` for the dialog's `<Part />` tree. Subagent
   * content rendering needs the same context the main conversation uses
   * (reasoning expand state, latest-message cursor, etc.) — synthesizing
   * a scoped context lets us reuse the real part renderers without
   * pulling the full `ChatView` / `MessagesView` tree into the dialog.
   */
  const dialogMessageContext = useMemo(
    () => ({
      messageId: `subagent-${toolCallId}`,
      isExpanded: true,
      isSubmitting: running,
      isLatestMessage: running,
      conversationId: null,
    }),
    [toolCallId, running],
  );

  const lastPartIndex = contentParts.length - 1;

  /**
   * Dialog renderer used by {@link ToolCallGroup} (for grouped tool_call
   * batches) and by the per-part map (for single parts). Mirrors the
   * main `<Part />` dispatch table but stays scoped to the three types
   * a subagent run emits — avoiding the import cycle that would come
   * from routing through `Parts/index`.
   */
  const renderDialogPart = useCallback(
    (part: TMessageContentParts, idx: number, isLastPart: boolean): JSX.Element | null => {
      return (
        <SubagentDialogPart
          key={`${toolCallId}-part-${idx}`}
          part={part}
          isSubmitting={running}
          showCursor={running && isLastPart}
          isLast={isLastPart}
        />
      );
    },
    [toolCallId, running],
  );

  /**
   * Apply the same consecutive-tool-call batching the main `ContentParts`
   * uses so the dialog renders with visual parity: grouped tools collapse
   * into a single `Used N tools` header, single parts wrap in `Container`
   * for the same `gap-3` flex column spacing the main conversation has.
   */
  const groupedParts = useMemo(() => {
    const withIdx: PartWithIndex[] = contentParts.map((part, idx) => ({ part, idx }));
    return groupSequentialToolCalls(withIdx);
  }, [contentParts]);

  /**
   * Auto-scroll the dialog's content area as new parts / delta chunks
   * stream in. Same pattern as `MessagesView` but with a dialog-tuned
   * threshold — the user can scroll up to read back without auto-scroll
   * snatching control. Explicit "jump to bottom" button lets them resume
   * following along without having to scroll all the way down.
   */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /** React `onScroll` prop instead of manual `addEventListener` so the
   *  handler attaches as part of DOM commit — no race with Radix's
   *  portal-mount timing that would leave `scrollRef.current` null when
   *  the effect runs and silently skip the listener. */
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distance <= DIALOG_AT_BOTTOM_THRESHOLD_PX);
  }, []);

  /** Snap to bottom every time the dialog opens so a freshly-opened
   *  dialog starts parked on the live cursor. */
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setIsAtBottom(true);
  }, [open]);

  /** Keep the view pinned to the bottom while the user is at/near it —
   *  including during delta streams that grow the last TEXT/THINK part
   *  without changing `contentParts.length`. A `ResizeObserver` on the
   *  inner content div catches every height change, whether structural
   *  (new tool call) or incremental (writing text grows in-place), so
   *  auto-scroll doesn't desync just because tokens are piling into an
   *  existing part. */
  useEffect(() => {
    if (!open) return;
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!isAtBottom) return;
      scrollEl.scrollTop = scrollEl.scrollHeight;
    });
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [open, isAtBottom]);

  const scrollDialogToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setIsAtBottom(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group my-1.5 flex w-full flex-col gap-1 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-left transition hover:bg-surface-tertiary',
          running && 'animate-pulse-slow',
        )}
        aria-label={headerText}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <div
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full',
              running && !subagentAgent && 'animate-pulse text-primary',
            )}
            aria-hidden="true"
          >
            {subagentAgent ? (
              <MessageIcon
                message={
                  {
                    endpoint: EModelEndpoint.agents,
                    isCreatedByUser: false,
                  } as TMessage
                }
                agent={subagentAgent}
              />
            ) : (
              <Users size={14} />
            )}
          </div>
          <span className="shrink-0">{headerText}</span>
          {subagentNameLabel ? (
            <span
              className="min-w-0 flex-1 truncate font-normal text-text-secondary"
              title={subagentNameLabel}
            >
              {subagentNameLabel}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <ChevronRight
            size={14}
            className="shrink-0 text-text-secondary transition group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>

        <ul className="w-full space-y-0.5 pl-5 font-mono text-xs text-text-secondary">
          {displayedTickerLines.length === 0 && running ? (
            <li className="truncate opacity-70">{localize('com_ui_subagent_waiting')}</li>
          ) : null}
          {displayedTickerLines.map((line, i) => (
            <TickerLineView key={`${i}-${tickerLineKey(line)}`} line={line} />
          ))}
        </ul>
      </button>

      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogContent
          className={cn(
            'max-h-[85vh] overflow-hidden',
            /** Responsive width: narrow on phones, scales up to ~80rem on
             *  widescreens. Viewport-relative max keeps margin on the
             *  edges while still using real estate on laptops / large
             *  displays — noticeably wider than the default dialog. */
            'w-[min(96vw,80rem)] max-w-[min(96vw,80rem)]',
          )}
        >
          <OGDialogTitle>
            {isSelfSpawn
              ? localize('com_ui_subagent_dialog_title_self')
              : localize('com_ui_subagent_dialog_title', { 0: subagentType })}
          </OGDialogTitle>
          <OGDialogDescription className="text-sm text-text-secondary">
            {description || localize('com_ui_subagent_dialog_description')}
          </OGDialogDescription>

          <div className="relative mt-3">
            {!isAtBottom && (
              <button
                type="button"
                onClick={scrollDialogToBottom}
                aria-label={localize('com_ui_subagent_scroll_to_bottom')}
                className="absolute bottom-3 right-6 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border-light bg-surface-secondary text-text-secondary shadow-md transition hover:bg-surface-tertiary hover:text-text-primary"
              >
                <ArrowDown size={16} aria-hidden="true" />
              </button>
            )}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              /** Mirrors the main conversation's content-parts wrapper
               *  (`max-w-full flex-grow flex-col gap-0` from
               *  `MessageParts.tsx`). Part-specific wrappers (`Container`
               *  on TEXT, the Reasoning component's own wrapper on THINK,
               *  `ToolCallGroup` margins on grouped tools) handle their
               *  own spacing — we don't re-wrap everything in `Container`
               *  because that would constrain Reasoning's full-column
               *  width the way it has in regular messages.
               *  Outer `px-4 py-3` gives the dialog breathing room. */
              className="max-h-[65vh] overflow-y-auto px-4 py-3"
            >
              <div ref={contentRef} className="flex max-w-full flex-grow flex-col gap-0">
                {contentParts.length > 0 ? (
                  <MessageContext.Provider value={dialogMessageContext}>
                    {groupedParts.map((group) => {
                      if (group.type === 'single') {
                        const { part, idx } = group.part;
                        /** Per-type dispatch handles wrapping: TEXT goes
                         *  through `Container`, THINK/TOOL_CALL render
                         *  directly so their own wrappers set the width
                         *  and spacing. */
                        return renderDialogPart(part, idx, idx === lastPartIndex);
                      }
                      /** Consecutive tool_calls (2+) collapse into a
                       *  `Used N tools` group — same behavior as the main
                       *  message view. */
                      return (
                        <ToolCallGroup
                          key={`${toolCallId}-group-${group.parts[0].idx}`}
                          parts={group.parts}
                          isSubmitting={running}
                          isLast={group.parts.some((p) => p.idx === lastPartIndex)}
                          renderPart={renderDialogPart}
                          lastContentIdx={lastPartIndex}
                        />
                      );
                    })}
                  </MessageContext.Provider>
                ) : output ? (
                  /** Fallback: no aggregated content parts but the backend
                   *  wrote a final tool_call output. Happens for older
                   *  subagent runs recorded before the event forwarder
                   *  existed. Route through the same leaf renderer so
                   *  markdown renders properly. */
                  <MessageContext.Provider value={dialogMessageContext}>
                    <SubagentDialogPart
                      part={
                        {
                          type: ContentTypes.TEXT,
                          text: output,
                        } as unknown as TMessageContentParts
                      }
                      isSubmitting={false}
                      showCursor={false}
                      isLast
                    />
                  </MessageContext.Provider>
                ) : (
                  <div className="text-sm italic text-text-secondary">
                    {running
                      ? localize('com_ui_subagent_no_result_yet')
                      : localize('com_ui_subagent_empty_result')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>

      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}

function extractSubagentType(args: SubagentCallProps['args']): string {
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

function extractDescription(args: Record<string, unknown> | undefined): string | undefined {
  const d = args?.description;
  return typeof d === 'string' && d.length > 0 ? d : undefined;
}

function tryDescription(args: string): string | undefined {
  try {
    const parsed = JSON.parse(args) as { description?: string };
    return typeof parsed?.description === 'string' ? parsed.description : undefined;
  } catch {
    return undefined;
  }
}

/** Stable key for a ticker line — helps React reuse the DOM node across
 *  in-place updates to the same live `writing` / `reasoning` line, and
 *  gives tool-call lines a stable identity by tool name. */
function tickerLineKey(line: SubagentTickerLine): string {
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

/** Inline code-style tool-name badge. Matches the monospace styling of
 *  the ticker itself but with a subtle background so the tool identifier
 *  reads as a "code" token rather than plain prose. */
function ToolNameBadge({ name }: { name: string }): JSX.Element {
  return (
    <code className="shrink-0 rounded bg-surface-tertiary px-1 text-text-primary">{name}</code>
  );
}

/** Render a single tool id as a compact JSX fragment: MCP tools split
 *  into `<server> · <code>toolName</code>`, native tools resolve their
 *  friendly name via `FRIENDLY_NAME_KEYS`, unknown ids fall back to a
 *  bare code badge of the raw name. */
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
 * Renderer for one ticker line. Splits a fixed label (e.g. "Writing:")
 * into its own `shrink-0` span so the label is never clipped when the
 * body overflows; the body then uses `dir="rtl"` + `text-align: left`
 * to push tail-side ellipsis behavior (newest characters stay flush-
 * right, oldest clip off the left). The rtl trick is scoped to the
 * body span so trailing punctuation on non-streaming lines (e.g. the
 * `…` in "Waiting for first update…") can't get flipped by bidi.
 *
 * Tool lines (`using_tool`, `tool_complete`) go through `ToolIdentifier`
 * so MCP-hosted tools render as `<server> · <tool>` badges and native
 * tools use their friendly names — matching the delimiter-aware
 * rendering the main tool UI already uses.
 */
function TickerLineView({ line }: { line: SubagentTickerLine }): JSX.Element {
  const localize = useLocalize();
  if (line.kind === 'writing' || line.kind === 'reasoning') {
    const prefix =
      line.kind === 'writing'
        ? localize('com_ui_subagent_ticker_writing')
        : localize('com_ui_subagent_ticker_reasoning');
    return (
      <li className="flex w-full items-baseline gap-1 overflow-hidden text-text-primary">
        <span className="shrink-0">{prefix}:</span>
        <span
          dir="rtl"
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left"
        >
          {line.body}
        </span>
      </li>
    );
  }
  if (line.kind === 'using_tool') {
    const prefix = localize('com_ui_subagent_ticker_using');
    return (
      <li className="flex w-full items-baseline gap-1 overflow-hidden whitespace-nowrap">
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
      </li>
    );
  }
  if (line.kind === 'tool_complete') {
    return (
      <li className="flex w-full items-baseline gap-1 overflow-hidden whitespace-nowrap">
        <ToolIdentifier rawName={line.toolName} localize={localize} />
        <span className="shrink-0 text-text-tertiary">→</span>
        <span
          dir="rtl"
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left"
        >
          {line.outputSnippet ?? localize('com_ui_subagent_ticker_tool_done')}
        </span>
      </li>
    );
  }
  /* error */
  const errorPrefix = localize('com_ui_subagent_ticker_error');
  return (
    <li className="flex w-full items-baseline gap-1 overflow-hidden text-text-warning">
      <span className="shrink-0">{errorPrefix}:</span>
      <span className="min-w-0 flex-1 truncate">{line.message ?? ''}</span>
    </li>
  );
}

/**
 * Per-part renderer for the dialog. Mirrors the wrapper choices `<Part>`
 * makes in regular messages so subagent content matches the visual width
 * and spacing the user already knows: TEXT wraps in `Container` (which
 * provides `gap-3` column spacing and the `mt-5` sibling margin), while
 * THINK and TOOL_CALL render bare — their own wrappers (`Reasoning`'s
 * `mb-2 pb-2 pt-2` box, `ToolCall`'s own margins) control their layout
 * and full-column width. Staying inline (vs. calling `<Part>`) avoids
 * the `Parts/index.ts → SubagentCall → Part` import cycle and keeps us
 * from accidentally rendering a nested subagent dialog.
 */
function SubagentDialogPart({
  part,
  isSubmitting,
  showCursor,
  isLast,
}: {
  part: TMessageContentParts;
  isSubmitting: boolean;
  showCursor: boolean;
  isLast: boolean;
}): JSX.Element | null {
  if (part.type === ContentTypes.TEXT) {
    const text = (part as { text: string }).text;
    return (
      <Container>
        <Text text={text} showCursor={showCursor} isCreatedByUser={false} />
      </Container>
    );
  }
  if (part.type === ContentTypes.THINK) {
    const think = (part as { think: string }).think;
    return <Reasoning reasoning={think} isLast={isLast} />;
  }
  if (part.type === ContentTypes.TOOL_CALL) {
    const tc = (
      part as {
        [ContentTypes.TOOL_CALL]?: {
          args?: string | Record<string, unknown>;
          output?: string;
          name?: string;
          progress?: number;
        };
      }
    )[ContentTypes.TOOL_CALL];
    if (!tc) return null;
    return (
      <ToolCall
        args={tc.args ?? ''}
        output={tc.output ?? ''}
        initialProgress={tc.progress ?? 0.1}
        isSubmitting={isSubmitting}
        isLast={isLast}
        name={tc.name ?? ''}
      />
    );
  }
  return null;
}
