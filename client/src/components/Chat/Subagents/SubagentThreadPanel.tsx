import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Bot, MessagesSquare, X } from 'lucide-react';
import { ForkOptions } from 'librechat-data-provider';
import { useRecoilValue, useResetRecoilState } from 'recoil';
import { Button, useMediaQuery, useToastContext } from '@librechat/client';
import type { ActiveSubagentPanel } from '~/store/subagents';
import {
  subagentThreadHasTaskEvidence,
  useForkConvoMutation,
  useSubagentThreadQuery,
} from '~/data-provider';
import {
  activeSubagentPanel,
  subagentProgressByToolCallId,
  subagentProgressKey,
} from '~/store/subagents';
import useSubagentActivityStream from '~/data-provider/Subagents/useSubagentActivityStream';
import { adaptDurableThreadActivity, adaptLivePersistedActivity } from './adapters';
import ApprovalProvider from '~/components/Chat/Messages/Content/ApprovalContext';
import { useFocusTrap, useLocalize, useNavigateToConvo } from '~/hooks';
import SubagentActivity from './SubagentActivity';

export default function SubagentThreadPanel({ selection }: { selection: ActiveSubagentPanel }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const resetSelection = useResetRecoilState(activeSubagentPanel);
  const progress = useRecoilValue(
    subagentProgressByToolCallId(
      subagentProgressKey(selection.parentMessageId, selection.toolCallId, selection.partIndex),
    ),
  );
  const foregroundTitle =
    selection.subagentType === 'self'
      ? localize('com_ui_subagent_dialog_title_self')
      : localize('com_ui_subagent_dialog_title', { 0: selection.subagentType });
  const threadId = selection.durable?.threadId ?? '';
  const taskId = selection.durable?.taskId ?? '';
  const { data, isLoading, isError, isReadinessPending } = useSubagentThreadQuery(
    selection.parentConversationId,
    threadId,
    taskId,
  );
  const durableTerminal =
    subagentThreadHasTaskEvidence(data, taskId) &&
    (data?.status === 'completed' ||
      data?.status === 'failed' ||
      data?.status === 'interrupted' ||
      data?.status === 'cancelled');
  useSubagentActivityStream(selection, !durableTerminal);
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
      return progress == null ? { ...liveActivity, status: 'dispatched' as const } : liveActivity;
    }
    const durable = adaptDurableThreadActivity(data, selection.durable.taskId);
    if (
      (durable.status === 'running' || durable.status === 'dispatched') &&
      liveActivity.items.length > 0
    ) {
      return {
        ...durable,
        prompt: durable.prompt ?? liveActivity.prompt,
        items: liveActivity.items,
      };
    }
    return {
      ...durable,
      prompt: durable.prompt ?? liveActivity.prompt,
      items: durable.items.length > 0 ? durable.items : liveActivity.items,
    };
  }, [data, liveActivity, progress, selection.durable]);
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

  return (
    <aside
      ref={panelRef}
      role={isMobile ? 'dialog' : 'region'}
      aria-modal={isMobile || undefined}
      aria-label={localize('com_ui_subagent_thread_panel')}
      className="flex h-full w-full flex-col overflow-hidden bg-surface-primary text-text-primary"
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

      {/* Keep the foreground panel's existing nested-tool approval controls
          coordinated within this invocation. Detached activity projections
          never include approval payloads. */}
      <ApprovalProvider
        key={`${selection.parentMessageId}\u0000${selection.toolCallId}\u0000${selection.partIndex}`}
      >
        <SubagentActivity
          key={`${selection.parentMessageId}\u0000${selection.toolCallId}\u0000${selection.partIndex}`}
          activity={activity}
          state={panelState}
        />
      </ApprovalProvider>
    </aside>
  );
}
