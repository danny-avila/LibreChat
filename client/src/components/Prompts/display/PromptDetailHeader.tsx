import { format } from 'date-fns';
import { User, Calendar } from 'lucide-react';
import type { TPromptGroup } from 'librechat-data-provider';
import CategoryIcon from '../utils/CategoryIcon';

interface PromptDetailHeaderProps {
  group: TPromptGroup;
}

const PromptDetailHeader = ({ group }: PromptDetailHeaderProps) => {
  const formattedDate = group.createdAt ? format(new Date(group.createdAt), 'MMM d, yyyy') : null;

  return (
    <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:gap-4">
      {group.category && (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-secondary">
          <CategoryIcon category={group.category} className="h-6 w-6" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-bold text-text-primary sm:truncate">{group.name}</h2>
        {group.oneliner && (
          <p className="text-sm text-text-secondary sm:truncate">{group.oneliner}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          {group.authorName && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" aria-hidden="true" />
              {group.authorName}
            </span>
          )}
          {formattedDate && (
            <time className="flex items-center gap-1" dateTime={group.createdAt?.toString()}>
              <Calendar className="h-3 w-3" aria-hidden="true" />
              {formattedDate}
            </time>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromptDetailHeader;
