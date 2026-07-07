import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from 'recoil';
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
      typeof args === 'string' ? args : JSON.stringify(args ?? null),
      output ?? '',
      persistedContent?.length ?? -1,
      /** Fingerprint attachments by content, not just count — deferred
       *  previews resolve in place (same array length, new filepath), and the
       *  detached panel reads attachments only from this registry entry, so a
       *  length-only key would leave it showing the pre-resolution chip. */
      attachments?.map((a) => `${a.filepath ?? ''}:${a.filename ?? ''}`).join(',') ?? '',
    ].join('|');
    if (signature === lastWrittenRef.current) return;
    lastWrittenRef.current = signature;
    setRuns((prev) => ({
      ...(prev ?? {}),
      [toolCallId]: { toolCallId, args, output, attachments, persistedContent, initialProgress },
    }));
  }, [toolCallId, args, output, attachments, persistedContent, initialProgress, setRuns]);

  /** Auto-open the panel when a run first streams in — mirrors
   *  `ToolArtifactCard`. `isSubmitting` is captured once at first render so a
   *  history mount (page load, back-navigation) never steals focus. */
  const readInitialIsSubmitting = useRecoilCallback(
    ({ snapshot }) =>
      () =>
        snapshot.getLoadable(store.isSubmittingFamily(0)).valueMaybe() ?? false,
    [],
  );
  const mountedDuringStreamRef = useRef<boolean | null>(null);
  if (mountedDuringStreamRef.current === null) {
    mountedDuringStreamRef.current = readInitialIsSubmitting();
  }
  const autoFocusedRef = useRef(false);
  useEffect(() => {
    if (!toolCallId || autoFocusedRef.current || !mountedDuringStreamRef.current) return;
    autoFocusedRef.current = true;
    openSubagentRun(toolCallId);
  }, [toolCallId, openSubagentRun]);

  const getHeaderText = () => {
    if (hasError) return localize('com_ui_subagent_errored');
    if (cancelled) return localize('com_ui_subagent_cancelled');
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
    <div className="my-1.5">
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
              running && !subagentAgent && 'animate-pulse text-primary',
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
          <span className="shrink-0">{headerText}</span>
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
