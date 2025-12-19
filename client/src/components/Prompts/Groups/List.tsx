import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Skeleton } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TPromptGroup, TStartupConfig } from 'librechat-data-provider';
import DashGroupItem from '~/components/Prompts/Groups/DashGroupItem';
import ChatGroupItem from '~/components/Prompts/Groups/ChatGroupItem';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';

export default function List({
  groups = [],
  isChatRoute,
  isLoading,
}: {
  groups?: TPromptGroup[];
  isChatRoute: boolean;
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { data: startupConfig = {} as Partial<TStartupConfig> } = useGetStartupConfig();
  const { instanceProjectId } = startupConfig;
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.CREATE,
  });

  return (
    <div className="flex h-full flex-col">
      {hasCreateAccess && (
        <div className="flex w-full justify-end">
          <Button
            variant="outline"
            className={`w-full bg-transparent ${isChatRoute ? '' : 'mx-2'}`}
            onClick={() => navigate('/d/prompts/new')}
            aria-label={localize('com_ui_create_prompt')}
          >
            <Plus className="size-4" aria-hidden="true" />
            {localize('com_ui_create_prompt')}
          </Button>
        </div>
      )}
      <div className="flex-grow overflow-y-auto" aria-label={localize('com_ui_prompt_groups')}>
        <div className="overflow-y-auto overflow-x-hidden">
          {isLoading && isChatRoute && (
            <Skeleton className="my-2 flex h-[84px] w-full rounded-2xl border-0 px-3 pb-4 pt-3" />
          )}
          {isLoading &&
            !isChatRoute &&
            Array.from({ length: 10 }).map((_, index: number) => (
              <Skeleton key={index} className="w-100 mx-2 my-2 flex h-14 rounded-lg border-0 p-4" />
            ))}
          {!isLoading && groups.length === 0 && isChatRoute && (
            <div className="my-2 flex h-[84px] w-full items-center justify-center rounded-2xl border border-border-light bg-transparent px-3 pb-4 pt-3 text-text-primary">
              {localize('com_ui_nothing_found')}
            </div>
          )}
          {!isLoading && groups.length === 0 && !isChatRoute && (
            <div className="my-12 flex w-full items-center justify-center text-lg font-semibold text-text-primary">
              {localize('com_ui_nothing_found')}
            </div>
          )}
          {groups.map((group) => {
            if (isChatRoute) {
              return (
                <ChatGroupItem
                  key={group._id}
                  group={group}
                  instanceProjectId={instanceProjectId}
                />
              );
            }
            return (
              <DashGroupItem key={group._id} group={group} instanceProjectId={instanceProjectId} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
