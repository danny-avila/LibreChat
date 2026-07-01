import { memo } from 'react';
import { Skeleton } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useActiveAgentJobs, useHasAccess, useLocalize } from '~/hooks';
import ActiveJobItem from './ActiveJobItem';

const JobItemSkeleton = () => (
  <div className="flex w-full items-center rounded-lg px-3 py-2">
    <Skeleton className="mr-2 h-5 w-5 rounded-full" />
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  </div>
);

type ActiveJobsListProps = {
  isSmallScreen?: boolean;
  toggleNav?: () => void;
};

function ActiveJobsList({ isSmallScreen, toggleNav }: ActiveJobsListProps) {
  const localize = useLocalize();
  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const { data, isLoading } = useActiveAgentJobs(hasAccess);
  const jobs = data?.jobs ?? [];

  if (!hasAccess) {
    return null;
  }

  if (isLoading && jobs.length === 0) {
    return (
      <div className="mb-2 flex flex-col px-0" data-testid="active-jobs-list">
        <h2 className="px-1 pb-1 pt-1 text-xs font-bold text-text-secondary">
          {localize('com_ui_job_sidebar_title')}
        </h2>
        <JobItemSkeleton />
      </div>
    );
  }

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-col" data-testid="active-jobs-list">
      <h2 className="px-1 pb-1 pt-1 text-xs font-bold text-text-secondary">
        {localize('com_ui_job_sidebar_title')}
      </h2>
      <div className="mt-1 flex flex-col gap-1">
        {jobs.map((job) => (
          <ActiveJobItem
            key={job._id}
            job={job}
            isSmallScreen={isSmallScreen}
            toggleNav={toggleNav}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(ActiveJobsList);
