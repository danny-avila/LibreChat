import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 } from 'uuid';
import { ListEnd, OctagonX, X, Zap } from 'lucide-react';
import { dataService, ForkOptions } from 'librechat-data-provider';
import {
  Alert,
  Button,
  Composer,
  ControlCombobox,
  useMediaQuery,
  useToastContext,
} from '@librechat/client';
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from 'recoil';
import type {
  ParentSubagentTaskSummary,
  SubagentControlAction,
  SubagentControlReceipt,
  SubagentControlRequest,
} from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { ActiveSubagentPanel, SubagentControlUiState } from '~/store/subagents';
import type { OptionWithIcon } from '~/common';
import {
  adaptDurableThreadActivity,
  adaptDurableThreadConversation,
  adaptLivePersistedActivity,
  mergeChildConversationTurns,
  retainBoundedMovingWindowTurns,
} from './adapters';
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
import ApprovalProvider from '~/components/Chat/Messages/Content/ApprovalContext';
import { useFocusTrap, useLocalize, useNavigateToConvo } from '~/hooks';
import { useParentSubagents } from './ParentSubagentsProvider';
import SubagentConversation from './SubagentConversation';
import { eventSubagentSelection } from './eventSelection';
import { renderAgentAvatar, setDraft } from '~/utils';
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
  const selectedEventActor = eventSiblings.find((child) => child.threadId === threadId);
  const selectedEventActorName =
    (selectedEventActor?.agentId == null
      ? undefined
      : agentsMap?.[selectedEventActor.agentId]?.name) ??
    selectedEventActor?.actorId ??
    eventSummary?.actorId ??
    foregroundTitle;
  const { data, isLoading, isError, isPreviousData, isReadinessPending, refetch } =
    useSubagentThreadQuery(selection.parentConversationId, threadId, taskId, {
      /** A new delivery re-keys this query to its task. Keeping the previous
       *  thread view mounted while the fresh one loads stops the whole panel
       *  from flashing back to a loading dot on every incoming event. */
      keepPreviousData: true,
      ...(eventTaskRunning ? { refetchInterval: ACTIVE_THREAD_REFRESH_MS } : {}),
    });
  /** Retention crosses every key change, including actor switches. A retained
   *  view is only meaningful while it describes the SAME child thread; within
   *  that thread its turn/history rows stay valid across task re-keys, while
   *  task-scoped fields (selected activity, status, control receipts) must not
   *  be attributed to the newly selected task. */
  const threadView = data?.threadId === threadId ? data : undefined;
  const taskView = isPreviousData ? undefined : threadView;
  const latestHistoryGeneration = JSON.stringify([
    threadView?.nextCursor ?? null,
    ...(threadView?.turns?.map((turn) => turn.taskId) ?? []),
  ]);
  const latestHistoryGenerationRef = useRef(latestHistoryGeneration);
  latestHistoryGenerationRef.current = latestHistoryGeneration;
  const durableTerminal =
    subagentThreadHasTaskEvidence(taskView, taskId) &&
    (taskView?.status === 'completed' ||
      taskView?.status === 'failed' ||
      taskView?.status === 'interrupted' ||
      taskView?.status === 'cancelled');
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
      selection.event.pinnedTask === true ||
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

  const [controlMessage, setControlMessage] = useState('');
  /** The draft as it stood when the continuation was requested. The fork lands
   *  after an async round trip, and the composer is unmounted by then. */
  const continuedDraftRef = useRef('');
  const continueChat = useForkConvoMutation({
    onSuccess: (result) => {
      const continuedConversationId = result.conversation?.conversationId;
      /** The server keeps child threads view-only (`CHILD_THREAD_READ_ONLY_ERROR`),
       *  so a continuation is a real conversation forked from the thread. Hand it
       *  the draft through the same per-conversation draft store the composer
       *  restores from, rather than dropping what the reader typed. */
      if (continuedConversationId != null && continuedDraftRef.current !== '') {
        setDraft({
          id: continuedConversationId,
          value: continuedDraftRef.current,
          persistExact: true,
        });
      }
      continuedDraftRef.current = '';
      resetSelection();
      navigateToConvo(result.conversation);
    },
    onError: () => {
      /** The panel stays open on a failed continuation, so give the reader back
       *  the draft it was sent with — unless they have started typing again. */
      const attempted = continuedDraftRef.current;
      continuedDraftRef.current = '';
      if (attempted !== '') setControlMessage((current) => (current === '' ? attempted : current));
      showToast({ message: localize('com_ui_continue_chat_error'), status: 'error' });
    },
  });
  const [turnDetailOverrides, setTurnDetailOverrides] = useState(
    () => new Map<string, ReturnType<typeof adaptDurableThreadActivity>>(),
  );
  const [turnDetailStates, setTurnDetailStates] = useState(
    () => new Map<string, 'idle' | 'loading' | 'unavailable' | 'error'>(),
  );
  const [olderTurns, setOlderTurns] = useState<ReturnType<typeof adaptDurableThreadConversation>>(
    [],
  );
  const [movingWindowTurns, setMovingWindowTurns] = useState<
    ReturnType<typeof adaptDurableThreadConversation>
  >([]);
  const [rebaseTurns, setRebaseTurns] = useState<ReturnType<typeof adaptDurableThreadConversation>>(
    [],
  );
  const [postRebaseTurns, setPostRebaseTurns] = useState<
    ReturnType<typeof adaptDurableThreadConversation>
  >([]);
  const postRebaseTurnsRef = useRef(postRebaseTurns);
  const [historyRebaseActive, setHistoryRebaseActive] = useState(false);
  const historyRebaseActiveRef = useRef(historyRebaseActive);
  const [historyCursor, setHistoryCursor] = useState<string | null | undefined>(undefined);
  const [historyCursorGeneration, setHistoryCursorGeneration] = useState<string>();
  const [historyState, setHistoryState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [historyBoundaryUnavailable, setHistoryBoundaryUnavailable] = useState(false);
  const activeThreadRef = useRef(threadId);
  const selectionThreadRef = useRef(threadId);
  const selectionGenerationRef = useRef(0);
  /** Locally retained turn buffers reset in a passive effect; until it has run
   *  for the current thread they still hold the previous thread's turns and
   *  must not render. Stamped inside that reset effect. */
  const retainedTurnsGenerationRef = useRef(0);
  const turnDetailRequestsRef = useRef(new Set<string>());
  const historyRequestRef = useRef<string | null>(null);
  const historyHasLoadedRef = useRef(false);
  if (selectionThreadRef.current !== threadId) {
    selectionThreadRef.current = threadId;
    selectionGenerationRef.current += 1;
  }
  activeThreadRef.current = threadId;
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

  useEffect(() => {
    setTurnDetailOverrides(new Map());
    setTurnDetailStates(new Map());
    setOlderTurns([]);
    setMovingWindowTurns([]);
    setRebaseTurns([]);
    setPostRebaseTurns([]);
    retainedTurnsGenerationRef.current = selectionGenerationRef.current;
    postRebaseTurnsRef.current = [];
    setHistoryRebaseActive(false);
    historyRebaseActiveRef.current = false;
    setHistoryCursor(undefined);
    setHistoryCursorGeneration(undefined);
    setHistoryState('idle');
    setHistoryBoundaryUnavailable(false);
    turnDetailRequestsRef.current.clear();
    historyRequestRef.current = null;
    historyHasLoadedRef.current = false;
  }, [threadId]);

  useEffect(() => {
    if (
      threadView != null &&
      (threadView.historyUnavailable === true ||
        (threadView.historyTruncated === true && threadView.nextCursor == null))
    ) {
      setHistoryBoundaryUnavailable(true);
    }
  }, [threadView]);

  const loadTurnDetails = useCallback(
    async (detailTaskId: string) => {
      const requestedThreadId = threadId;
      const requestedGeneration = selectionGenerationRef.current;
      const requestKey = `${requestedGeneration}\u0000${requestedThreadId}\u0000${detailTaskId}`;
      if (
        turnDetailStates.get(detailTaskId) === 'loading' ||
        turnDetailRequestsRef.current.has(requestKey)
      ) {
        return;
      }
      turnDetailRequestsRef.current.add(requestKey);
      setTurnDetailStates((current) => new Map(current).set(detailTaskId, 'loading'));
      try {
        const exact = await dataService.getSubagentThread(
          selection.parentConversationId,
          requestedThreadId,
          detailTaskId,
        );
        if (
          activeThreadRef.current !== requestedThreadId ||
          selectionGenerationRef.current !== requestedGeneration
        ) {
          return;
        }
        if (!subagentThreadHasTaskEvidence(exact, detailTaskId)) {
          setTurnDetailStates((current) => new Map(current).set(detailTaskId, 'unavailable'));
          return;
        }
        const detail = adaptDurableThreadActivity(exact, detailTaskId);
        setTurnDetailOverrides((current) => new Map(current).set(detailTaskId, detail));
        setTurnDetailStates((current) =>
          new Map(current).set(
            detailTaskId,
            detail.activityTruncated === true ? 'unavailable' : 'idle',
          ),
        );
      } catch {
        if (
          activeThreadRef.current !== requestedThreadId ||
          selectionGenerationRef.current !== requestedGeneration
        ) {
          return;
        }
        setTurnDetailStates((current) => new Map(current).set(detailTaskId, 'error'));
      } finally {
        turnDetailRequestsRef.current.delete(requestKey);
      }
    },
    [selection.parentConversationId, threadId, turnDetailStates],
  );
  const loadEarlierHistory = useCallback(async () => {
    const requestedThreadId = threadId;
    const requestedSelectionGeneration = selectionGenerationRef.current;
    const requestedGeneration = historyRebaseActive
      ? (historyCursorGeneration ?? latestHistoryGeneration)
      : latestHistoryGeneration;
    const startsRebase =
      !historyRebaseActive &&
      historyCursor !== undefined &&
      historyCursorGeneration !== requestedGeneration;
    const recoveringRebase = startsRebase || historyRebaseActive;
    const cursor =
      historyCursor === undefined || startsRebase ? threadView?.nextCursor : historyCursor;
    const requestKey = `${requestedSelectionGeneration}\u0000${requestedThreadId}\u0000${cursor ?? ''}\u0000${requestedGeneration}`;
    if (cursor == null || historyState === 'loading' || historyRequestRef.current != null) {
      return;
    }
    historyRequestRef.current = requestKey;
    setHistoryState('loading');
    try {
      const page = await dataService.getSubagentThread(
        selection.parentConversationId,
        requestedThreadId,
        undefined,
        cursor,
      );
      if (
        activeThreadRef.current !== requestedThreadId ||
        selectionGenerationRef.current !== requestedSelectionGeneration
      ) {
        return;
      }
      if (!historyRebaseActive && latestHistoryGenerationRef.current !== requestedGeneration) {
        setHistoryState('idle');
        return;
      }
      const pageTurns = adaptDurableThreadConversation(page);
      let recoveryCompleted = false;
      if (recoveringRebase) {
        const bridgeTurns = startsRebase
          ? retainBoundedMovingWindowTurns(movingWindowTurns, rebaseTurns)
          : movingWindowTurns;
        const nextRebaseTurns = mergeChildConversationTurns(
          pageTurns,
          startsRebase ? [] : rebaseTurns,
        );
        const retainedTaskIds = new Set(
          mergeChildConversationTurns(olderTurns, bridgeTurns, postRebaseTurnsRef.current).map(
            (turn) => turn.taskId,
          ),
        );
        const reconnected = pageTurns.some((turn) => retainedTaskIds.has(turn.taskId));
        const recoveryComplete = reconnected || page.nextCursor == null;
        if (recoveryComplete) {
          recoveryCompleted = true;
          const retainedPostRebaseTurns = postRebaseTurnsRef.current;
          postRebaseTurnsRef.current = [];
          setOlderTurns((current) =>
            mergeChildConversationTurns(
              current,
              bridgeTurns,
              nextRebaseTurns,
              retainedPostRebaseTurns,
            ),
          );
          setMovingWindowTurns([]);
          setRebaseTurns([]);
          setPostRebaseTurns([]);
          setHistoryRebaseActive(false);
          historyRebaseActiveRef.current = false;
        } else {
          if (startsRebase) setMovingWindowTurns(bridgeTurns);
          setRebaseTurns(nextRebaseTurns);
          setHistoryRebaseActive(true);
          historyRebaseActiveRef.current = true;
        }
      } else {
        setOlderTurns((current) => mergeChildConversationTurns(pageTurns, current));
      }
      historyHasLoadedRef.current = true;
      setHistoryCursor(page.nextCursor ?? null);
      setHistoryCursorGeneration(
        recoveryCompleted ? latestHistoryGenerationRef.current : requestedGeneration,
      );
      setHistoryBoundaryUnavailable(
        (current) =>
          current ||
          page.historyUnavailable === true ||
          (page.historyTruncated && page.nextCursor == null),
      );
      setHistoryState('idle');
    } catch {
      if (
        activeThreadRef.current !== requestedThreadId ||
        selectionGenerationRef.current !== requestedSelectionGeneration
      ) {
        return;
      }
      setHistoryState('error');
    } finally {
      if (historyRequestRef.current === requestKey) historyRequestRef.current = null;
    }
  }, [
    threadView?.nextCursor,
    historyCursor,
    historyCursorGeneration,
    historyRebaseActive,
    historyState,
    latestHistoryGeneration,
    movingWindowTurns,
    olderTurns,
    rebaseTurns,
    selection.parentConversationId,
    threadId,
  ]);

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
    const durableReceipt = taskView?.controlReceipts?.find(
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
  }, [retryControl, setControlState, taskView?.controlReceipts, transientControl]);

  useEffect(() => {
    if (taskView?.controlReceipts?.some(closesTaskControls)) {
      setControlsClosed(true);
    }
  }, [taskView?.controlReceipts]);

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
      }),
    [detachedLiveSubmitting, foregroundTitle, progress, selection],
  );
  const activity = useMemo(() => {
    if (selection.durable == null) return liveActivity;
    if (taskView == null) {
      const activityWithoutData =
        progress == null ? { ...liveActivity, status: 'dispatched' as const } : liveActivity;
      return transientControl == null
        ? activityWithoutData
        : { ...activityWithoutData, controls: [transientControl] };
    }
    const durable = adaptDurableThreadActivity(taskView, selection.durable.taskId);
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
  }, [liveActivity, progress, selection.durable, taskView, transientControl]);
  const panelTitle = selection.event == null ? activity.title : selectedEventActorName;
  const actorOptions = useMemo<OptionWithIcon[]>(() => {
    if (selection.event == null) return [];
    return (
      eventSiblings
        /** An actor with no task has nothing to open, and this list has no
         *  disabled state — leave it out rather than offering a dead row. The
         *  selected thread stays listed whatever the index currently says. */
        .filter((child) => child.latestTaskId != null || child.threadId === threadId)
        .map((child) => {
          const agent = child.agentId == null ? undefined : agentsMap?.[child.agentId];
          const name = agent?.name || child.actorId || child.title;
          return {
            value: child.threadId,
            label:
              agent?.name != null && child.actorId != null ? `${name} · ${child.actorId}` : name,
            icon: renderAgentAvatar(agent, { size: 'icon', showBorder: false }),
          };
        })
    );
  }, [agentsMap, eventSiblings, selection.event, threadId]);
  const selectedActorLabel =
    actorOptions.find((option) => option.value === threadId)?.label ?? panelTitle;
  const selectedActorAgentId = selectedEventActor?.agentId ?? threadView?.agentId;
  const selectedActorIcon = renderAgentAvatar(
    selectedActorAgentId == null ? undefined : agentsMap?.[selectedActorAgentId],
    { size: 'icon', showBorder: false },
  );
  const latestConversationTurns = useMemo(
    () => (threadView == null ? [] : adaptDurableThreadConversation(threadView)),
    [threadView],
  );
  const previousLatestTurnsRef = useRef({
    threadId,
    generation: latestHistoryGeneration,
    turns: latestConversationTurns,
  });
  useEffect(() => {
    if (threadView == null) return;
    const previous = previousLatestTurnsRef.current;
    if (previous.threadId === threadId) {
      const latestTaskIds = new Set(latestConversationTurns.map((turn) => turn.taskId));
      const displaced = previous.turns.filter((turn) => !latestTaskIds.has(turn.taskId));
      if (displaced.length > 0 && historyHasLoadedRef.current) {
        if (historyRebaseActiveRef.current) {
          const retained = retainBoundedMovingWindowTurns(postRebaseTurnsRef.current, displaced);
          postRebaseTurnsRef.current = retained;
          setPostRebaseTurns(retained);
        } else {
          setMovingWindowTurns((current) => retainBoundedMovingWindowTurns(current, displaced));
        }
      }
    }
    previousLatestTurnsRef.current = {
      threadId,
      generation: latestHistoryGeneration,
      turns: latestConversationTurns,
    };
  }, [historyRebaseActive, latestConversationTurns, latestHistoryGeneration, threadId, threadView]);
  const retainedTurnsValid = retainedTurnsGenerationRef.current === selectionGenerationRef.current;
  const conversationTurns = useMemo(() => {
    const durableTurns = retainedTurnsValid
      ? mergeChildConversationTurns(
          olderTurns,
          movingWindowTurns,
          rebaseTurns,
          postRebaseTurns,
          latestConversationTurns,
        )
      : mergeChildConversationTurns(latestConversationTurns);
    if (durableTurns.length > 0) {
      const selectedTurnIndex = durableTurns.findIndex((turn) => turn.taskId === taskId);
      if (selectedTurnIndex >= 0) {
        return durableTurns.map((turn, index) => {
          const selected = index === selectedTurnIndex ? { ...turn, activity } : turn;
          const override = turnDetailOverrides.get(turn.taskId);
          return override == null ? selected : { ...selected, activity: override };
        });
      }
      /** A turn absent from the durable window is either the thread's newest
       *  delivery whose fetch has not landed yet (place it at the END, where
       *  it will settle — a new event must not appear at the top and then
       *  jump to the bottom) or an older selection displaced from the bounded
       *  window (keep it ahead of the retained newer continuation). */
      const indexedChild = byThreadId.get(threadId);
      const selectedTaskCreatedAt = indexedChild?.tasks.find(
        (task) => task.taskId === taskId,
      )?.createdAt;
      const synthesizedTurn = {
        taskId: taskId || `${selection.parentMessageId}:${selection.toolCallId}`,
        trigger: {
          kind:
            selection.event == null
              ? ('parent_continuation' as const)
              : ('external_event' as const),
          summary: selection.prompt ?? activity.prompt ?? '',
          ...(selectedTaskCreatedAt == null ? {} : { createdAt: selectedTaskCreatedAt }),
        },
        activity,
      };
      /** Order by trigger time when both sides carry one; the separately
       *  polled discovery index is only the fallback authority, since it can
       *  briefly lag or lead the thread view. */
      const lastDurableCreatedAt = durableTurns[durableTurns.length - 1]?.trigger.createdAt;
      const appendSynthesized =
        selectedTaskCreatedAt != null && lastDurableCreatedAt != null
          ? selectedTaskCreatedAt >= lastDurableCreatedAt
          : indexedChild?.latestTaskId === taskId;
      const retained = appendSynthesized
        ? [...durableTurns, synthesizedTurn]
        : [synthesizedTurn, ...durableTurns];
      return retained.map((turn) => {
        const override = turnDetailOverrides.get(turn.taskId);
        return override == null ? turn : { ...turn, activity: override };
      });
    }
    return [
      {
        taskId: taskId || `${selection.parentMessageId}:${selection.toolCallId}`,
        trigger: {
          kind:
            selection.event == null ? ('parent_dispatch' as const) : ('external_event' as const),
          summary: selection.prompt ?? activity.prompt ?? '',
        },
        activity,
      },
    ];
  }, [
    activity,
    byThreadId,
    latestConversationTurns,
    movingWindowTurns,
    olderTurns,
    postRebaseTurns,
    rebaseTurns,
    retainedTurnsValid,
    threadId,
    selection,
    taskId,
    turnDetailOverrides,
  ]);
  const effectiveTurnDetailStates = useMemo(() => {
    const states = new Map(turnDetailStates);
    if (activity.activityTruncated === true && taskId !== '') states.set(taskId, 'unavailable');
    return states;
  }, [activity.activityTruncated, taskId, turnDetailStates]);
  const historyCursorUsesLatest =
    !historyRebaseActive &&
    (historyCursor === undefined || historyCursorGeneration !== latestHistoryGeneration);
  const effectiveHistoryCursor = historyCursorUsesLatest ? threadView?.nextCursor : historyCursor;
  const showUnavailableHistoryBoundary =
    historyBoundaryUnavailable ||
    threadView?.historyUnavailable === true ||
    (historyCursorUsesLatest &&
      threadView?.historyTruncated === true &&
      threadView.nextCursor == null);
  /** During a rolling deployment an older API replica can omit `turns`. Keep
   * that response readable through the same deep activity renderer; every
   * current host otherwise enters the conversation-native rendering seam. */
  const hasConversationProjection =
    selection.durable == null || threadView == null || Array.isArray(threadView.turns);
  const taskInaccessible = controlInaccessible || transientControl?.reason === 'task_inaccessible';
  const controlAvailable =
    selection.durable != null &&
    taskView?.status === 'running' &&
    !taskInaccessible &&
    !controlsClosed;
  const controlPending =
    controlTask.isLoading || transientControl?.status === 'submitted' || retryControl != null;
  const showControlFooter =
    controlAvailable || retryControl != null || transientControl?.reason === 'task_inaccessible';
  const canContinueAsChat =
    selection.host === 'conversation' &&
    selection.durable != null &&
    taskView?.subagentKind === 'agent' &&
    taskView.agentId != null &&
    taskView.status === 'completed' &&
    subagentThreadHasTaskEvidence(taskView, taskId) &&
    taskView.messages.some((message) => message.messageId === `${taskId}:assistant`);

  const continueAsChat = useCallback(() => {
    if (!canContinueAsChat || selection.durable == null || continueChat.isLoading) return;
    continuedDraftRef.current = controlMessage.trim();
    setControlMessage('');
    continueChat.mutate({
      conversationId: selection.durable.threadId,
      messageId: `${selection.durable.taskId}:assistant`,
      option: ForkOptions.DIRECT_PATH,
    });
  }, [canContinueAsChat, continueChat, controlMessage, selection.durable]);
  /** `control` steers the live run, `continue` carries the thread into a chat
   *  of the reader's own. Both compose into the same field, with the same
   *  placeholder the main chat composer shows for this agent. */
  let composerMode: 'control' | 'continue' | null = null;
  if (controlAvailable) {
    composerMode = 'control';
  } else if (canContinueAsChat) {
    composerMode = 'continue';
  }
  const composerPlaceholder = localize('com_endpoint_message_new', { 0: panelTitle });
  const composerCanSubmit =
    composerMode === 'control'
      ? !controlPending && controlMessage.trim() !== ''
      : !continueChat.isLoading;
  const submitComposer = useCallback(() => {
    if (controlAvailable) {
      submitControl('steer');
      return;
    }
    continueAsChat();
  }, [continueAsChat, controlAvailable, submitControl]);
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
  } else if (eventSummary?.tasksTruncated === true) {
    timelinePrefix = (
      <div
        role="status"
        aria-label={localize('com_ui_subagent_thread_history_truncated')}
        className="flex h-7 items-center justify-center border-b border-border-light text-text-tertiary"
      >
        <span aria-hidden>•••</span>
      </div>
    );
  }
  const conversationStateByTask = useMemo(
    () => new Map([[taskId || conversationTurns[0]?.taskId || '', panelState] as const]),
    [conversationTurns, panelState, taskId],
  );

  let activityPanel: ReactNode;
  if (hasConversationProjection) {
    activityPanel = (
      <SubagentActivityScrollSurface padded={false}>
        {showUnavailableHistoryBoundary && (
          <div
            role="status"
            aria-label={localize('com_ui_subagent_thread_history_truncated')}
            className="flex h-7 items-center justify-center border-b border-border-light text-text-tertiary"
          >
            <span aria-hidden>•••</span>
          </div>
        )}
        {effectiveHistoryCursor != null && historyState !== 'error' && (
          <div className="flex justify-center border-b border-border-light px-4 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={historyState === 'loading'}
              onClick={() => void loadEarlierHistory()}
            >
              {historyState === 'loading'
                ? localize('com_ui_loading')
                : localize('com_ui_subagent_load_earlier_activity')}
            </Button>
          </div>
        )}
        {historyState === 'error' && (
          <div className="flex justify-center border-b border-border-light px-4 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadEarlierHistory()}
            >
              {localize('com_ui_retry')}
            </Button>
          </div>
        )}
        <SubagentConversation
          turns={conversationTurns}
          agentId={threadView?.agentId}
          conversationId={threadId || selection.parentConversationId}
          stateByTask={conversationStateByTask}
          controllableTaskId={
            controlAvailable && !controlPending ? selection.durable?.taskId : undefined
          }
          onCancelControl={(_controlledTaskId, controlId) =>
            submitControl('cancel_message', controlId)
          }
          detailStateByTask={effectiveTurnDetailStates}
          onLoadTurnDetails={loadTurnDetails}
        />
      </SubagentActivityScrollSurface>
    );
  } else if (
    selection.event != null &&
    ((eventSummary?.tasks.length ?? 0) > 1 || eventSummary?.tasksTruncated === true)
  ) {
    activityPanel = (
      <SubagentActivityScrollSurface padded={false}>
        <div data-subagent-thread-timeline>
          {timelinePrefix}
          {visibleEventTasks.map(renderEventTask)}
        </div>
      </SubagentActivityScrollSurface>
    );
  } else {
    activityPanel = (
      <SubagentActivity
        key={`${selection.parentMessageId}\u0000${selection.toolCallId}\u0000${selection.partIndex}`}
        activityId={`${selection.parentMessageId}\u0000${selection.toolCallId}\u0000${selection.partIndex}`}
        activity={activity}
        state={panelState}
        showPrompt={false}
        onCancelControl={
          controlAvailable && !controlPending
            ? (controlId) => submitControl('cancel_message', controlId)
            : undefined
        }
      />
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
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-light px-3">
        {actorOptions.length > 1 ? (
          /* The agent builder's picker, so switching actors here reads as the
             same control as every other agent selection in the app — avatar,
             searchable list, and the shared theming that comes with it. */
          <ControlCombobox
            isCollapsed={false}
            selectedValue={threadId}
            setValue={selectActor}
            displayValue={selectedActorLabel}
            selectPlaceholder={selectedActorLabel}
            searchPlaceholder={localize('com_agents_search_name')}
            ariaLabel={localize('com_ui_subagent_actor')}
            items={actorOptions}
            SelectIcon={selectedActorIcon}
            containerClassName="min-w-0 flex-1 px-0"
            className="h-9 w-full border-transparent bg-transparent font-semibold hover:bg-surface-hover"
            showCarat
          />
        ) : (
          <>
            {/* The `MessageRow` author-glyph slot, one size up: no plate
                behind it, so an agent avatar reads as the avatar it is. */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
              {selectedActorIcon}
            </div>
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={panelTitle}>
              {panelTitle}
            </h2>
          </>
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

      {/* Keep the foreground panel's existing nested-tool approval controls
          coordinated within this invocation. Detached activity projections
          never include approval payloads. */}
      <ApprovalProvider
        key={`${selection.parentMessageId}\u0000${selection.toolCallId}\u0000${selection.partIndex}`}
      >
        {activityPanel}
      </ApprovalProvider>
      {(showControlFooter || canContinueAsChat) && (
        <div className="shrink-0 p-3 pt-2">
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
          {composerMode != null && (
            /* One surface across the run's whole life. A settled thread swaps
               what Enter DOES, never the control the reader is looking at, so
               nothing under the pointer moves as the run completes. */
            <Composer
              value={controlMessage}
              onChange={setControlMessage}
              onSubmit={submitComposer}
              canSubmit={composerCanSubmit}
              disabled={composerMode === 'control' && controlPending}
              submitLabel={
                composerMode === 'control'
                  ? localize('com_ui_steer')
                  : localize('com_ui_subagent_continue_new_chat')
              }
              ariaLabel={localize('com_ui_message_input')}
              placeholder={composerPlaceholder}
              maxLength={4 * 1024}
              actions={
                composerMode === 'control' ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={controlPending || controlMessage.trim() === ''}
                      onClick={() => submitControl('queue')}
                      className="rounded-full"
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
                      className="rounded-full"
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
                      className="rounded-full text-status-error"
                    >
                      <OctagonX size={14} aria-hidden />
                      {localize('com_ui_subagent_cancel_task')}
                    </Button>
                  </>
                ) : null
              }
            />
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
      showPrompt={false}
      embedded
    />
  );
}
