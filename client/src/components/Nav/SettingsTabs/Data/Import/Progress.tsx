import { Button, Spinner } from '@librechat/client';
import type { TImportJob, TImportPhase } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

const TERMINAL_PHASES = new Set<TImportPhase>(['completed', 'failed', 'cancelled']);

const PHASE_LABEL_KEYS: Partial<Record<TImportPhase, TranslationKeys>> = {
  inspecting: 'com_ui_import_inspecting',
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
  const { done, total } = job.progress.conversations;
  const phaseLabel = localize(PHASE_LABEL_KEYS[job.phase] ?? 'com_ui_importing');

  let statusHeading = phaseLabel;
  if (job.phase === 'cancelled') {
    statusHeading = localize('com_ui_import_cancelled');
  } else if (job.phase === 'failed') {
    statusHeading = localize('com_ui_import_conversation_error');
  } else if (job.phase === 'completed') {
    statusHeading = localize('com_ui_import_conversation_success');
  }

  return (
    <section className="flex flex-col gap-4">
      <div aria-live="polite" className="text-sm font-medium text-text-primary">
        {statusHeading}
      </div>

      {!isTerminal && (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total > 0 ? total : undefined}
            aria-valuenow={total > 0 ? done : undefined}
            aria-label={phaseLabel}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-tertiary"
          >
            {total > 0 && (
              <div
                className="h-full rounded-full bg-text-primary transition-all duration-300"
                style={{ width: `${Math.min((done / total) * 100, 100)}%` }}
              />
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isCancelling}>
              {isCancelling ? <Spinner className="size-4" /> : localize('com_ui_import_cancel')}
            </Button>
          </div>
        </>
      )}

      {isTerminal && job.phase === 'failed' && job.error != null && (
        <p className="text-sm text-red-500 dark:text-red-400">{job.error}</p>
      )}

      {isTerminal && job.report && (
        <div className="flex flex-col gap-2 text-sm text-text-secondary">
          <p>
            {localize('com_ui_import_report', {
              0: job.report.imported,
              1: job.report.skipped,
            })}
          </p>
          <p>
            {localize('com_ui_import_report_assets', {
              0: job.report.assetsImported,
              1: job.report.assetsUnavailable,
            })}
          </p>
          {job.report.errors.length > 0 && (
            <details>
              <summary className="cursor-pointer">
                {localize('com_ui_import_errors', { 0: job.report.errors.length })}
              </summary>
              <ul className="mt-2 list-inside list-disc">
                {job.report.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {isTerminal && (
        <div className="flex justify-end">
          <Button onClick={onReset}>{localize('com_ui_import_another')}</Button>
        </div>
      )}
    </section>
  );
}
