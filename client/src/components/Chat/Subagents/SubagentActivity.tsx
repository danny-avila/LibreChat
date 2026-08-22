import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@librechat/client';
import { ContentTypes } from 'librechat-data-provider';
import {
  AlertCircle,
  ArrowDown,
  CheckCircle2,
  Clock3,
  Maximize2,
  Minimize2,
  XCircle,
} from 'lucide-react';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { PartWithIndex } from '~/components/Chat/Messages/Content/ParallelContent';
import type { ChildActivity, ChildActivityItem } from './adapters';
import ToolCallGroup from '~/components/Chat/Messages/Content/ToolCallGroup';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import ToolApproval from '~/components/Chat/Messages/Content/ToolApproval';
import Reasoning from '~/components/Chat/Messages/Content/Parts/Reasoning';
import Container from '~/components/Chat/Messages/Content/Container';
import ToolCall from '~/components/Chat/Messages/Content/ToolCall';
import Text from '~/components/Chat/Messages/Content/Parts/Text';
import { MessageContext } from '~/Providers/MessageContext';
import { cn, groupSequentialToolCalls } from '~/utils';
import { useLocalize } from '~/hooks';

const AT_BOTTOM_THRESHOLD_PX = 120;

const statusIcon = (status: ChildActivity['status']) => {
  if (status === 'completed') return CheckCircle2;
  if (status === 'failed' || status === 'interrupted') return AlertCircle;
  if (status === 'cancelled') return XCircle;
  return Clock3;
};

const statusLabels = {
  dispatched: 'com_ui_subagent_thread_status_dispatched',
  running: 'com_ui_subagent_thread_status_running',
  completed: 'com_ui_subagent_thread_status_completed',
  failed: 'com_ui_subagent_thread_status_failed',
  interrupted: 'com_ui_subagent_thread_status_interrupted',
  cancelled: 'com_ui_subagent_thread_status_cancelled',
} as const;

const toContentPart = (item: ChildActivityItem): TMessageContentParts => {
  if (item.type === 'writing') {
    return { type: ContentTypes.TEXT, text: item.text } as TMessageContentParts;
  }
  if (item.type === 'reasoning') {
    return { type: ContentTypes.THINK, think: item.text ?? '' } as TMessageContentParts;
  }
  return {
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id: item.toolCallId,
      name: item.name,
      args: item.input ?? '',
      output: item.output ?? '',
      progress: item.status === 'running' ? 0.1 : 1,
      ...(item.approval == null ? {} : { approval: item.approval }),
    },
  } as TMessageContentParts;
};

function ActivityPart({
  item,
  part,
  isSubmitting,
  showCursor,
  isLast,
  onToolExpand,
}: {
  item: ChildActivityItem;
  part: TMessageContentParts;
  isSubmitting: boolean;
  showCursor: boolean;
  isLast: boolean;
  onToolExpand?: () => void;
}) {
  const localize = useLocalize();
  if (item.type === 'writing') {
    return (
      <Container>
        <div className="mb-1 text-xs font-medium text-text-secondary">
          {localize('com_ui_subagent_ticker_writing')}
        </div>
        <Text text={item.text} showCursor={showCursor} isCreatedByUser={false} />
        {item.textTruncated === true && (
          <div className="mt-2 text-xs italic text-text-secondary">
            {localize('com_ui_subagent_thread_message_truncated')}
          </div>
        )}
      </Container>
    );
  }
  if (item.type === 'reasoning') {
    if (item.text == null || item.text === '') {
      return (
        <div className="my-2 text-sm text-text-secondary" role="status">
          {localize('com_ui_subagent_ticker_reasoning')}
        </div>
      );
    }
    return <Reasoning reasoning={item.text} isLast={isLast} />;
  }
  const tool = (
    part as {
      [ContentTypes.TOOL_CALL]: {
        id: string;
        args: string | Record<string, unknown>;
        output: string;
        name: string;
        progress: number;
      };
    }
  )[ContentTypes.TOOL_CALL];
  const toolCall = (
    <ToolCall
      args={tool.args}
      output={tool.output}
      initialProgress={tool.progress}
      isSubmitting={isSubmitting && item.status === 'running'}
      isLast={isLast}
      toolCallId={tool.id}
      name={tool.name}
      onExpand={onToolExpand}
      runStepStatus={item.status === 'running' ? undefined : item.status}
    />
  );
  const truncationNotice =
    item.inputTruncated === true || item.outputTruncated === true ? (
      <div className="mb-2 text-xs italic text-text-secondary">
        {localize('com_ui_subagent_thread_message_truncated')}
      </div>
    ) : null;
  if (item.approval != null && (item.output?.length ?? 0) === 0) {
    return (
      <>
        {toolCall}
        {truncationNotice}
        <ToolApproval approval={item.approval} toolCallId={item.toolCallId} args={item.input} />
      </>
    );
  }
  return (
    <>
      {toolCall}
      {truncationNotice}
    </>
  );
}

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
  state = 'ready',
}: {
  activity: ChildActivity;
  state?: 'ready' | 'loading' | 'error';
}) {
  const localize = useLocalize();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isSubmitting = activity.status === 'running' || activity.status === 'dispatched';
  const StatusIcon = statusIcon(activity.status);
  const parts = useMemo(() => activity.items.map(toContentPart), [activity.items]);
  const groupedParts = useMemo(() => {
    const indexed: PartWithIndex[] = parts.map((part, idx) => ({ part, idx }));
    return groupSequentialToolCalls(indexed);
  }, [parts]);
  const context = useMemo(
    () => ({
      messageId: 'subagent-activity-panel',
      isExpanded: true,
      isSubmitting,
      isLatestMessage: isSubmitting,
      conversationId: null,
    }),
    [isSubmitting],
  );
  const renderPart = useCallback(
    (part: TMessageContentParts, idx: number, isLast: boolean, onToolExpand?: () => void) => (
      <ActivityPart
        key={`activity-${idx}`}
        item={activity.items[idx]}
        part={part}
        isSubmitting={isSubmitting}
        showCursor={isSubmitting && isLast}
        isLast={isLast}
        onToolExpand={onToolExpand}
      />
    ),
    [activity.items, isSubmitting],
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
      <div className="py-8 text-center text-sm text-text-secondary" role="status">
        {localize('com_ui_subagent_waiting')}
      </div>
    );
  } else if (state === 'error') {
    body = (
      <div className="rounded-lg border border-status-error-border bg-status-error-subtle p-3 text-sm text-status-error">
        {localize('com_ui_subagent_thread_load_error')}
      </div>
    );
  } else if (activity.items.length === 0) {
    body = (
      <div className="rounded-lg border border-border-light bg-surface-secondary p-3 text-sm text-text-secondary">
        {isSubmitting
          ? localize('com_ui_subagent_no_result_yet')
          : localize('com_ui_subagent_empty_result')}
      </div>
    );
  } else {
    const last = parts.length - 1;
    body = (
      <MessageContext.Provider value={context}>
        {groupedParts.map((group) =>
          group.type === 'single' ? (
            renderPart(group.part.part, group.part.idx, group.part.idx === last)
          ) : (
            <ToolCallGroup
              key={`activity-group-${group.parts[0].idx}`}
              parts={group.parts}
              isSubmitting={isSubmitting}
              isLast={group.parts.some((part) => part.idx === last)}
              renderPart={renderPart}
              lastContentIdx={last}
            />
          ),
        )}
      </MessageContext.Provider>
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
          <span>{localize(statusLabels[activity.status])}</span>
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
          {activity.activityTruncated === true && (
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
