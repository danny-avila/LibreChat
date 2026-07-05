import { memo } from 'react';
import { ListChecks, Loader2 } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import type { TAgentJob } from 'librechat-data-provider';
import { statusLabelKey } from '~/hooks/Jobs/status';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type ActiveJobItemProps = {
  job: TAgentJob;
  isSmallScreen?: boolean;
  toggleNav?: () => void;
};

function ActiveJobItem({ job, isSmallScreen, toggleNav }: ActiveJobItemProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { conversationId: currentConvoId } = useParams();
  const isActive = currentConvoId === job.conversationId;
  const isRunning = job.status === 'running' || job.status === 'queued';

  const handleOpen = () => {
    navigate(`/c/${job.conversationId}`);
    if (isSmallScreen && toggleNav) {
      toggleNav();
    }
  };

  return (
    <button
      type="button"
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-primary outline-none hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white',
        isActive && 'bg-surface-active-alt',
      )}
      aria-current={isActive ? 'page' : undefined}
      data-testid={`active-job-item-${job._id}`}
      onClick={handleOpen}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
        ) : (
          <ListChecks className="h-4 w-4 text-text-secondary" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{job.goal}</span>
        <span className="block truncate text-xs text-text-secondary">
          {localize(statusLabelKey(job.status))}
        </span>
      </span>
    </button>
  );
}

export default memo(ActiveJobItem);
