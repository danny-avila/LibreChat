import { useCallback, useEffect, useRef } from 'react';
import { useResetRecoilState } from 'recoil';
import { Button, Spinner, useMediaQuery } from '@librechat/client';
import { AlertCircle, Bot, CheckCircle2, Clock3, X, XCircle } from 'lucide-react';
import type { SubagentThreadStatus } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { ActiveSubagentPanel } from '~/store/subagents';
import type { TranslationKeys } from '~/hooks';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import { useSubagentThreadQuery } from '~/data-provider';
import { activeSubagentPanel } from '~/store/subagents';
import { useFocusTrap, useLocalize } from '~/hooks';
import { cn } from '~/utils';

const statusIcon = (status: SubagentThreadStatus) => {
  if (status === 'completed') return CheckCircle2;
  if (status === 'failed' || status === 'interrupted') return AlertCircle;
  if (status === 'cancelled') return XCircle;
  return Clock3;
};

const statusLabels: Record<SubagentThreadStatus, TranslationKeys> = {
  dispatched: 'com_ui_subagent_thread_status_dispatched',
  running: 'com_ui_subagent_thread_status_running',
  completed: 'com_ui_subagent_thread_status_completed',
  failed: 'com_ui_subagent_thread_status_failed',
  interrupted: 'com_ui_subagent_thread_status_interrupted',
  cancelled: 'com_ui_subagent_thread_status_cancelled',
};

export default function SubagentThreadPanel({ selection }: { selection: ActiveSubagentPanel }) {
  const localize = useLocalize();
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const resetSelection = useResetRecoilState(activeSubagentPanel);
  const { data, isLoading, isError, isReadinessPending } = useSubagentThreadQuery(
    selection.parentConversationId,
    selection.threadId,
    selection.taskId,
  );

  const close = useCallback(() => {
    resetSelection();
    requestAnimationFrame(() => {
      const trigger = Array.from(
        document.querySelectorAll<HTMLElement>('[data-subagent-tool-call]'),
      ).find((element) => element.dataset.subagentToolCall === selection.toolCallId);
      trigger?.focus();
    });
  }, [resetSelection, selection.toolCallId]);

  useFocusTrap(panelRef, isMobile, close);

  useEffect(() => {
    const activeElement = document.activeElement;
    if (!isMobile || !(activeElement instanceof HTMLElement)) return;
    return () => {
      if (activeElement.isConnected) activeElement.focus();
    };
  }, [isMobile]);

  const status = data?.status ?? 'dispatched';
  const StatusIcon = statusIcon(status);
  const title = data?.title ?? selection.subagentType;
  let panelBody: ReactNode;
  if (isLoading || isReadinessPending) {
    panelBody = (
      <div className="flex h-full items-center justify-center" role="status">
        <Spinner className="text-text-secondary" />
      </div>
    );
  } else if (isError) {
    panelBody = (
      <div className="rounded-lg border border-status-error-border bg-status-error-subtle p-3 text-sm text-status-error">
        {localize('com_ui_subagent_thread_load_error')}
      </div>
    );
  } else if (data?.messages.length === 0) {
    panelBody = (
      <div className="rounded-lg border border-border-light bg-surface-secondary p-3 text-sm text-text-secondary">
        {localize('com_ui_subagent_thread_empty')}
      </div>
    );
  } else {
    panelBody = (
      <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-[0.4375rem] before:top-3 before:w-px before:bg-border-medium">
        {data?.historyTruncated === true && (
          <li className="relative pl-7 text-xs text-text-secondary">
            <span className="absolute left-1 top-1 h-2 w-2 rounded-full bg-border-heavy" />
            {localize('com_ui_subagent_thread_history_truncated')}
          </li>
        )}
        {data?.messages.map((message) => (
          <li key={message.messageId} className="relative pl-7">
            <span
              className={cn(
                'absolute left-0 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-surface-primary',
                message.role === 'user' ? 'bg-status-info' : 'bg-status-success',
              )}
              aria-hidden="true"
            />
            <article className="rounded-lg border border-border-light bg-surface-secondary px-3 py-2.5">
              <div className="mb-1 text-xs font-medium text-text-secondary">
                {message.role === 'user'
                  ? localize('com_ui_subagent_thread_task')
                  : localize('com_ui_subagent_thread_response')}
              </div>
              <div className="prose-sm max-w-none break-words text-sm text-text-primary">
                <MarkdownLite content={message.text} codeExecution={false} />
              </div>
              {message.textTruncated === true && (
                <div className="mt-2 text-xs italic text-text-secondary">
                  {localize('com_ui_subagent_thread_message_truncated')}
                </div>
              )}
            </article>
          </li>
        ))}
      </ol>
    );
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
          <h2 className="truncate text-sm font-semibold" title={title}>
            {title}
          </h2>
          <div
            className={cn(
              'mt-0.5 flex items-center gap-1 text-xs text-text-secondary',
              status === 'failed' || status === 'interrupted' ? 'text-status-error' : '',
            )}
            aria-live="polite"
          >
            <StatusIcon size={13} aria-hidden="true" />
            <span>{localize(statusLabels[status])}</span>
          </div>
        </div>
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{panelBody}</div>
    </aside>
  );
}
