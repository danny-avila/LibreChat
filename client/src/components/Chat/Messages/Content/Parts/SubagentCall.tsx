import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { TAttachment, TMessage, TMessageContentParts } from 'librechat-data-provider';
import type { SubagentRun } from '~/store/subagents';
import {
  useSubagentRunView,
  subagentResultSummary,
  useThrottledValue,
  TickerLineView,
  SUBAGENT_TICKER_THROTTLE_MS,
  TICKER_PASSTHROUGH_CHARS,
} from './subagentShared';
import useOpenRightPanel from '~/hooks/useOpenRightPanel';
import MessageIcon from '~/components/Share/MessageIcon';
import { AttachmentGroup } from './Attachment';
import { useToolCallIntent } from './intent';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

interface SubagentCallProps {
  toolCallId: string;
  initialProgress: number;
  /** True while the parent run is still streaming. */
  isSubmitting?: boolean;
  args?: string | Record<string, unknown>;
  output?: string | null;
  attachments?: TAttachment[];
  /** Aggregated content parts the backend attached at message-save time.
   *  Takes precedence over the live atom so a refresh shows the same run. */
  persistedContent?: TMessageContentParts[];
  hideAttachments?: boolean;
}

type AttachmentFingerprintFields = Partial<TAttachment> & {
  file_id?: string;
  status?: string;
  text?: string | null;
  textFormat?: string | null;
  previewError?: string;
};

/**
 * Content signature for subagent attachments written into the detached-panel
 * registry. Deferred previews resolve in place: same array length, often the
 * same filepath/filename, while `status` / `text` / `textFormat` / `previewError`
 * change. A path-only key would leave the panel on the pre-resolution chip.
 * Text length (not body) keeps the signature bounded.
 */
function attachmentsFingerprint(attachments?: TAttachment[]): string {
  if (attachments == null || attachments.length === 0) {
    return '';
  }
  return attachments
    .map((attachment) => {
      const a = attachment as AttachmentFingerprintFields;
      return [
        a.filepath ?? '',
        a.filename ?? '',
        a.file_id ?? '',
        a.status ?? '',
        a.textFormat ?? '',
        a.previewError ?? '',
        String(a.text?.length ?? 0),
      ].join(':');
    })
    .join(',');
}

/**
 * Inline card for a parent `subagent` tool call. Reads like a first-class
 * sibling of the other tool cards (icon + status label + agent name), previews
 * a single live activity line while running and a one-line result summary once
 * done, and opens the run in the shared right-side {@link SubagentPanel} — no
 * dialog. Registers its static run data into `subagentRunsState` so the panel,
 * rendered far up the tree, can render a run it never received as props.
 */
