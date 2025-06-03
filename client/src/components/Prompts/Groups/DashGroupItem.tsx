import { memo, useState, useRef, useMemo, useCallback, KeyboardEvent } from 'react';
import { EarthIcon, Pen } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { SystemRoles, type TPromptGroup } from 'librechat-data-provider';
import { useDeletePromptGroup, useUpdatePromptGroup } from '~/data-provider';
import { Input, Label, Button, OGDialog, OGDialogTrigger } from '~/components/ui';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize, useAuthContext } from '~/hooks';
import { TrashIcon } from '~/components/svg';
import { cn } from '~/utils/';

interface DashGroupItemProps {
  group: TPromptGroup;
  instanceProjectId?: string;
}

function DashGroupItemComponent({ group, instanceProjectId }: DashGroupItemProps) {
  const params = useParams();
  const navigate = useNavigate();
  const localize = useLocalize();
  const { user } = useAuthContext();

  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [nameInputValue, setNameInputValue] = useState(group.name);

  const isOwner = useMemo(() => user?.id === group.author, [user?.id, group.author]);
  const isGlobalGroup = useMemo(
    () => instanceProjectId && group.projectIds?.includes(instanceProjectId),
    [group.projectIds, instanceProjectId],
  );

  const updateGroup = useUpdatePromptGroup({
    onMutate: () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    },
  });

  const deleteGroup = useDeletePromptGroup({
    onSuccess: (_response, variables) => {
      if (variables.id === group._id) {
        navigate('/d/prompts');
      }
    },
  });

  const { isLoading } = updateGroup;

  const handleSaveRename = useCallback(() => {
    console.log(group._id ?? '', { name: nameInputValue });
    updateGroup.mutate({ id: group._id ?? '', payload: { name: nameInputValue } });
  }, [group._id, nameInputValue, updateGroup]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        navigate(`/d/prompts/${group._id}`, { replace: true });
      }
    },
    [group._id, navigate],
  );

  const triggerDelete = useCallback(() => {
    deleteGroup.mutate({ id: group._id ?? '' });
  }, [group._id, deleteGroup]);

  const handleContainerClick = useCallback(() => {
    navigate(`/d/prompts/${group._id}`, { replace: true });
  }, [group._id, navigate]);

  return (
    <div
      className={cn(
        'mx-2 my-2 flex cursor-pointer rounded-lg border border-border-light bg-surface-primary p-3 shadow-sm transition-all duration-300 ease-in-out hover:bg-surface-secondary',
        params.promptId === group._id && 'bg-surface-hover',
      )}
      onClick={handleContainerClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${group.name} prompt group`}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2 truncate pr-2">
          <CategoryIcon category={group.category ?? ''} className="icon-lg" aria-hidden="true" />

          <Label className="text-md cursor-pointer truncate font-semibold text-text-primary">
            {group.name}
          </Label>
        </div>

        <div className="flex h-full items-center gap-2">
          {isGlobalGroup && (
            <EarthIcon
              className="icon-md text-green-500"
              aria-label={localize('com_ui_global_group')}
            />
          )}
          {(isOwner || user?.role === SystemRoles.ADMIN) && (
            <>
              <OGDialog>
                <OGDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 p-0 hover:bg-surface-hover"
                    aria-label={localize('com_ui_rename_prompt') + ' ' + group.name}
                  >
                    <Pen className="icon-sm text-text-primary" aria-hidden="true" />
                  </Button>
                </OGDialogTrigger>
                <OGDialogTemplate
                  showCloseButton={false}
                  title={localize('com_ui_rename_prompt')}
                  className="w-11/12 max-w-lg"
                  main={
                    <div className="flex w-full flex-col items-center gap-2">
                      <div className="grid w-full items-center gap-2">
                        <Input
                          value={nameInputValue}
                          onChange={(e) => setNameInputValue(e.target.value)}
                          className="w-full"
                          aria-label={localize('com_ui_rename_prompt') + ' ' + group.name}
                        />
                      </div>
                    </div>
                  }
                  selection={{
                    selectHandler: handleSaveRename,
                    selectClasses:
                      'bg-surface-submit hover:bg-surface-submit-hover text-white disabled:hover:bg-surface-submit',
                    selectText: localize('com_ui_save'),
                    isLoading,
                  }}
                />
              </OGDialog>

              <OGDialog>
                <OGDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:bg-surface-hover"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={localize('com_ui_delete_prompt') + ' ' + group.name}
                  >
                    <TrashIcon className="icon-sm text-text-primary" aria-hidden="true" />
                  </Button>
                </OGDialogTrigger>
                <OGDialogTemplate
                  showCloseButton={false}
                  title={localize('com_ui_delete_prompt')}
                  className="w-11/12 max-w-lg"
                  main={
                    <div className="flex w-full flex-col items-center gap-2">
                      <div className="grid w-full items-center gap-2">
                        <Label htmlFor="confirm-delete" className="text-left text-sm font-medium">
                          {localize('com_ui_delete_confirm')} <strong>{group.name}</strong>
                        </Label>
                      </div>
                    </div>
                  }
                  selection={{
                    selectHandler: triggerDelete,
                    selectClasses:
                      'bg-red-600 dark:bg-red-600 hover:bg-red-700 dark:hover:bg-red-800 text-white',
                    selectText: localize('com_ui_delete'),
                  }}
                />
              </OGDialog>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(DashGroupItemComponent);
