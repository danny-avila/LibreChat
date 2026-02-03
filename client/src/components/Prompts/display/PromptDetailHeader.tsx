import { useMemo } from 'react';
import { format } from 'date-fns';
import { User, Calendar, EarthIcon } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import type { TPromptGroup } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import CategoryIcon from '../utils/CategoryIcon';
import { useLocalize } from '~/hooks';

interface PromptDetailHeaderProps {
  group: TPromptGroup;
}

const PromptDetailHeader = ({ group }: PromptDetailHeaderProps) => {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const formattedDate = group.createdAt ? format(new Date(group.createdAt), 'MMM d, yyyy') : null;

  const isGlobalGroup = useMemo(
    () =>
      startupConfig?.instanceProjectId != null &&
      group.projectIds?.includes(startupConfig.instanceProjectId),
    [group.projectIds, startupConfig?.instanceProjectId],
  );

  return (
    <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:gap-4">
      {group.category && (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-secondary">
          <CategoryIcon category={group.category} className="h-6 w-6" />
        </div>
      )}

      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-xl font-bold text-text-primary" title={group.name}>
            {group.name}
          </h2>
          {isGlobalGroup && (
            <TooltipAnchor
              description={localize('com_ui_sr_global_prompt')}
              side="top"
              render={
                <EarthIcon
                  className="h-5 w-5 shrink-0 text-green-400"
                  aria-label={localize('com_ui_sr_global_prompt')}
                />
              }
            />
          )}
        </div>
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
