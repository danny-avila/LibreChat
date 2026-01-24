import { memo, useState, useRef, useMemo, useCallback, KeyboardEvent } from 'react';
import { Trans } from 'react-i18next';
import { EarthIcon, Pen } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PermissionBits, ResourceType, type TPromptGroup } from 'librechat-data-provider';
import {
  Input,
  Label,
  OGDialog,
  OGDialogTrigger,
  OGDialogTemplate,
  TrashIcon,
} from '@librechat/client';
import { useDeletePromptGroup, useUpdatePromptGroup } from '~/data-provider';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import { useLocalize, useResourcePermissions } from '~/hooks';
import { cn } from '~/utils';

interface DashGroupItemProps {
  group: TPromptGroup;
  instanceProjectId?: string;
}

function DashGroupItemComponent({ group, instanceProjectId }: DashGroupItemProps) {
  const params = useParams();
  const navigate = useNavigate();
  const localize = useLocalize();

  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [nameInputValue, setNameInputValue] = useState(group.name);

  const { hasPermission } = useResourcePermissions(ResourceType.PROMPTGROUP, group._id || '');
  const canEdit = hasPermission(PermissionBits.EDIT);
  const canDelete = hasPermission(PermissionBits.DELETE);

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
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
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
        'relative mx-2 my-2 rounded-lg border border-border-light bg-surface-primary shadow-sm transition-all duration-300 ease-in-out hover:bg-surface-secondary',
        params.promptId === group._id && 'bg-surface-hover',
      )}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between rounded-lg p-3 text-left"
        onClick={handleContainerClick}
        onKeyDown={handleKeyDown}
        aria-label={
          group.category
            ? localize('com_ui_prompt_group_button', {
                name: group.name,
                category: group.category,
              })
            : localize('com_ui_prompt_group_button_no_category', {
                name: group.name,
              })
        }
      >
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
        </div>
      </button>

      <div className="absolute right-0 top-0 mr-1 mt-2.5 flex items-start gap-1 pl-2">
        {canEdit && (
          <OGDialog>
            <OGDialogTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-medium bg-transparent p-0 text-sm font-medium transition-all duration-300 ease-in-out hover:border-border-heavy hover:bg-surface-hover focus:border-border-heavy focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                aria-label={localize('com_ui_rename_prompt_name', { name: group.name })}
              >
                <Pen className="icon-sm text-text-primary" aria-hidden="true" />
              </button>
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
                      aria-label={localize('com_ui_rename_prompt_name', { name: group.name })}
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
        )}

        {canDelete && (
          <OGDialog>
            <OGDialogTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-medium bg-transparent p-0 text-sm font-medium transition-all duration-300 ease-in-out hover:border-border-heavy hover:bg-surface-hover focus:border-border-heavy focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                aria-label={localize('com_ui_delete_prompt_name', { name: group.name })}
              >
                <TrashIcon className="icon-sm text-text-primary" aria-hidden="true" />
              </button>
            </OGDialogTrigger>
            <OGDialogTemplate
              showCloseButton={false}
              title={localize('com_ui_delete_prompt')}
              className="w-11/12 max-w-lg"
              main={
                <div className="flex w-full flex-col items-center gap-2">
                  <div className="grid w-full items-center gap-2">
                    <Label htmlFor="confirm-delete" className="text-left text-sm font-medium">
                      <Trans
                        i18nKey="com_ui_delete_confirm_strong"
                        values={{ title: group.name }}
                        components={{ strong: <strong /> }}
                      />
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
        )}
      </div>
    </div>
  );
}

export default memo(DashGroupItemComponent);
