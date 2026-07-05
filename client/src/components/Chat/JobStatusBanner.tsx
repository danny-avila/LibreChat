import { memo, useMemo } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TAgentJob } from 'librechat-data-provider';
import { useCancelJobMutation } from '~/data-provider/Jobs/mutations';
import {
  ACTIVE_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  bannerSurfaceClass,
  buildActiveProgressLabel,
  buildTerminalProgressLabel,
  statusLabelKey,
  useActiveJobsCount,
  useConversationJob,
  useHasAccess,
  useLocalize,
} from '~/hooks';
import { cn } from '~/utils';

type JobStatusBannerProps = {
  conversationId?: string;
  bootstrapJobId?: string;
};

function JobStatusBannerInner({
  job,
  activeJobsCount,
}: {
  job: TAgentJob;
  activeJobsCount: number;
}) {
  const localize = useLocalize();
  const { mutate: cancelJob, isLoading: isCanceling } = useCancelJobMutation();
  const isTerminal = TERMINAL_JOB_STATUSES.has(job.status);

  const progressLabel = useMemo(() => {
    if (isTerminal) {
      return buildTerminalProgressLabel(job, localize);
    }
    return buildActiveProgressLabel(job, localize);
  }, [isTerminal, job, localize]);

  const otherTasksLabel = useMemo(() => {
    if (isTerminal) {
      return null;
    }
    const others = activeJobsCount - 1;
    if (others <= 0) {
      return null;
    }
    return localize('com_ui_job_other_tasks', { 0: String(others) });
  }, [activeJobsCount, isTerminal, localize]);

  const showCancel = ACTIVE_JOB_STATUSES.has(job.status);

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-3xl flex-col gap-1 rounded-lg border px-3 py-2 text-sm text-text-primary xl:max-w-4xl',
        bannerSurfaceClass(job.status),
      )}
      role="status"
      aria-live="polite"
      data-testid="job-status-banner"
      data-job-status={job.status}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{localize(statusLabelKey(job.status))}</p>
          <p className="mt-0.5 text-xs text-text-secondary">{progressLabel}</p>
        </div>
        {showCancel && (
          <button
            type="button"
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            disabled={isCanceling}
            onClick={() => cancelJob(job._id)}
          >
            {localize('com_ui_cancel')}
          </button>
        )}
      </div>
      {otherTasksLabel && <p className="text-xs text-text-secondary">{otherTasksLabel}</p>}
    </div>
  );
}

function shouldShowBanner(job: TAgentJob | undefined): job is TAgentJob {
  if (!job) {
    return false;
  }
  return ACTIVE_JOB_STATUSES.has(job.status) || TERMINAL_JOB_STATUSES.has(job.status);
}

export default memo(function JobStatusBanner({
  conversationId,
  bootstrapJobId,
}: JobStatusBannerProps) {
  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const job = useConversationJob(hasAccess ? conversationId : undefined, bootstrapJobId);
  const activeJobsCount = useActiveJobsCount(hasAccess);

  if (!shouldShowBanner(job)) {
    return null;
  }

  return (
    <div className="pointer-events-auto z-[9] w-full px-2 pt-[56px] sm:px-4">
      <JobStatusBannerInner job={job} activeJobsCount={activeJobsCount} />
    </div>
  );
});