export default function SubagentCall({
  toolCallId,
  initialProgress,
  isSubmitting = false,
  args,
  output,
  attachments,
  persistedContent,
  hideAttachments = false,
}: SubagentCallProps) {
  const localize = useLocalize();
  const { openSubagentRun, closeSubagentRun } = useOpenRightPanel();
  const setRuns = useSetRecoilState(store.subagentRunsState);
  const currentRunId = useRecoilValue(store.currentSubagentRunId);
  const isSelected = toolCallId !== '' && currentRunId === toolCallId;

  const runOverride: SubagentRun = {
    toolCallId,
    isSubmitting,
    args,
    output,
    attachments,
    persistedContent,
    initialProgress,
  };
  const view = useSubagentRunView(toolCallId, runOverride, isSubmitting);
  const { running, cancelled, hasError, subagentAgent, isSelfSpawn, contentParts, tickerLines } =
    view;

  /** Register into the shared registry so the panel can render this run.
   *  Guarded by a content signature (not object identity) so unstable prop
   *  refs from the parent renderer don't drive a write→render loop. */
  const lastWrittenRef = useRef<string>('');
  useEffect(() => {
    if (!toolCallId) return;
    const signature = [
      initialProgress,
      isSubmitting,
      typeof args === 'string' ? args : JSON.stringify(args ?? null),
      output ?? '',
      /** Approval interrupts replace nested parts without changing the array
       *  length. Fingerprint the content so the detached panel receives those
       *  same-length state transitions. */
      JSON.stringify(persistedContent ?? null),
      /** Deferred previews keep path/name while status/text resolve; see
       *  {@link attachmentsFingerprint}. */
      attachmentsFingerprint(attachments),
    ].join('|');
    if (signature === lastWrittenRef.current) return;
    lastWrittenRef.current = signature;
    setRuns((prev) => ({
      ...(prev ?? {}),
      [toolCallId]: {
        toolCallId,
        isSubmitting,
        args,
        output,
        attachments,
        persistedContent,
        initialProgress,
      },
    }));
  }, [
    toolCallId,
    isSubmitting,
    args,
    output,
    attachments,
    persistedContent,
    initialProgress,
    setRuns,
  ]);

  /** Auto-open the panel when a run first streams in — mirrors
   *  `ToolArtifactCard`. `isSubmitting` is captured once at first render so a
   *  history mount (page load, back-navigation) never steals focus. */
  const mountedDuringStreamRef = useRef(isSubmitting);
  const autoFocusedRef = useRef(false);
  useEffect(() => {
    if (!toolCallId || autoFocusedRef.current || !mountedDuringStreamRef.current) return;
    autoFocusedRef.current = true;
    openSubagentRun(toolCallId);
  }, [toolCallId, openSubagentRun]);

  /** Model-authored live label (subagent carries `intent` natively); wins
   *  over the generic verb, never over error/cancellation framing. */
  const intent = useToolCallIntent(args);
  const getHeaderText = () => {
    if (hasError) return localize('com_ui_subagent_errored');
    if (cancelled) return localize('com_ui_subagent_cancelled');
    if (intent != null) return intent;
    if (running) return localize('com_ui_subagent_running');
    return localize('com_ui_subagent_complete');
  };
  const headerText = getHeaderText();
  const subagentNameLabel = !isSelfSpawn && subagentAgent?.name ? subagentAgent.name : '';

  /** Only throttle once the live buffer is wide enough to fill the row, so
   *  early tokens appear immediately. */
  const shouldThrottleTicker = useMemo(() => {
    if (!running) return false;
    const liveBody = tickerLines.reduce((max, line) => {
      if (line.kind === 'writing' || line.kind === 'reasoning') {
        return Math.max(max, line.body.length);
      }
      return max;
    }, 0);
    return liveBody >= TICKER_PASSTHROUGH_CHARS;
  }, [running, tickerLines]);
  const displayedTicker = useThrottledValue(
    tickerLines,
    SUBAGENT_TICKER_THROTTLE_MS,
    shouldThrottleTicker,
  );
  const lastTickerLine = displayedTicker[displayedTicker.length - 1];
  const resultSummary = useMemo(
    () => (running ? '' : subagentResultSummary(contentParts, localize)),
    [running, contentParts, localize],
  );

  let previewNode: JSX.Element | null = null;
  if (running) {
    previewNode = lastTickerLine ? (
      <TickerLineView line={lastTickerLine} />
    ) : (
      <span className="truncate opacity-70">{localize('com_ui_subagent_waiting')}</span>
    );
  } else if (resultSummary) {
    previewNode = <span className="min-w-0 flex-1 truncate">{resultSummary}</span>;
  }

  const handleClick = useCallback(() => {
    if (!toolCallId) return;
    if (isSelected) {
      closeSubagentRun();
      return;
    }
    openSubagentRun(toolCallId);
  }, [toolCallId, isSelected, openSubagentRun, closeSubagentRun]);

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={isSelected}
        className={cn(
          'group flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition',
          isSelected
            ? 'border-border-medium bg-surface-tertiary'
            : 'border-border-light bg-surface-secondary hover:bg-surface-tertiary',
          running && 'animate-pulse-slow',
        )}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <div
            className={cn(
              'flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full',
              running && !subagentAgent && 'animate-pulse text-text-primary',
            )}
            aria-hidden="true"
          >
            {subagentAgent ? (
              <MessageIcon
                message={{ endpoint: EModelEndpoint.agents, isCreatedByUser: false } as TMessage}
                agent={subagentAgent}
              />
            ) : (
              <Users size={14} />
            )}
          </div>
          <span className="min-w-0 truncate" title={headerText}>
            {headerText}
          </span>
          {subagentNameLabel ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="shrink-0 text-text-tertiary" aria-hidden="true">
                ·
              </span>
              <span className="truncate font-normal text-text-secondary" title={subagentNameLabel}>
                {subagentNameLabel}
              </span>
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <ChevronRight
            size={14}
            className="shrink-0 text-text-secondary transition group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>

        {previewNode && (
          <div className="flex w-full items-baseline overflow-hidden pl-7 text-xs text-text-secondary">
            {previewNode}
          </div>
        )}
      </button>

      {!hideAttachments && attachments && attachments.length > 0 && (
        <AttachmentGroup attachments={attachments} />
      )}
    </div>
  );
}
