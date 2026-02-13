import { FileText, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Skeleton } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TPromptGroup } from 'librechat-data-provider';
import DashGroupItem from '~/components/Prompts/Groups/DashGroupItem';
import ChatGroupItem from '~/components/Prompts/Groups/ChatGroupItem';
import { useLocalize, useHasAccess } from '~/hooks';
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
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.CREATE,
  });

  return (
    <div className="flex h-full flex-col">
      {hasCreateAccess && (
        <div className="flex w-full justify-end">
          <Button
            asChild
            variant="outline"
            className={cn('w-full bg-transparent', !isChatRoute && 'mx-2')}
            aria-label={localize('com_ui_create_prompt')}
          >
            <Link to="/d/prompts/new">
              <Plus className="size-4" aria-hidden="true" />
              {localize('com_ui_create_prompt')}
            </Link>
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
          {groups.map((group) => {
            if (isChatRoute) {
              return <ChatGroupItem key={group._id} group={group} />;
            }
            return <DashGroupItem key={group._id} group={group} />;
          })}
        </div>
      </div>
    </div>
  );
}
