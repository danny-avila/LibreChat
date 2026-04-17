import { useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronRight, Users } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogDescription } from '@librechat/client';
import type { TAttachment, SubagentUpdateEvent } from 'librechat-data-provider';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { AttachmentGroup } from './Attachment';
import { useLocalize } from '~/hooks';
import { subagentProgressByToolCallId } from '~/store';
import { cn } from '~/utils';

interface SubagentCallProps {
  toolCallId: string;
  initialProgress: number;
  /** Accepted for parity with other *Call parts; not currently consumed. */
  isSubmitting?: boolean;
  args?: string | Record<string, unknown>;
  output?: string | null;
  attachments?: TAttachment[];
}

/**
 * Renders the parent's `subagent` tool call as a compact "what the child
 * is doing right now" ticker. Unlike a normal tool call, the body is a
 * rolling list of short text snippets — no arg JSON or tool output
 * formatting. Clicking opens a dialog with the full markdown result once
 * the child returns (and a list of all captured update events).
 *
 * Progress is sourced from the `subagentProgressByToolCallId` Recoil atom
 * family, populated by `useStepHandler` as `ON_SUBAGENT_UPDATE` SSE
 * envelopes arrive. The atom is keyed by the parent's `tool_call_id`.
 */
export default function SubagentCall({
  toolCallId,
  initialProgress,
  args,
  output,
  attachments,
}: SubagentCallProps) {
  const localize = useLocalize();
  const progress = useRecoilValue(subagentProgressByToolCallId(toolCallId));
  const [open, setOpen] = useState(false);

  const subagentType = progress?.subagentType ?? extractSubagentType(args);
  const running =
    initialProgress < 1 && progress?.status !== 'stop' && progress?.status !== 'error';

  /** Latest three status lines — short text-only ticker. */
  const recentLines = useMemo(() => {
    if (!progress?.events.length) {
      return running ? [localize('com_ui_subagent_waiting')] : [];
    }
    const labels = progress.events
      .slice(-6)
      .map((e) => e.label)
      .filter((l): l is string => typeof l === 'string' && l.length > 0);
    const tail = labels.slice(-3);
    return tail.length > 0 ? tail : [localize('com_ui_subagent_waiting')];
  }, [progress, running, localize]);

  const description = typeof args === 'string' ? tryDescription(args) : extractDescription(args);

  const headerText = running
    ? localize('com_ui_subagent_running', { 0: subagentType })
    : localize('com_ui_subagent_complete', { 0: subagentType });

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

        <ul className="space-y-0.5 pl-5 text-xs text-text-secondary">
          {recentLines.map((line, i) => (
            <li key={`${i}-${line}`} className="truncate">
              {line}
            </li>
          ))}
        </ul>
      </button>

      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogContent className="max-h-[80vh] w-full max-w-2xl overflow-hidden">
          <OGDialogTitle>
            {localize('com_ui_subagent_dialog_title', { 0: subagentType })}
          </OGDialogTitle>
          <OGDialogDescription className="text-sm text-text-secondary">
            {description || localize('com_ui_subagent_dialog_description')}
          </OGDialogDescription>

          <div className="mt-3 max-h-[60vh] overflow-y-auto">
            {progress?.events?.length ? (
              <div className="mb-4 rounded-md border border-border-light bg-surface-secondary p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  {localize('com_ui_subagent_activity_log')}
                </div>
                <ol className="space-y-1 text-xs text-text-secondary">
                  {progress.events.map((e, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-12 shrink-0 uppercase tracking-wide text-text-tertiary">
                        {shortPhase(e.phase)}
                      </span>
                      <span className="break-words">{e.label ?? e.phase}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {output ? (
              <div className="markdown prose dark:prose-invert max-w-none">
                <Markdown content={output} isLatestMessage={false} />
              </div>
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

function shortPhase(phase: SubagentUpdateEvent['phase']): string {
  switch (phase) {
    case 'start':
      return 'start';
    case 'stop':
      return 'end';
    case 'error':
      return 'error';
    case 'run_step':
      return 'step';
    case 'run_step_completed':
      return 'done';
    case 'run_step_delta':
      return 'delta';
    case 'message_delta':
      return 'msg';
    case 'reasoning_delta':
      return 'reason';
    default:
      return String(phase);
  }
}
