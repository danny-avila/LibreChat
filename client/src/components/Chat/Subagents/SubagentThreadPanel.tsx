import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 } from 'uuid';
import { ForkOptions } from 'librechat-data-provider';
import { Bot, CornerDownRight, ListEnd, MessagesSquare, OctagonX, X, Zap } from 'lucide-react';
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from 'recoil';
import {
  Button,
  Alert,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useMediaQuery,
  useToastContext,
} from '@librechat/client';
import type {
  ParentSubagentTaskSummary,
  SubagentControlAction,
  SubagentControlReceipt,
  SubagentControlRequest,
} from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { ActiveSubagentPanel, SubagentControlUiState } from '~/store/subagents';
import {
  ACTIVE_THREAD_REFRESH_MS,
  subagentThreadHasTaskEvidence,
  useForkConvoMutation,
  useSubagentControlMutation,
  useSubagentThreadQuery,
} from '~/data-provider';
import {
  activeSubagentPanel,
  subagentControlStateByTask,
  subagentControlStateKey,
  subagentProgressByToolCallId,
  subagentProgressKey,
} from '~/store/subagents';
import useSubagentActivityStream from '~/data-provider/Subagents/useSubagentActivityStream';
import SubagentActivity, { SubagentActivityScrollSurface } from './SubagentActivity';
import { adaptDurableThreadActivity, adaptLivePersistedActivity } from './adapters';
import ApprovalProvider from '~/components/Chat/Messages/Content/ApprovalContext';
import { useFocusTrap, useLocalize, useNavigateToConvo } from '~/hooks';
import { useParentSubagents } from './ParentSubagentsProvider';
import { eventSubagentSelection } from './eventSelection';
import { useAgentsMapContext } from '~/Providers';

const EVENT_TASK_PAGE_SIZE = 3;
const TERMINAL_CONTROL_REASONS = new Set([
  'task_not_running',
  'task_completed',
  'task_cancelled',
  'task_failed',
]);

const isTerminalControlReason = (reason?: string): boolean =>
  reason != null && TERMINAL_CONTROL_REASONS.has(reason);

const closesTaskControls = (receipt: SubagentControlReceipt): boolean =>
  isTerminalControlReason(receipt.reason) ||
  (receipt.action === 'cancel' && receipt.status === 'applied');

const responseStatus = (error: unknown): number | undefined =>
  typeof error === 'object' &&
  error != null &&
  'response' in error &&
  typeof error.response === 'object' &&
  error.response != null &&
  'status' in error.response &&
  typeof error.response.status === 'number'
    ? error.response.status
    : undefined;

const failedControlReason = (
  inaccessible: boolean,
  retryable: boolean,
): 'task_inaccessible' | 'owner_unavailable' | 'invalid_command' => {
  if (inaccessible) return 'task_inaccessible';
  if (retryable) return 'owner_unavailable';
  return 'invalid_command';
};

const failedControlLocaleKey = (reason?: string) => {
  if (reason === 'task_inaccessible') return 'com_ui_subagent_control_reason_task_inaccessible';
  if (reason === 'owner_unavailable') return 'com_ui_subagent_control_reason_owner_unavailable';
  return 'com_ui_subagent_control_reason_invalid_command';
};

