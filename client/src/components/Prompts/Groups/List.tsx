import { useNavigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { TPromptGroup, TStartupConfig } from 'librechat-data-provider';
import DashGroupItem from '~/components/Prompts/Groups/DashGroupItem';
import ChatGroupItem from '~/components/Prompts/Groups/ChatGroupItem';
import { useLocalize, useHasAccess } from '~/hooks';
import { Button, Skeleton } from '~/components/ui';

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
            className="mx-2 w-full bg-transparent px-3"
            onClick={() => navigate('/d/prompts/new')}
          >
            + {localize('com_ui_create_prompt')}
          </Button>
        </div>
      )}
      <div className="flex-grow overflow-y-auto">
        <div className="overflow-y-auto overflow-x-hidden">
          {isLoading && isChatRoute && (
            <Skeleton className="my-2 flex h-[84px] w-full rounded-2xl border-0 px-3 pb-4 pt-3" />
          )}
          {isLoading && !isChatRoute && (
            <Skeleton className="w-100 mx-2 my-3 flex h-[72px] rounded-md border-0 p-4" />
          )}
          {!isLoading && groups.length === 0 && isChatRoute && (
            <div className="my-2 flex h-[84px] w-full items-center justify-center rounded-2xl border border-border-light bg-transparent px-3 pb-4 pt-3 text-text-primary">
              {localize('com_ui_nothing_found')}
            </div>
          )}
          {!isLoading && groups.length === 0 && !isChatRoute && (
            <div className="w-100 mx-2 my-3 flex h-[72px] items-center justify-center rounded-md border border-border-light bg-transparent p-4 text-text-primary">
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
