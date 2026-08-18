import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function SubagentThreadLink({
  threadId,
  relation,
  className,
  labelClassName,
}: {
  threadId: string;
  relation: 'parent' | 'child';
  className?: string;
  labelClassName?: string;
}) {
  const localize = useLocalize();
  const normalizedThreadId = threadId.trim();
  if (normalizedThreadId === '') {
    return null;
  }

  const isParent = relation === 'parent';
  const label = localize(
    isParent ? 'com_ui_subagent_back_to_parent' : 'com_ui_subagent_open_thread',
  );
  const Icon = isParent ? ChevronLeft : ChevronRight;

  return (
    <Link
      to={`/c/${encodeURIComponent(normalizedThreadId)}`}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-text-secondary transition hover:bg-surface-tertiary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-text-primary',
        className,
      )}
    >
      {isParent && <Icon size={16} aria-hidden="true" />}
      <span className={labelClassName}>{label}</span>
      {!isParent && <Icon size={16} aria-hidden="true" />}
    </Link>
  );
}