export default function SubagentThreadPanel({ selection }: { selection: ActiveSubagentPanel }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const resetSelection = useResetRecoilState(activeSubagentPanel);
  const setSelection = useSetRecoilState(activeSubagentPanel);
  const agentsMap = useAgentsMapContext();
  const { byMessageId, byThreadId, refresh } = useParentSubagents();
  const progress = useRecoilValue(
    subagentProgressByToolCallId(
      subagentProgressKey(
        selection.parentMessageId,
        selection.event?.progressKey ?? selection.toolCallId,
        selection.partIndex,
      ),
    ),
  );
  const foregroundTitle =
    selection.subagentType === 'self'
      ? localize('com_ui_subagent_dialog_title_self')
      : localize('com_ui_subagent_dialog_title', { 0: selection.subagentType });
  const threadId = selection.durable?.threadId ?? '';
  const taskId = selection.durable?.taskId ?? '';
  const controlIdentity = subagentControlStateKey(selection.parentConversationId, threadId, taskId);
  const [controlState, setControlState] = useRecoilState(
    subagentControlStateByTask(controlIdentity),
  );
  const setControlStateForIdentity = useRecoilCallback(
    ({ set }) =>
      (identity: string, state: SubagentControlUiState | null) =>
        set(subagentControlStateByTask(identity), state),
    [],
  );
  const transientControl = controlState?.receipt ?? null;
  const retryControl = controlState?.retry ?? null;
  const eventSummary = selection.event == null ? undefined : byThreadId.get(threadId);
  const eventTaskCount = eventSummary?.tasks.length ?? 0;
  const [eventTaskWindow, setEventTaskWindow] = useState(() => ({
    threadId,
    count: EVENT_TASK_PAGE_SIZE,
    taskCount: eventSummary == null ? null : eventTaskCount,
  }));
  useEffect(() => {
    setEventTaskWindow((current) => {
      if (current.threadId !== threadId || current.taskCount == null) {
        return { threadId, count: EVENT_TASK_PAGE_SIZE, taskCount: eventTaskCount };
      }
      const appended = Math.max(0, eventTaskCount - current.taskCount);
      return {
        threadId,
        count: Math.min(eventTaskCount, current.count + appended),
        taskCount: eventTaskCount,
      };
    });
  }, [eventTaskCount, threadId]);
  const visibleEventTaskCount = Math.min(
    eventTaskCount,
    eventTaskWindow.threadId === threadId ? eventTaskWindow.count : EVENT_TASK_PAGE_SIZE,
  );
  const visibleEventTasks = useMemo(
    () => (eventSummary?.tasks ?? []).slice(0, visibleEventTaskCount).reverse(),
    [eventSummary?.tasks, visibleEventTaskCount],
  );
  const hasEarlierRetainedTasks = visibleEventTaskCount < eventTaskCount;
  const eventTaskRunning =
    eventSummary?.tasks.find((task) => task.taskId === taskId)?.status === 'running';
  const eventSiblings = useMemo(() => {
    if (selection.event == null) return [];
    const seen = new Set<string>();
    return (selection.event.siblingParentMessageIds ?? [selection.parentMessageId])
      .flatMap((parentMessageId) => byMessageId.get(parentMessageId) ?? [])
      .filter((child) => {
        if (seen.has(child.threadId)) return false;
        seen.add(child.threadId);
        return true;
      });
  }, [byMessageId, selection.event, selection.parentMessageId]);
  const { data, isLoading, isError, isReadinessPending, refetch } = useSubagentThreadQuery(
    selection.parentConversationId,
    threadId,
    taskId,
    eventTaskRunning ? { refetchInterval: ACTIVE_THREAD_REFRESH_MS } : undefined,
  );
  const durableTerminal =
    subagentThreadHasTaskEvidence(data, taskId) &&
    (data?.status === 'completed' ||
      data?.status === 'failed' ||
      data?.status === 'interrupted' ||
      data?.status === 'cancelled');
  const priorTerminalRef = useRef(false);
  useSubagentActivityStream(selection, !durableTerminal || eventTaskRunning);

  useEffect(() => {
    if (selection.event == null) return;
    void refresh();
  }, [refresh, selection.event, threadId]);

  useEffect(() => {
    priorTerminalRef.current = false;
  }, [taskId, threadId]);

  useEffect(() => {
    if (selection.event == null) return;
    if (durableTerminal && !priorTerminalRef.current) void refresh();
    priorTerminalRef.current = durableTerminal;
  }, [durableTerminal, refresh, selection.event]);

  useEffect(() => {
    if (selection.event == null || !eventTaskRunning || !durableTerminal) return;
    void refetch();
  }, [durableTerminal, eventTaskRunning, refetch, selection.event]);
  useEffect(() => {
    if (
      selection.event == null ||
      eventSummary?.latestTaskId == null ||
      eventSummary.latestTaskId === taskId
    ) {
      return;
    }
    const nextSelection = eventSubagentSelection(
      selection.parentConversationId,
      eventSummary,
      selection.event.siblingParentMessageIds,
    );
    if (nextSelection != null) setSelection(nextSelection);
  }, [eventSummary, selection, setSelection, taskId]);
  const detachedLiveSubmitting =
    selection.durable != null &&
    progress != null &&
    progress.status !== 'stop' &&
    progress.status !== 'error';

  const continueChat = useForkConvoMutation({
    onSuccess: (result) => {
      resetSelection();
      navigateToConvo(result.conversation);
    },
    onError: () => {
      showToast({ message: localize('com_ui_continue_chat_error'), status: 'error' });
    },
  });
  const [controlMessage, setControlMessage] = useState('');
  const [controlInaccessible, setControlInaccessible] = useState(false);
  const [controlsClosed, setControlsClosed] = useState(false);
  const controlInFlightRef = useRef(false);
  const controlSelectionRef = useRef(controlIdentity);
  useEffect(() => {
    controlSelectionRef.current = controlIdentity;
    setControlMessage('');
    setControlInaccessible(false);
    setControlsClosed(false);
    controlInFlightRef.current = false;
    return () => {
      controlSelectionRef.current = '';
    };
  }, [controlIdentity]);

  const controlTask = useSubagentControlMutation({
    onSuccess: ({ receipt }, variables) => {
      const submittedSelection = subagentControlStateKey(
        variables.parentConversationId,
        variables.threadId,
        variables.command.taskId,
      );
      setControlStateForIdentity(submittedSelection, { receipt });
      if (controlSelectionRef.current !== submittedSelection) return;
      controlInFlightRef.current = false;
      if (closesTaskControls(receipt)) setControlsClosed(true);
      if (
        variables.command.action !== 'cancel_message' &&
        (receipt.status === 'accepted' || receipt.status === 'applied')
      ) {
        setControlMessage('');
      }
    },
    onError: (error, variables) => {
      const status = responseStatus(error);
      const inaccessible = status === 404;
      const retryable = status == null || status >= 500;
      const command = variables.command;
      const submittedSelection = subagentControlStateKey(
        variables.parentConversationId,
        variables.threadId,
        command.taskId,
      );
      setControlStateForIdentity(submittedSelection, {
        receipt: {
          invocationId: command.invocationId,
          ...(command.controlId == null ? {} : { controlId: command.controlId }),
          action: command.action,
          status: 'failed',
          createdAt: variables.submittedAt,
          updatedAt: new Date().toISOString(),
          ...(command.message == null ? {} : { message: command.message }),
          reason: failedControlReason(inaccessible, retryable),
        },
        ...(retryable ? { retry: command } : {}),
      });
      if (controlSelectionRef.current !== submittedSelection) return;
      controlInFlightRef.current = false;
      if (inaccessible) {
        setControlInaccessible(true);
        setControlsClosed(true);
      }
    },
  });

  useEffect(() => {
    if (transientControl == null) return;
    const durableReceipt = data?.controlReceipts?.find(
      (receipt) => receipt.invocationId === transientControl.invocationId,
    );
    if (durableReceipt == null) return;
    /** The durable view is authoritative after refresh. Drop mutation-only state
     * once the same invocation appears there so stale failure/retry UI cannot
     * outlive a successfully persisted receipt. */
    if (
      retryControl != null &&
      retryControl.action !== 'cancel' &&
      retryControl.action !== 'cancel_message' &&
      (durableReceipt.status === 'accepted' || durableReceipt.status === 'applied')
    ) {
      setControlMessage((current) => (current === retryControl.message ? '' : current));
    }
    if (closesTaskControls(durableReceipt)) setControlsClosed(true);
    setControlState(null);
  }, [data?.controlReceipts, retryControl, setControlState, transientControl]);

  useEffect(() => {
    if (data?.controlReceipts?.some(closesTaskControls)) {
      setControlsClosed(true);
    }
  }, [data?.controlReceipts]);

  const submitControl = useCallback(
    (action: SubagentControlAction, controlId?: string, retry?: SubagentControlRequest) => {
      if (
        selection.durable == null ||
        controlTask.isLoading ||
        controlInFlightRef.current ||
        (retryControl != null && retry == null)
      ) {
        return;
      }
      let command: SubagentControlRequest;
      if (retry != null) {
        command = retry;
      } else if (action === 'cancel_message') {
        command = {
          taskId: selection.durable.taskId,
          invocationId: v4(),
          action,
          controlId,
        };
      } else if (action === 'cancel') {
        command = {
          taskId: selection.durable.taskId,
          invocationId: v4(),
          action,
        };
      } else {
        command = {
          taskId: selection.durable.taskId,
          invocationId: v4(),
          action,
          message: controlMessage.trim(),
        };
      }
      if (
        action !== 'cancel' &&
        action !== 'cancel_message' &&
        (command.message == null || command.message === '')
      ) {
        return;
      }
      const now = new Date().toISOString();
      setControlState({
        receipt: {
          invocationId: command.invocationId,
          ...(command.controlId == null ? {} : { controlId: command.controlId }),
          action: command.action,
          status: 'submitted',
          createdAt: now,
          updatedAt: now,
          ...(command.message == null ? {} : { message: command.message }),
        },
        retry: command,
      });
      controlInFlightRef.current = true;
      controlTask.mutate({
        parentConversationId: selection.parentConversationId,
        threadId: selection.durable.threadId,
        command,
        submittedAt: now,
      });
    },
    [
      controlMessage,
      controlTask,
      retryControl,
      selection.durable,
      selection.parentConversationId,
      setControlState,
    ],
  );

  const close = useCallback(() => {
    resetSelection();
    requestAnimationFrame(() => {
      const trigger = Array.from(
        document.querySelectorAll<HTMLElement>('[data-subagent-tool-call]'),
      ).find(
        (element) =>
          element.dataset.subagentToolCall === selection.toolCallId &&
          element.dataset.subagentParentMessage === selection.parentMessageId &&
          element.dataset.subagentPartIndex === String(selection.partIndex),
      );
      trigger?.focus();
    });
  }, [resetSelection, selection.parentMessageId, selection.partIndex, selection.toolCallId]);

  useFocusTrap(panelRef, isMobile, close);

  useEffect(() => {
    const activeElement = document.activeElement;
    if (!isMobile || !(activeElement instanceof HTMLElement)) return;
    return () => {
      if (activeElement.isConnected) activeElement.focus();
    };
  }, [isMobile]);

  const liveActivity = useMemo(
    () =>
      adaptLivePersistedActivity({
        title: foregroundTitle,
        prompt: selection.prompt,
        progress,
        persistedContent: selection.persistedContent,
        isDetached: selection.durable != null,
        legacyOutput: selection.legacyOutput,
        // A detached parent tool step closes as soon as dispatch succeeds;
        // its terminal status does not describe the still-running child.
        initialProgress: selection.durable == null ? selection.initialProgress : 0,
        isSubmitting: selection.durable == null ? selection.isSubmitting : detachedLiveSubmitting,
        runStepStatus: selection.durable == null ? selection.runStepStatus : undefined,
        reasoningVisibility: selection.durable == null ? 'visible' : 'marker',
      }),
    [detachedLiveSubmitting, foregroundTitle, progress, selection],
  );
  const activity = useMemo(() => {
    if (selection.durable == null) return liveActivity;
    if (data == null) {
      const activityWithoutData =
        progress == null ? { ...liveActivity, status: 'dispatched' as const } : liveActivity;
      return transientControl == null
        ? activityWithoutData
        : { ...activityWithoutData, controls: [transientControl] };
    }
    const durable = adaptDurableThreadActivity(data, selection.durable.taskId);
    const useLiveItems =
      (durable.status === 'running' || durable.status === 'dispatched') &&
      liveActivity.items.length > 0;
    const mergedItems =
      !useLiveItems && durable.items.length > 0 ? durable.items : liveActivity.items;
    const merged = {
      ...durable,
      prompt: durable.prompt ?? liveActivity.prompt,
      items: mergedItems,
    };
    if (
      transientControl == null ||
      (merged.controls ?? []).some(
        (receipt) => receipt.invocationId === transientControl.invocationId,
      )
    ) {
      return merged;
    }
    return { ...merged, controls: [...(merged.controls ?? []), transientControl] };
  }, [data, liveActivity, progress, selection.durable, transientControl]);
  const taskInaccessible = controlInaccessible || transientControl?.reason === 'task_inaccessible';
  const controlAvailable =
    selection.durable != null && data?.status === 'running' && !taskInaccessible && !controlsClosed;
  const controlPending =
    controlTask.isLoading || transientControl?.status === 'submitted' || retryControl != null;
  const showControlFooter =
    controlAvailable || retryControl != null || transientControl?.reason === 'task_inaccessible';
  const canContinueAsChat =
    selection.host === 'conversation' &&
    selection.durable != null &&
    data?.subagentKind === 'agent' &&
    data.agentId != null &&
    data.status === 'completed' &&
    subagentThreadHasTaskEvidence(data, taskId) &&
    data.messages.some((message) => message.messageId === `${taskId}:assistant`);

  const continueAsChat = useCallback(() => {
    if (!canContinueAsChat || selection.durable == null) return;
    continueChat.mutate({
      conversationId: selection.durable.threadId,
      messageId: `${selection.durable.taskId}:assistant`,
      option: ForkOptions.DIRECT_PATH,
    });
  }, [canContinueAsChat, continueChat, selection.durable]);
  const selectActor = useCallback(
    (nextThreadId: string) => {
      const next = eventSiblings.find((child) => child.threadId === nextThreadId);
      if (next == null) return;
      const nextSelection = eventSubagentSelection(
        selection.parentConversationId,
        next,
        selection.event?.siblingParentMessageIds,
      );
      if (nextSelection != null) setSelection(nextSelection);
    },
    [
      eventSiblings,
      selection.event?.siblingParentMessageIds,
      selection.parentConversationId,
      setSelection,
    ],
  );
  let panelState: 'ready' | 'loading' | 'error' = 'ready';
  if (
    selection.durable != null &&
    liveActivity.items.length === 0 &&
    (isLoading || isReadinessPending)
  ) {
    panelState = 'loading';
  } else if (selection.durable != null && liveActivity.items.length === 0 && isError) {
    panelState = 'error';
  }
  const renderEventTask = (task: ParentSubagentTaskSummary) => {
    if (task.taskId === taskId) {
      return (
        <SubagentActivity
          key={task.taskId}
          activityId={`${selection.parentMessageId}\u0000${selection.toolCallId}\u0000${task.taskId}`}
          activity={activity}
          state={panelState}
          embedded
          onCancelControl={
            controlAvailable && !controlPending
              ? (controlId) => submitControl('cancel_message', controlId)
              : undefined
          }
        />
      );
    }
    return (
      <HistoricalEventTaskActivity
        key={task.taskId}
        selection={selection}
        task={task}
        title={activity.title}
      />
    );
  };
  const loadEarlierEventTasks = () => {
    setEventTaskWindow({
      threadId,
      count: Math.min(eventTaskCount, visibleEventTaskCount + EVENT_TASK_PAGE_SIZE),
      taskCount: eventTaskCount,
    });
  };
  let timelinePrefix: ReactNode = null;
  if (hasEarlierRetainedTasks) {
    timelinePrefix = (
      <div className="flex justify-center border-b border-border-light px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={loadEarlierEventTasks}>
          {localize('com_ui_load_more')}
        </Button>
      </div>
    );
  } else if (eventSummary?.tasksTruncated) {
    timelinePrefix = (
      <div
        role="note"
        className="border-b border-border-light px-4 py-3 text-sm text-text-secondary"
      >
        {localize('com_ui_subagent_thread_history_truncated')}
      </div>
    );
  }

  return (
    <aside
      ref={panelRef}
      role={isMobile ? 'dialog' : 'region'}
      aria-modal={isMobile || undefined}
      aria-label={localize('com_ui_subagent_thread_panel')}
      className="flex h-full w-full flex-col overflow-hidden bg-surface-primary-alt text-text-primary"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border-light px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-tertiary">
          <Bot size={17} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold" title={activity.title}>
            {activity.title}
          </h2>
        </div>
        {canContinueAsChat && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={continueAsChat}
            disabled={continueChat.isLoading}
            aria-label={localize('com_ui_continue_chat')}
            className="h-8 shrink-0 gap-1.5"
          >
            <MessagesSquare size={15} aria-hidden="true" />
            <span className="hidden sm:inline">{localize('com_ui_continue_chat')}</span>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label={localize('com_ui_close')}
          className="h-8 w-8 shrink-0"
        >
          <X size={17} aria-hidden="true" />
        </Button>
      </header>

      {selection.event != null && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-light px-4 py-2">
          <div className="min-w-0 flex-1">
            <Select value={threadId} onValueChange={selectActor}>
              <SelectTrigger className="h-8" aria-label={localize('com_ui_subagent_actor')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eventSiblings.map((child) => (
                  <SelectItem
                    key={child.threadId}
                    value={child.threadId}
                    disabled={!child.latestTaskId}
                  >
                    {child.agentId != null && agentsMap?.[child.agentId]?.name
                      ? agentsMap[child.agentId]?.name
                      : child.actorId || child.title}
                    {child.actorId != null && agentsMap?.[child.agentId ?? '']?.name
                      ? ` · ${child.actorId}`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Keep the foreground panel's existing nested-tool approval controls
          coordinated within this invocation. Detached activity projections
          never include approval payloads. */}
      <ApprovalProvider
        key={`${selection.parentMessageId}\u0000${selection.toolCallId}\u0000${selection.partIndex}`}
      >
        {selection.event != null && (eventSummary?.tasks.length ?? 0) > 1 ? (
          <SubagentActivityScrollSurface padded={false}>
            <div data-subagent-thread-timeline>
              {timelinePrefix}
              {visibleEventTasks.map(renderEventTask)}
            </div>
          </SubagentActivityScrollSurface>
        ) : (
          <SubagentActivity
            key={`${selection.parentMessageId}\u0000${selection.toolCallId}\u0000${selection.partIndex}`}
            activityId={`${selection.parentMessageId}\u0000${selection.toolCallId}\u0000${selection.partIndex}`}
            activity={activity}
            state={panelState}
            onCancelControl={
              controlAvailable && !controlPending
                ? (controlId) => submitControl('cancel_message', controlId)
                : undefined
            }
          />
        )}
      </ApprovalProvider>
      {showControlFooter && (
        <div className="shrink-0 border-t border-border-light p-3">
          {transientControl?.status === 'failed' && (
            <Alert variant="error" className="mb-2 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                {localize(failedControlLocaleKey(transientControl.reason))}
              </span>
              {retryControl != null && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={controlTask.isLoading}
                  onClick={() =>
                    submitControl(retryControl.action, retryControl.controlId, retryControl)
                  }
                >
                  {localize('com_ui_retry')}
                </Button>
              )}
            </Alert>
          )}
          {controlAvailable && (
            <>
              <Textarea
                value={controlMessage}
                onChange={(event) => setControlMessage(event.target.value)}
                placeholder={localize('com_ui_subagent_control_placeholder')}
                aria-label={localize('com_ui_subagent_control_message')}
                maxLength={4 * 1024}
                rows={2}
                disabled={controlPending}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={controlPending || controlMessage.trim() === ''}
                  onClick={() => submitControl('steer')}
                >
                  <CornerDownRight size={14} aria-hidden />
                  {localize('com_ui_steer')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={controlPending || controlMessage.trim() === ''}
                  onClick={() => submitControl('queue')}
                >
                  <ListEnd size={14} aria-hidden />
                  {localize('com_ui_queue')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={controlPending || controlMessage.trim() === ''}
                  onClick={() => submitControl('interrupt')}
                >
                  <Zap size={14} aria-hidden />
                  {localize('com_ui_subagent_interrupt')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={controlPending}
                  onClick={() => submitControl('cancel')}
                  className="ml-auto text-status-error"
                >
                  <OctagonX size={14} aria-hidden />
                  {localize('com_ui_subagent_cancel_task')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function HistoricalEventTaskActivity({
  selection,
  task,
  title,
}: {
  selection: ActiveSubagentPanel;
  task: ParentSubagentTaskSummary;
  title: string;
}) {
  const threadId = selection.durable?.threadId ?? '';
  const { data, isLoading, isError, isReadinessPending } = useSubagentThreadQuery(
    selection.parentConversationId,
    threadId,
    task.taskId,
  );
  const activity = useMemo(
    () =>
      data == null
        ? { title, status: task.status, items: [], controls: [] }
        : adaptDurableThreadActivity(data, task.taskId),
    [data, task.status, task.taskId, title],
  );
  let state: 'ready' | 'loading' | 'error' = 'ready';
  if (isError) {
    state = 'error';
  } else if (isLoading || isReadinessPending) {
    state = 'loading';
  }

  return (
    <SubagentActivity
      activityId={`${selection.parentMessageId}\u0000${selection.toolCallId}\u0000${task.taskId}`}
      activity={activity}
      state={state}
      embedded
    />
  );
}
