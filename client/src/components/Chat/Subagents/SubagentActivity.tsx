import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@librechat/client';
import { ContentTypes } from 'librechat-data-provider';
import { ArrowDown, Maximize2, Minimize2 } from 'lucide-react';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { ChildActivity, ChildActivityItem } from './adapters';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import ContentParts from '~/components/Chat/Messages/Content/ContentParts';
import { subagentStatusIcon, subagentStatusLabelKey } from './status';
import Container from '~/components/Chat/Messages/Content/Container';
import { EmptyText } from '~/components/Chat/Messages/Content/Parts';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const AT_BOTTOM_THRESHOLD_PX = 120;

const toContentPart = (
  item: ChildActivityItem,
  reasoningMarkerLabel: string,
): TMessageContentParts => {
  if (item.type === 'writing') {
    return {
      type: ContentTypes.TEXT,
      text: item.text,
      ...(item.phase == null ? {} : { phase: item.phase }),
    } as TMessageContentParts;
  }
  if (item.type === 'reasoning') {
    if (item.text == null || item.text === '') {
      return {
        type: ContentTypes.ACTIVITY_LABEL,
        [ContentTypes.ACTIVITY_LABEL]: item.label ?? reasoningMarkerLabel,
        activity_label_type: 'phase',
      } as TMessageContentParts;
    }
    return {
      type: ContentTypes.THINK,
      think: item.text ?? '',
      ...(item.label == null ? {} : { reasoning_label: item.label }),
    } as TMessageContentParts;
  }
  if (item.type === 'activity_label') {
    return {
      type: ContentTypes.ACTIVITY_LABEL,
      [ContentTypes.ACTIVITY_LABEL]: item.label,
      ...(item.labelType == null ? {} : { activity_label_type: item.labelType }),
      ...(item.toolCallIds == null ? {} : { tool_call_ids: item.toolCallIds }),
      ...(item.activityStartIndex == null ? {} : { activity_start_index: item.activityStartIndex }),
      ...(item.activityEndIndex == null ? {} : { activity_end_index: item.activityEndIndex }),
      ...(item.activityCount == null ? {} : { activity_count: item.activityCount }),
      ...(item.agentIds == null ? {} : { agent_ids: item.agentIds }),
      ...(item.status == null ? {} : { status: item.status }),
      ...(item.pending == null ? {} : { pending: item.pending }),
    } as TMessageContentParts;
  }
  return {
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id: item.toolCallId,
      name: item.name,
      args: item.input ?? '',
      output: item.output ?? '',
      progress: item.status === 'running' ? 0.1 : 1,
      ...(item.status === 'running' ? {} : { runStepStatus: item.status }),
      ...(item.inputValidationError === true ? { inputValidationError: true } : {}),
      ...(item.approval == null ? {} : { approval: item.approval }),
    },
  } as TMessageContentParts;
};

function SubagentPrompt({ prompt }: { prompt: string }) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const contentId = useId();
  const toggleLabel = expanded ? localize('com_ui_collapse') : localize('com_ui_expand');
  return (
    <section
      aria-labelledby={headingId}
      className="mb-3 shrink-0 overflow-hidden rounded-lg border border-border-light bg-surface-secondary text-text-primary"
    >
      <div className="flex min-h-[2.75rem] items-center justify-between gap-3 border-b border-border-light px-3 py-2">
        <h3 id={headingId} className="text-sm font-medium text-text-primary">
          {localize('com_ui_prompt')}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((value) => !value)}
          aria-controls={contentId}
          aria-expanded={expanded}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="h-8 gap-1.5 rounded-md px-2 text-xs font-medium text-text-secondary transition hover:bg-surface-tertiary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-text-primary"
        >
          {expanded ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
          <span className="hidden sm:inline">{toggleLabel}</span>
        </Button>
      </div>
      <div
        id={contentId}
        className={cn(
          'relative min-w-0 px-4 py-3',
          expanded ? 'overflow-visible' : 'max-h-32 overflow-hidden',
        )}
      >
        <div className="markdown prose prose-sm message-content light dark:prose-invert w-full max-w-none break-words text-text-primary">
          <MarkdownLite content={prompt} codeExecution={false} />
        </div>
        {!expanded && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface-secondary to-transparent"
            aria-hidden
          />
        )}
      </div>
    </section>
  );
}

export default function SubagentActivity({
  activity,
  activityId,
  state = 'ready',
}: {
  activity: ChildActivity;
  activityId?: string;
  state?: 'ready' | 'loading' | 'error';
}) {
  const localize = useLocalize();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isSubmitting = activity.status === 'running' || activity.status === 'dispatched';
  const StatusIcon = subagentStatusIcon(activity.status);
  const reasoningMarkerLabel = localize('com_ui_subagent_ticker_reasoning');
  const parts = useMemo(
    () => activity.items.map((item) => toContentPart(item, reasoningMarkerLabel)),
    [activity.items, reasoningMarkerLabel],
  );
  const activityTruncated =
    activity.activityTruncated === true ||
    activity.items.some(
      (item) =>
        (item.type === 'writing' && item.textTruncated === true) ||
        (item.type === 'tool' && (item.inputTruncated === true || item.outputTruncated === true)),
    );

  useEffect(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (scroll == null || content == null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (isAtBottom) scroll.scrollTop = scroll.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [isAtBottom]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setIsAtBottom(
      element.scrollHeight - element.scrollTop - element.clientHeight <= AT_BOTTOM_THRESHOLD_PX,
    );
  }, []);

  let body: React.ReactNode;
  if (state === 'loading') {
    body = (
      <Container>
        <EmptyText />
      </Container>
    );
  } else if (state === 'error') {
    body = (
      <div className="rounded-lg border border-status-error-border bg-status-error-subtle p-3 text-sm text-status-error">
        {localize('com_ui_subagent_thread_load_error')}
      </div>
    );
  } else if (activity.items.length === 0) {
    body = isSubmitting ? (
      <Container>
        <EmptyText />
      </Container>
    ) : (
      <div className="rounded-lg border border-border-light bg-surface-secondary p-3 text-sm text-text-secondary">
        {localize('com_ui_subagent_empty_result')}
      </div>
    );
  } else {
    body = (
      <ContentParts
        content={parts}
        messageId={activityId ?? 'subagent-activity-panel'}
        conversationId={null}
        isCreatedByUser={false}
        isLast
        isSubmitting={isSubmitting}
        isLatestMessage={isSubmitting}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border-light px-4 py-2">
        <div
          className={cn(
            'flex items-center gap-1 text-xs text-text-secondary',
            activity.status === 'failed' || activity.status === 'interrupted'
              ? 'text-status-error'
              : '',
          )}
          aria-live="polite"
        >
          <StatusIcon size={13} aria-hidden />
          <span>{localize(subagentStatusLabelKey(activity.status))}</span>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {!isAtBottom && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth',
              });
              setIsAtBottom(true);
            }}
            aria-label={localize('com_ui_subagent_scroll_to_bottom')}
            className="sticky top-[calc(100%-2.75rem)] z-10 ml-auto h-8 w-8 rounded-full border border-border-light bg-surface-secondary text-text-secondary shadow-md"
          >
            <ArrowDown size={16} aria-hidden />
          </Button>
        )}
        <div ref={contentRef} className="flex max-w-full flex-col gap-0">
          {activity.prompt != null && <SubagentPrompt prompt={activity.prompt} />}
          {activityTruncated && (
            <div className="mb-3 text-xs italic text-text-secondary">
              {localize('com_ui_subagent_thread_history_truncated')}
            </div>
          )}
          {body}
        </div>
      </div>
    </div>
  );
}
