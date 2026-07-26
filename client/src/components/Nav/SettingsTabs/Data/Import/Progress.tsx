import { Button, Spinner } from '@librechat/client';
import type { TImportJob, TImportPhase } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import useAutoFocus from './useAutoFocus';
import { useLocalize } from '~/hooks';

const TERMINAL_PHASES = new Set<TImportPhase>(['completed', 'failed', 'cancelled']);

const PHASE_LABEL_KEYS: Partial<Record<TImportPhase, TranslationKeys>> = {
  conversations: 'com_ui_import_phase_conversations',
  assets: 'com_ui_import_phase_assets',
};

interface ProgressProps {
  job: TImportJob;
  onCancel: () => void;
  onReset: () => void;
  isCancelling: boolean;
}

export default function Progress({ job, onCancel, onReset, isCancelling }: ProgressProps) {
  const localize = useLocalize();
  const isTerminal = TERMINAL_PHASES.has(job.phase);
  const { done, total } = job.phase === 'assets' ? job.progress.assets : job.progress.conversations;
  const phaseLabel = localize(PHASE_LABEL_KEYS[job.phase] ?? 'com_ui_importing');
  const statusRef = useAutoFocus<HTMLDivElement, TImportPhase>(job.phase);

  let statusHeading = phaseLabel;
  if (job.phase === 'cancelled') {
    statusHeading = localize('com_ui_import_cancelled');
  } else if (job.phase === 'failed') {
    statusHeading = localize('com_ui_import_conversation_error');
  } else if (job.phase === 'completed') {
    statusHeading = localize('com_ui_import_conversation_success');
  }

  return (
    <section className="flex flex-col gap-3">
      {/* The live region wraps the heading AND the counts, so a screen reader
          hears the outcome rather than just the phase name. */}
      <div
        ref={statusRef}
        tabIndex={-1}
        aria-live="polite"
        role="status"
        className="flex flex-col gap-1 text-sm text-text-primary focus:outline-none"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium">{statusHeading}</p>
          {!isTerminal && total > 0 && (
            <p className="shrink-0 tabular-nums text-text-secondary">
              {done} / {total}
            </p>
          )}
        </div>

        {isTerminal && job.phase === 'failed' && job.error != null && (
          <p className="text-red-500 dark:text-red-400">{job.error}</p>
        )}

        {isTerminal && job.report && (
          <>
            <p className="text-text-secondary">
              {localize('com_ui_import_report', {
                0: job.report.imported,
                1: job.report.skipped,
              })}
            </p>
            <p className="text-text-secondary">
              {localize('com_ui_import_report_assets', {
                0: job.report.assetsImported,
                1: job.report.assetsUnavailable,
              })}
            </p>
          </>
        )}
      </div>

      {/* Cancel sits inline with the bar rather than on its own row: the phase
          name above already says what is running, so a spinner would be a
          second indicator for one operation and a third row wastes height. */}
      {!isTerminal && (
        <div className="flex items-center gap-3">
          <Button variant="outline" className="shrink-0" onClick={onCancel} disabled={isCancelling}>
            {isCancelling && <Spinner className="mr-1 size-4" aria-hidden="true" />}
            {localize('com_ui_import_cancel')}
          </Button>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total > 0 ? total : undefined}
            aria-valuenow={total > 0 ? done : undefined}
            aria-label={phaseLabel}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-tertiary"
          >
            {total > 0 && (
              <div
                className="h-full rounded-full bg-text-primary transition-all duration-300"
                style={{ width: `${Math.min((done / total) * 100, 100)}%` }}
              />
            )}
          </div>
        </div>
      )}

      {isTerminal && job.report && job.report.errors.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-text-secondary">
            {localize('com_ui_import_errors', { 0: job.report.errors.length })}
          </summary>
          <ul className="mt-2 list-inside list-disc text-sm text-text-secondary">
            {job.report.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </details>
      )}

      {isTerminal && (
        <div className="flex justify-start">
          <Button variant="submit" onClick={onReset}>
            {localize('com_ui_import_another')}
          </Button>
        </div>
      )}
    </section>
  );
}
