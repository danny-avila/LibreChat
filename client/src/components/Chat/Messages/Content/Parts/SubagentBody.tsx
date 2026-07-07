import { useCallback, useId, useMemo, useState } from 'react';
import { ChevronDown, Quote } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import type { Agents, TMessageContentParts } from 'librechat-data-provider';
import ToolCallGroup from '~/components/Chat/Messages/Content/ToolCallGroup';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import ToolApproval from '~/components/Chat/Messages/Content/ToolApproval';
import Container from '~/components/Chat/Messages/Content/Container';
import ToolCall from '~/components/Chat/Messages/Content/ToolCall';
import { MessageContext } from '~/Providers/MessageContext';
import { useLocalize, useExpandCollapse } from '~/hooks';
import { cn, groupSequentialToolCalls } from '~/utils';
import Reasoning from './Reasoning';
import Text from './Text';

/**
 * Per-part renderer for a subagent run. Mirrors the wrapper choices `<Part>`
 * makes in regular messages so subagent content matches the width and spacing
 * the user already knows: TEXT wraps in `Container`, THINK/TOOL_CALL render
 * bare (their own wrappers control layout). Inlined (vs. calling `<Part>`) to
 * avoid the `Parts/index → SubagentCall → Part` import cycle and nested
 * subagent recursion.
 */
export function SubagentPart({
  part,
  isSubmitting,
  showCursor,
  isLast,
  onToolExpand,
}: {
  part: TMessageContentParts;
  isSubmitting: boolean;
  showCursor: boolean;
  isLast: boolean;
  onToolExpand?: () => void;
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
          id?: string;
          args?: string | Record<string, unknown>;
          output?: string;
          name?: string;
          progress?: number;
          approval?: Agents.ToolCall['approval'];
        };
      }
    )[ContentTypes.TOOL_CALL];
    if (!tc) return null;
    const toolCall = (
      <ToolCall
        args={tc.args ?? ''}
        output={tc.output ?? ''}
        initialProgress={tc.progress ?? 0.1}
        isSubmitting={isSubmitting}
        isLast={isLast}
        name={tc.name ?? ''}
        onExpand={onToolExpand}
      />
    );
    /** Surface approve/reject/edit controls for a tool paused INSIDE this
     *  subagent — its tool_call lives in subagent_content, not as a top-level
     *  message part, so Part.tsx never renders it. Only while unresolved. */
    if (tc.approval != null && (tc.output?.length ?? 0) === 0) {
      return (
        <>
          {toolCall}
          <ToolApproval approval={tc.approval} toolCallId={tc.id ?? ''} args={tc.args} />
        </>
      );
    }
    return toolCall;
  }
  return null;
}

/**
 * The subagent run's activity trace + final output, rendered through the same
 * `<Part>` pipeline the main conversation uses (grouped tools collapse into a
 * `Used N tools` header). A scoped `MessageContext` supplies the reasoning /
 * latest-message state the leaf renderers read.
 */
export function SubagentBody({
  toolCallId,
  running,
  contentParts,
  output,
}: {
  toolCallId: string;
  running: boolean;
  contentParts: TMessageContentParts[];
  output?: string | null;
}): JSX.Element {
  const localize = useLocalize();
  const lastPartIndex = contentParts.length - 1;

  const messageContext = useMemo(
    () => ({
      messageId: `subagent-${toolCallId}`,
      isExpanded: true,
      isSubmitting: running,
      isLatestMessage: running,
      conversationId: null,
    }),
    [toolCallId, running],
  );

  const renderPart = useCallback(
    (part: TMessageContentParts, idx: number, isLastPart: boolean, onToolExpand?: () => void) => (
      <SubagentPart
        key={`${toolCallId}-part-${idx}`}
        part={part}
        isSubmitting={running}
        showCursor={running && isLastPart}
        isLast={isLastPart}
        onToolExpand={onToolExpand}
      />
    ),
    [toolCallId, running],
  );

  const groupedParts = useMemo(
    () => groupSequentialToolCalls(contentParts.map((part, idx) => ({ part, idx }))),
    [contentParts],
  );

  if (contentParts.length > 0) {
    return (
      <MessageContext.Provider value={messageContext}>
        {groupedParts.map((group) => {
          if (group.type === 'single') {
            const { part, idx } = group.part;
            return renderPart(part, idx, idx === lastPartIndex);
          }
          return (
            <ToolCallGroup
              key={`${toolCallId}-group-${group.parts[0].idx}`}
              parts={group.parts}
              isSubmitting={running}
              isLast={group.parts.some((p) => p.idx === lastPartIndex)}
              renderPart={renderPart}
              lastContentIdx={lastPartIndex}
            />
          );
        })}
      </MessageContext.Provider>
    );
  }

  if (output) {
    return (
      <MessageContext.Provider value={messageContext}>
        <SubagentPart
          part={{ type: ContentTypes.TEXT, text: output } as unknown as TMessageContentParts}
          isSubmitting={false}
          showCursor={false}
          isLast
        />
      </MessageContext.Provider>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-6 py-10 text-center text-sm text-text-secondary">
      {running
        ? localize('com_ui_subagent_no_result_yet')
        : localize('com_ui_subagent_empty_result')}
    </div>
  );
}

/**
 * The originating prompt as a collapsed disclosure pinned directly under the
 * panel header — context (the task the run was given), grouped with the run's
 * identity rather than lost at the bottom or dominating the top of the trace.
 * Collapsed by default so the run opens on its result; expands in place with
 * its own bounded scroll for long prompts.
 */
export function SubagentPrompt({ prompt }: { prompt: string }): JSX.Element {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const contentId = useId();
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(expanded);

  /** One-line, symbol-stripped teaser so the collapsed row still conveys the
   *  task at a glance without expanding. */
  const preview = useMemo(
    () =>
      prompt
        .replace(/[`*_#>~[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    [prompt],
  );

  return (
    <section aria-labelledby={headingId} className="shrink-0 border-b border-border-light">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-controls={contentId}
        aria-expanded={expanded}
        className="group/prompt flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-heavy"
      >
        <Quote size={13} className="shrink-0 text-text-tertiary" aria-hidden="true" />
        <span
          id={headingId}
          className="shrink-0 text-xs font-semibold uppercase tracking-wide text-text-secondary"
        >
          {localize('com_ui_prompt')}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-xs text-text-tertiary transition-opacity duration-200',
            expanded ? 'opacity-0' : 'opacity-100',
          )}
        >
          {preview}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            'ml-auto shrink-0 text-text-secondary transition-transform duration-300 ease-out',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      <div id={contentId} style={expandStyle} aria-hidden={!expanded || undefined}>
        <div className="overflow-hidden" ref={expandRef}>
          <div className="max-h-64 overflow-y-auto px-4 pb-4 pt-0.5">
            <div className="markdown prose prose-sm message-content light dark:prose-invert w-full max-w-none break-words text-text-primary dark:text-gray-100">
              <MarkdownLite content={prompt} codeExecution={false} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
