import { FileText } from 'lucide-react';
import { Skeleton } from '@librechat/client';
import { Permissions } from 'librechat-data-provider';
import type { TPromptGroup, TStartupConfig } from 'librechat-data-provider';
import DashGroupItem from './DashGroupItem';
import ChatGroupItem from './ChatGroupItem';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function List({
  groups = [],
  isChatRoute,
  isLoading,
}: {
  groups?: TPromptGroup[];
  isChatRoute: boolean;
  isLoading: boolean;
}) {
  const localize = useLocalize();
  const { data: startupConfig = {} as Partial<TStartupConfig> } = useGetStartupConfig();
  const { instanceProjectId } = startupConfig;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-grow overflow-y-auto" aria-label={localize('com_ui_prompt_groups')}>
        <div className="overflow-y-auto overflow-x-hidden">
          {isLoading && isChatRoute && (
            <Skeleton className="my-2 flex h-[84px] w-full rounded-2xl border-0 px-3 pb-4 pt-3" />
          )}
          {isLoading && !isChatRoute && (
            <div className="space-y-2 px-2">
              {Array.from({ length: 10 }).map((_, index: number) => (
                <Skeleton key={index} className="flex h-14 w-full rounded-lg border-0 p-4" />
              ))}
            </div>
          )}
          {!isLoading && groups.length === 0 && (
            <div
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border border-border-light bg-transparent p-6 text-center',
                isChatRoute ? 'my-2' : 'mx-2 my-4',
              )}
            >
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-tertiary">
                <FileText className="size-5 text-text-secondary" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-text-primary">
                {localize('com_ui_no_prompts_title')}
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                {localize('com_ui_add_first_prompt')}
              </p>
            </div>
          )}
          {isChatRoute ? (
            groups.map((group) => (
              <ChatGroupItem key={group._id} group={group} instanceProjectId={instanceProjectId} />
            ))
          ) : (
            <div className="space-y-2 px-0 md:px-2">
              {groups.map((group) => (
                <DashGroupItem
                  key={group._id}
                  group={group}
                  instanceProjectId={instanceProjectId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
