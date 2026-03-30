import { Users, Clock, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '~/utils';

import type { Group } from './types';

interface GroupListItemProps {
  group: Group;
  isSelected: boolean;
  onSelect: (groupId: string) => void;
}

export default function GroupListItem({ group, isSelected, onSelect }: GroupListItemProps) {
  const handleClick = () => {
    onSelect(group._id);
  };

  const activeTimeWindows = group.timeWindows?.filter(tw => tw.isActive) || [];
  const hasTimeRestrictions = activeTimeWindows.length > 0;

  return (
    <div
      onClick={handleClick}
      className={cn(
        'cursor-pointer border-b border-border-light px-4 py-3 transition-colors hover:bg-surface-hover dark:border-gray-600',
        isSelected && 'bg-surface-active border-l-4 border-l-blue-500',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-text-primary">
              {group.name}
            </h3>
            {group.isActive ? (
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
            )}
          </div>
          
          {group.description && (
            <p className="mt-1 text-xs text-text-secondary line-clamp-2">
              {group.description}
            </p>
          )}
          
          <div className="mt-2 flex items-center gap-3 text-xs text-text-secondary">
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span>{group.memberCount} members</span>
            </div>
            
            {hasTimeRestrictions && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{activeTimeWindows.length} time restrictions</span>
              </div>
            )}
          </div>
          
          <div className="mt-1 text-xs text-text-secondary">
            Updated {new Date(group.updatedAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}