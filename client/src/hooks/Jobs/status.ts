import type { TAgentJob, TAgentJobStatus } from 'librechat-data-provider';
import type useLocalize from '~/hooks/useLocalize';

export const ACTIVE_JOB_STATUSES = new Set<TAgentJobStatus>([
  'queued',
  'running',
  'waiting_client',
  'paused',
]);

export const TERMINAL_JOB_STATUSES = new Set<TAgentJobStatus>(['done', 'error', 'canceled']);

export const ACTIVE_JOBS_STATUS_FILTER = 'queued,running,waiting_client,paused';

export function countSuccessfulJobSteps(job: TAgentJob): number {
  return job.steps?.filter((step) => step.status === 'success').length ?? 0;
}

export function statusLabelKey(status: TAgentJobStatus): string {
  switch (status) {
    case 'queued':
      return 'com_ui_job_status_queued';
    case 'running':
      return 'com_ui_job_status_running';
    case 'waiting_client':
      return 'com_ui_job_status_waiting';
    case 'paused':
      return 'com_ui_job_status_paused';
    case 'done':
      return 'com_ui_job_status_done';
    case 'error':
      return 'com_ui_job_status_error';
    case 'canceled':
      return 'com_ui_job_status_canceled';
    default:
      return 'com_ui_job_status_running';
  }
}

export function buildActiveProgressLabel(
  job: TAgentJob,
  localize: ReturnType<typeof useLocalize>,
): string {
  switch (job.status) {
    case 'queued':
      return localize('com_ui_job_queued_waiting');
    case 'waiting_client':
      return localize('com_ui_job_needs_input');
    case 'paused':
      return localize('com_ui_job_paused_hint');
    case 'running':
      if (countSuccessfulJobSteps(job) <= 0 && job.currentStep <= 0) {
        return localize('com_ui_job_getting_started');
      }
      return localize('com_ui_job_still_working', {
        0: String(Math.max(countSuccessfulJobSteps(job), job.currentStep)),
      });
    default:
      return localize('com_ui_job_working_hint');
  }
}

export function buildTerminalProgressLabel(
  job: TAgentJob,
  localize: ReturnType<typeof useLocalize>,
): string {
  switch (job.status) {
    case 'done':
      if (job.currentStep > 0) {
        return localize('com_ui_job_done_with_updates', { 0: String(job.currentStep) });
      }
      return localize('com_ui_job_done_hint');
    case 'error':
      if (job.lastError?.trim()) {
        return job.lastError.trim();
      }
      return localize('com_ui_job_error_hint');
    case 'canceled':
      return localize('com_ui_job_canceled_hint');
    default:
      return '';
  }
}

export function bannerSurfaceClass(status: TAgentJobStatus): string {
  switch (status) {
    case 'done':
      return 'border-green-600/30 bg-green-500/5 dark:border-green-500/25 dark:bg-green-500/10';
    case 'error':
      return 'border-red-600/30 bg-red-500/5 dark:border-red-500/25 dark:bg-red-500/10';
    case 'canceled':
      return 'border-border-medium bg-surface-secondary opacity-90';
    default:
      return 'border-border-medium bg-surface-secondary';
  }
}
