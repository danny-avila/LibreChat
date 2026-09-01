import { memo, useCallback, useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Button } from '@librechat/client';
import { ChevronDown, Users } from 'lucide-react';
import type { WakeupDisplay, WakeupTask } from './Parts/wakeup';
import type { ActiveSubagentPanel } from '~/store/subagents';
import type { TranslationKeys } from '~/hooks';
import { subagentStatusIcon, subagentStatusLabelKey } from '~/components/Chat/Subagents/status';
import { useParentSubagents } from '~/components/Chat/Subagents/ParentSubagentsProvider';
import { durableSubagentSelection } from '~/components/Chat/Subagents/eventSelection';
import { useLocalize, useExpandCollapse, useLazyCollapseBody } from '~/hooks';
import { useOpenSubagentPanel } from '~/components/Chat/Subagents/surface';
import { useMCPIconMap, useMCPServerNames } from '~/hooks/MCP';
import { useShareContext } from '~/Providers/ShareContext';
import { cn, getToolDisplayLabel } from '~/utils';
import { useMessageContext } from '~/Providers';
import { StackedToolIcons } from './ToolOutput';
import MarkdownLite from './MarkdownLite';
import store from '~/store';

const SUBAGENT_HEADER_KEYS = {
  completed: 'com_ui_wakeup_subagent_completed',
  error: 'com_ui_wakeup_subagent_errored',
  cancelled: 'com_ui_wakeup_subagent_cancelled',
} as const satisfies Record<WakeupTask['status'], TranslationKeys>;

const threadStatus = (status: WakeupTask['status']) =>
  status === 'error' ? ('failed' as const) : status;

