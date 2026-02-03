import { format } from 'date-fns';
import { User, Calendar, BarChart3 } from 'lucide-react';
import { Separator } from '@librechat/client';
import type { TPromptGroup } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

interface PromptMetadataProps {
  group: TPromptGroup;
}

const PromptMetadata = ({ group }: PromptMetadataProps) => {
  const localize = useLocalize();

  const formattedDate = group.createdAt ? format(new Date(group.createdAt), 'MMM d, yyyy') : null;

  const hasAuthor = Boolean(group.authorName);
  const hasDate = Boolean(formattedDate);
  const hasUsage = group.numberOfGenerations != null && group.numberOfGenerations > 0;

  if (!hasAuthor && !hasDate && !hasUsage) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
      {hasAuthor && (
        <div className="flex items-center gap-1">
          <User className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{group.authorName}</span>
        </div>
      )}

      {hasAuthor && hasDate && <Separator orientation="vertical" className="h-3" />}

      {hasDate && (
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          <time dateTime={group.createdAt?.toString()}>{formattedDate}</time>
        </div>
      )}

      {(hasAuthor || hasDate) && hasUsage && <Separator orientation="vertical" className="h-3" />}

      {hasUsage && (
        <div className="flex items-center gap-1">
          <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{localize('com_ui_used_count', { count: group.numberOfGenerations })}</span>
        </div>
      )}
    </div>
  );
};

export default PromptMetadata;
