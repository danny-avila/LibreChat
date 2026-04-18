import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronRight, Users } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogDescription } from '@librechat/client';
import { ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import ToolCall from '~/components/Chat/Messages/Content/ToolCall';
import Text from './Text';
import Reasoning from './Reasoning';
import { AttachmentGroup } from './Attachment';
import { MessageContext } from '~/Providers/MessageContext';
import { useLocalize } from '~/hooks';
import { subagentProgressByToolCallId } from '~/store';
import { aggregateSubagentContent, buildSubagentTickerLines } from '~/utils/subagentContent';
import { cn } from '~/utils';

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
  const [open, setOpen] = useState(false);

  const subagentType = progress?.subagentType ?? extractSubagentType(args);
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
   * Aggregated content parts for the dialog.
   *
   * Preference order:
   *   1. **Persisted** `subagent_content` on the parent tool_call — written
   *      by the backend at message-save time, survives a page refresh.
   *      Preferred *only* when the run is not currently streaming, so an
   *      in-progress re-render still tracks live deltas (persisted content
   *      is only correct post-finalize).
   *   2. **Live aggregation** from the Recoil atom's event stream —
   *      covers the current session before the backend has written the
   *      persisted snapshot.
   */
  const liveParts = useMemo<TMessageContentParts[]>(
    () => aggregateSubagentContent(events ?? []) as unknown as TMessageContentParts[],
    [events],
  );
  const contentParts = useMemo<TMessageContentParts[]>(() => {
    if (liveParts.length > 0) return liveParts;
    if (persistedContent && persistedContent.length > 0) return persistedContent;
    return liveParts;
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

  const headerText = hasError
    ? localize('com_ui_subagent_errored', { 0: subagentType })
    : cancelled
      ? localize('com_ui_subagent_cancelled', { 0: subagentType })
      : running
        ? localize('com_ui_subagent_running', { 0: subagentType })
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
          <Users
            size={14}
            className={cn('shrink-0', running && 'animate-pulse text-primary')}
            aria-hidden="true"
          />
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
            /** Responsive width: narrow on phones, scales up to 5xl on
             *  desktops maximized windows. Uses viewport-relative max so
             *  the dialog never bleeds to the edges but still takes real
             *  estate on laptops/widescreens. */
            'w-[min(95vw,64rem)] max-w-[min(95vw,64rem)]',
          )}
        >
          <OGDialogTitle>
            {localize('com_ui_subagent_dialog_title', { 0: subagentType })}
          </OGDialogTitle>
          <OGDialogDescription className="text-sm text-text-secondary">
            {description || localize('com_ui_subagent_dialog_description')}
          </OGDialogDescription>

          <div ref={scrollRef} className="mt-3 max-h-[65vh] overflow-y-auto pr-1">
            {contentParts.length > 0 ? (
              <MessageContext.Provider value={dialogMessageContext}>
                <div className="space-y-1">
                  {contentParts.map((part, i) => (
                    <SubagentDialogPart
                      key={`${toolCallId}-part-${i}`}
                      part={part}
                      isSubmitting={running}
                      showCursor={running && i === lastPartIndex}
                      isLast={i === lastPartIndex}
                    />
                  ))}
                </div>
              </MessageContext.Provider>
            ) : output ? (
              /** Fallback: no aggregated content parts but the backend
               *  wrote a final tool_call output. Happens for older subagent
               *  runs recorded before the event forwarder existed. Route
               *  through the same leaf renderer as content parts so
               *  markdown (headers, lists, bold) renders properly instead
               *  of showing raw `##` / `**` characters. */
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
 * Minimal renderer for a subagent's aggregated content parts. Mirrors the
 * three types the aggregator produces (`TEXT`, `THINK`, `TOOL_CALL`) —
 * everything else would require the full `<Part />` tree and its imports,
 * which creates an import cycle through `Parts/index`. Using the leaf
 * components directly keeps this self-contained and avoids rendering a
 * nested `SubagentCall` if a child somehow emits a subagent tool call.
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
    return <Text text={text} showCursor={showCursor} isCreatedByUser={false} />;
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