function WakeupTaskCard({
  task,
  kind,
  conversationId,
}: {
  task: WakeupTask;
  kind: WakeupDisplay['kind'];
  conversationId?: string | null;
}) {
  const localize = useLocalize();
  const mcpServerNames = useMCPServerNames();
  const { isSharedConvo } = useShareContext();
  const { messageId } = useMessageContext();
  const { byThreadId } = useParentSubagents();
  const openPanel = useOpenSubagentPanel();
  const child = task.threadId == null ? undefined : byThreadId.get(task.threadId);
  const selection = useMemo<ActiveSubagentPanel | null>(() => {
    /** Share pages have no authenticated durable-thread panel; a conversation
     *  selection there would be written and silently ignored. */
    if (
      isSharedConvo === true ||
      task.threadId == null ||
      conversationId == null ||
      conversationId === ''
    ) {
      return null;
    }
    if (child != null) {
      return durableSubagentSelection(conversationId, child, task.taskId);
    }
    /** The bounded discovery index can omit older children; the wake-up payload
     *  already carries the exact durable identities, so link to the authorized
     *  thread query directly instead of requiring index membership. */
    return {
      host: 'conversation',
      parentConversationId: conversationId,
      parentMessageId: messageId,
      toolCallId: `wakeup:${task.threadId}`,
      partIndex: 0,
      subagentType: task.subagentType ?? '',
      initialProgress: task.status === 'completed' ? 1 : 0,
      isSubmitting: false,
      durable: { threadId: task.threadId, taskId: task.taskId },
    };
  }, [child, conversationId, isSharedConvo, messageId, task]);
  const status = threadStatus(task.status);
  const StatusIcon = subagentStatusIcon(status);
  const title =
    kind === 'subagent'
      ? (task.subagentType ?? '')
      : getToolDisplayLabel(task.toolName ?? '', localize, mcpServerNames);
  const hasResult = task.result.trim() !== '';

  const openActivity = useCallback(() => {
    if (selection == null) return;
    openPanel(selection);
  }, [openPanel, selection]);

  return (
    <div className="my-1.5 rounded-lg border border-border-light bg-surface-secondary/40 p-3">
      <div className="flex min-h-6 items-center gap-1.5 text-xs text-text-secondary">
        <StatusIcon
          size={13}
          aria-hidden
          className={cn('shrink-0', status === 'failed' && 'text-status-error')}
        />
        {title !== '' && <span className="min-w-0 truncate font-medium">{title}</span>}
        <span className="shrink-0">{localize(subagentStatusLabelKey(status))}</span>
        {selection != null && (
          /** The trigger identity attributes let the panel's close handler
           *  return keyboard focus to this button. */
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openActivity}
            data-subagent-tool-call={selection.toolCallId}
            data-subagent-parent-message={selection.parentMessageId}
            data-subagent-part-index={selection.partIndex}
            className="ml-auto h-6 shrink-0 px-2 text-xs"
          >
            {localize('com_ui_wakeup_view_activity')}
          </Button>
        )}
      </div>
      {hasResult && (
        <div className="markdown prose prose-sm message-content light dark:prose-invert mt-2 max-h-96 w-full max-w-none overflow-y-auto break-words pr-1 text-text-primary">
          <MarkdownLite content={task.result} codeExecution={false} />
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible task card for a host-authored wake-up continuation: the durable
 * result that woke this agent, rendered in the tool-call visual family instead
 * of the raw model-facing prompt.
 */
const Wakeup = memo(function Wakeup({
  display,
  conversationId,
}: {
  display: WakeupDisplay;
  conversationId?: string | null;
}) {
  const localize = useLocalize();
  const mcpIconMap = useMCPIconMap();
  const mcpServerNames = useMCPServerNames();
  const autoExpand = useRecoilValue(store.autoExpandTools);
  const [isExpanded, setIsExpanded] = useState(autoExpand);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(isExpanded);
  const { shouldRenderBody, mountBody, handleTransitionEnd } = useLazyCollapseBody(isExpanded);

  const handleToggle = useCallback(() => {
    mountBody();
    setIsExpanded((previous) => !previous);
  }, [mountBody]);

  const anyFailed = display.tasks.some((task) => task.status === 'error');
  const headerLabel = useMemo(() => {
    if (display.kind === 'subagent') {
      const status = display.tasks[0]?.status ?? 'completed';
      return localize(SUBAGENT_HEADER_KEYS[status]);
    }
    if (display.tasks.length > 1) {
      return localize('com_ui_wakeup_tasks_finished', { 0: String(display.tasks.length) });
    }
    return localize(
      display.tasks[0]?.status === 'error'
        ? 'com_ui_wakeup_task_errored'
        : 'com_ui_wakeup_task_finished',
    );
  }, [display.kind, display.tasks, localize]);

  const nameSummary = useMemo(() => {
    if (display.kind === 'subagent') {
      return display.tasks[0]?.subagentType ?? '';
    }
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const task of display.tasks) {
      if (task.toolName == null || task.toolName === '') continue;
      const label = getToolDisplayLabel(task.toolName, localize, mcpServerNames);
      if (seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
    if (labels.length > 3) {
      return `${labels.slice(0, 3).join(', ')}, +${labels.length - 3}`;
    }
    return labels.join(', ');
  }, [display.kind, display.tasks, localize, mcpServerNames]);

  const toolIconNames = useMemo(
    () => display.tasks.map((task) => task.toolName ?? ''),
    [display.tasks],
  );

  return (
    <div className="mb-2 mt-1 w-full">
      <Button
        variant="ghost"
        type="button"
        className="inline-flex h-auto w-full items-center justify-start gap-2 rounded-none bg-transparent p-0 py-1 text-text-secondary hover:bg-transparent hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy focus-visible:ring-offset-0"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={headerLabel}
      >
        {display.kind === 'subagent' ? (
          <div
            className="flex h-5 w-5 shrink-0 items-center justify-center text-text-secondary"
            aria-hidden="true"
          >
            <Users size={14} />
          </div>
        ) : (
          <StackedToolIcons toolNames={toolIconNames} mcpIconMap={mcpIconMap} maxIcons={4} />
        )}
        <span
          className={cn(
            'tool-status-text min-w-0 truncate font-medium',
            anyFailed && 'text-text-warning',
          )}
          role="status"
          title={headerLabel}
        >
          {headerLabel}
        </span>
        {nameSummary !== '' && (
          <span className="min-w-0 max-w-[40%] truncate text-xs font-normal text-text-secondary">
            · {nameSummary}
          </span>
        )}
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-text-secondary transition-transform duration-200 ease-out',
            isExpanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </Button>
      <div
        style={expandStyle}
        onTransitionEnd={handleTransitionEnd}
        aria-hidden={!isExpanded}
        data-testid="wakeup-panel"
      >
        {shouldRenderBody && (
          <div className="overflow-hidden" ref={expandRef}>
            <div className="py-0.5 pl-4">
              <div className="mt-1 text-xs text-text-secondary">
                {localize('com_ui_wakeup_explainer')}
              </div>
              {display.tasks.map((task) => (
                <WakeupTaskCard
                  key={task.taskId}
                  task={task}
                  kind={display.kind}
                  conversationId={conversationId}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default Wakeup;
