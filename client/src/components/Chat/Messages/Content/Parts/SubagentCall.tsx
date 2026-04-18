import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronRight, Users } from 'lucide-react';
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
import { buildSubagentTickerLines } from '~/utils/subagentContent';
import { cn, groupSequentialToolCalls } from '~/utils';

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

  const events = progress?.events;

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

  /** Semantic status lines for the ticker. Message/reasoning deltas collapse
   *  into a single running preview; tool calls are discrete entries with
   *  input/output snippets. No event names are shown to the user. */
  const tickerLines = useMemo(() => {
    const lines = buildSubagentTickerLines(events ?? [], {
      writingPrefix: localize('com_ui_subagent_ticker_writing'),
      reasoningPrefix: localize('com_ui_subagent_ticker_reasoning'),
      errorPrefix: localize('com_ui_subagent_ticker_error'),
      formatUsingTool: (names, snippet) =>
        snippet
          ? localize('com_ui_subagent_ticker_using_with_args', {
              0: names,
              1: snippet,
            })
          : localize('com_ui_subagent_ticker_using', { 0: names }),
      formatToolComplete: (name, snippet) =>
        snippet
          ? localize('com_ui_subagent_ticker_tool_output', {
              0: name,
              1: snippet,
            })
          : localize('com_ui_subagent_ticker_tool_complete', { 0: name }),
    });
    if (lines.length === 0 && running) {
      return [{ text: localize('com_ui_subagent_waiting') }];
    }
    return lines.slice(-TICKER_MAX_LINES);
  }, [events, running, localize]);

  const description = typeof args === 'string' ? tryDescription(args) : extractDescription(args);

  /** Self-spawned runs get a name-free label ('Running subtask') because
   *  the type token is the string 'self' — rendering `Running "self" agent`
   *  reads poorly. Named subagents use the `{{type}}` label verbatim. */
  const headerText = hasError
    ? isSelfSpawn
      ? localize('com_ui_subagent_errored_self')
      : localize('com_ui_subagent_errored', { 0: subagentType })
    : cancelled
      ? isSelfSpawn
        ? localize('com_ui_subagent_cancelled_self')
        : localize('com_ui_subagent_cancelled', { 0: subagentType })
      : running
        ? isSelfSpawn
          ? localize('com_ui_subagent_running_self')
          : localize('com_ui_subagent_running', { 0: subagentType })
        : isSelfSpawn
          ? localize('com_ui_subagent_complete_self')
          : localize('com_ui_subagent_complete', { 0: subagentType });

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
   * Auto-scroll the dialog's content area to the bottom as new parts / delta
   * chunks stream in, mirroring `MessagesView`'s behavior. We only scroll
   * while the subagent is running and the dialog is open so the user isn't
   * yanked to the bottom when re-reading a completed run. `contentParts.length`
   * is a cheap trigger that fires on every structural change; the running
   * text's own char-by-char growth is handled by a `progress.events.length`
   * trigger so the scroll stays pinned to the live cursor.
   */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const eventCount = events?.length ?? 0;
  useEffect(() => {
    if (!open || !running) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, running, contentParts.length, eventCount]);

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
          <span className="flex-1 truncate">{headerText}</span>
          <ChevronRight
            size={14}
            className="shrink-0 text-text-secondary transition group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>

        <ul className="space-y-0.5 pl-5 font-mono text-xs text-text-secondary">
          {tickerLines.map((line, i) => (
            <li
              key={`${i}-${line.text}`}
              className={cn('truncate', line.live && 'text-text-primary')}
            >
              {line.text}
            </li>
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

          <div
            ref={scrollRef}
            /** Mirrors the main conversation's content-parts wrapper
             *  (`max-w-full flex-grow flex-col gap-0` from
             *  `MessageParts.tsx`). Part-specific wrappers (`Container`
             *  on TEXT, the Reasoning component's own wrapper on THINK,
             *  `ToolCallGroup` margins on grouped tools) handle their
             *  own spacing — we don't re-wrap everything in `Container`
             *  because that would constrain Reasoning's full-column
             *  width the way it has in regular messages.
             *  Outer `px-4 py-3` gives the dialog breathing room. */
            className="mt-3 max-h-[65vh] overflow-y-auto px-4 py-3"
          >
            <div className="flex max-w-full flex-grow flex-col gap-0">
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
