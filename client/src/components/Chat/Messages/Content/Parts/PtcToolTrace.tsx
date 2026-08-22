import { useRecoilValue } from 'recoil';
import { useTranslation } from 'react-i18next';
import { isReportableRunStepDuration } from 'librechat-data-provider';
import type { PtcTraceEntry } from '~/store';
import { cn, parseToolName, getRunStepDurationLabels } from '~/utils';
import { ptcTraceByToolCallId } from '~/store';
import { useMCPServerNames } from '~/hooks/MCP';
import { useLocalize } from '~/hooks';

/** Terminal-style status column: one glyph wide for every state, so the
 *  tool names stay aligned as calls settle. */
const STATUS_GLYPH: Record<PtcTraceEntry['status'], string> = {
  running: '›',
  success: '✓',
  error: '✗',
};

/**
 * One line of the trace. Reads as a shell transcript — status glyph, the tool
 * being called, its arguments, and how long it took — with the failure message
 * printed underneath the call that produced it, the way a CLI reports errors.
 */
function PtcTraceLine({ entry }: { entry: PtcTraceEntry }) {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const mcpServerNames = useMCPServerNames();
  const parsed = parseToolName(entry.name, mcpServerNames);
  const running = entry.status === 'running';
  const failed = entry.status === 'error';
  const duration = isReportableRunStepDuration(entry.durationMs)
    ? getRunStepDurationLabels(entry.durationMs as number, i18n.language)
    : undefined;

  return (
    <li className="leading-5">
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span
          aria-hidden="true"
          className={cn(
            'w-2 shrink-0 text-center',
            failed ? 'text-status-error' : 'text-text-tertiary',
            running && 'animate-pulse',
          )}
        >
          {STATUS_GLYPH[entry.status]}
        </span>
        <span className="shrink-0 text-text-primary">
          {parsed.mcpServer && (
            <>
              <span className="text-text-secondary">{parsed.mcpServer}</span>
              <span className="text-text-tertiary">·</span>
            </>
          )}
          {parsed.friendlyKey ? localize(parsed.friendlyKey) : parsed.toolName}
        </span>
        <span className="min-w-0 flex-1 truncate text-text-tertiary">{entry.args ?? ''}</span>
        {duration ? (
          <>
            <span className="shrink-0 tabular-nums text-text-tertiary" aria-hidden="true">
              {localize(duration.key, duration.values)}
            </span>
            <span className="sr-only">
              {localize(duration.announcedKey, duration.announcedValues)}
            </span>
          </>
        ) : (
          <span className="shrink-0 text-text-tertiary">
            {running ? localize('com_ui_ptc_trace_running') : ''}
          </span>
        )}
      </div>
      {failed && (
        <div className="flex items-baseline gap-1.5">
          <span className="w-2 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-status-error">
            {entry.error ?? localize('com_ui_ptc_trace_failed')}
          </span>
        </div>
      )}
    </li>
  );
}

/**
 * Live trace of the tool calls a programmatic tool-calling program makes from
 * inside the sandbox, rendered under the code that is making them. Those inner
 * calls open no run step and get no card of their own, so without this the
 * card shows one running spinner for the whole program.
 *
 * Renders nothing when the tool call made no inner calls, which is every
 * non-PTC code execution — callers don't need to know which kind they hold.
 */
export default function PtcToolTrace({
  toolCallId,
  className,
}: {
  toolCallId?: string;
  className?: string;
}) {
  const localize = useLocalize();
  const entries = useRecoilValue(ptcTraceByToolCallId(toolCallId ?? ''));

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className={cn('bg-surface-primary-alt p-4 text-xs dark:bg-transparent', className)}>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
        {localize('com_ui_ptc_trace_title')}
      </div>
      <ol className="max-h-[200px] overflow-auto font-mono" aria-live="polite">
        {entries.map((entry) => (
          <PtcTraceLine key={entry.callId} entry={entry} />
        ))}
      </ol>
    </div>
  );
}
