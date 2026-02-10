import { memo, useState, useRef, useMemo, useCallback } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EarthIcon, Pencil, Trash2, User } from 'lucide-react';
import { PermissionBits, ResourceType, type TPromptGroup } from 'librechat-data-provider';
import {
  Input,
  Label,
  Button,
  Spinner,
  OGDialog,
  TooltipAnchor,
  OGDialogTrigger,
  OGDialogTemplate,
} from '@librechat/client';
import { useLocalize, useAuthContext, useResourcePermissions } from '~/hooks';
import { useDeletePromptGroup, useUpdatePromptGroup } from '~/data-provider';
import CategoryIcon from '../utils/CategoryIcon';
import { cn } from '~/utils';

interface DashGroupItemProps {
  group: TPromptGroup;
  instanceProjectId?: string;
}

function DashGroupItemComponent({ group, instanceProjectId }: DashGroupItemProps) {
  const params = useParams();
  const navigate = useNavigate();
  const localize = useLocalize();
  const { user } = useAuthContext();

  const isSharedPrompt = group.author !== user?.id && Boolean(group.authorName);

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

  const { isLoading: isSaving } = updateGroup;
  const isDeleting = deleteGroup.isLoading;

  const handleSaveRename = useCallback(() => {
    updateGroup.mutate({ id: group._id ?? '', payload: { name: nameInputValue } });
  }, [group._id, nameInputValue, updateGroup]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate(`/d/prompts/${group._id}`, { replace: true });
      }
    },
    [group._id, navigate],
  );

  const handleDelete = useCallback(() => {
    deleteGroup.mutate({ id: group._id ?? '' });
  }, [group._id, deleteGroup]);

  const handleContainerClick = useCallback(() => {
    navigate(`/d/prompts/${group._id}`, { replace: true });
  }, [group._id, navigate]);

  const stopPropagation = useCallback((e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  const ariaLabel = group.category
    ? localize('com_ui_prompt_group_button', {
        name: group.name,
        category: group.category,
      })
    : localize('com_ui_prompt_group_button_no_category', {
        name: group.name,
      });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleContainerClick}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      className={cn(
        'flex cursor-pointer items-center overflow-hidden rounded-lg border border-border-light bg-transparent hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
        params.promptId === group._id && 'bg-surface-hover',
      )}
    >
      <div className="flex w-0 min-w-0 flex-1 items-center gap-2 overflow-hidden p-4">
        <CategoryIcon
          category={group.category ?? ''}
          className="icon-lg shrink-0"
          aria-hidden="true"
        />
        <span
          className="min-w-0 flex-1 cursor-pointer truncate text-base font-semibold text-text-primary"
          title={group.name}
        >
          {group.name}
        </span>
        {isSharedPrompt && (
          <TooltipAnchor
            description={localize('com_ui_by_author', { 0: group.authorName })}
            side="top"
            render={
              <span
                tabIndex={0}
                role="img"
                aria-label={localize('com_ui_by_author', { 0: group.authorName })}
                className="flex shrink-0 cursor-default items-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              >
                <User className="icon-md text-text-secondary" aria-hidden="true" />
              </span>
            }
          />
        )}
        {isGlobalGroup && (
          <EarthIcon
            className="icon-md shrink-0 text-green-400"
            aria-label={localize('com_ui_global_group')}
          />
        )}
      </div>

      <div
        className="flex shrink-0 items-center gap-1 pr-2"
        onClick={stopPropagation}
        onKeyDown={stopPropagation}
      >
        {canEdit && (
          <OGDialog>
            <OGDialogTrigger asChild>
              <TooltipAnchor
                description={localize('com_ui_rename')}
                side="top"
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={localize('com_ui_rename_prompt_name', { name: group.name })}
                  >
                    <Pencil className="size-4 text-text-primary" aria-hidden="true" />
                  </Button>
                }
              />
            </OGDialogTrigger>
            <OGDialogTemplate
              showCloseButton={false}
              title={localize('com_ui_rename_prompt')}
              className="w-11/12 max-w-md"
              main={
                <Input
                  value={nameInputValue}
                  onChange={(e) => setNameInputValue(e.target.value)}
                  className="w-full"
                  aria-label={localize('com_ui_rename_prompt_name', { name: group.name })}
                />
              }
              selection={
                <Button onClick={handleSaveRename} variant="submit">
                  {isSaving ? <Spinner /> : localize('com_ui_save')}
                </Button>
              }
            />
          </OGDialog>
        )}

        {canDelete && (
          <OGDialog>
            <OGDialogTrigger asChild>
              <TooltipAnchor
                description={localize('com_ui_delete')}
                side="top"
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={localize('com_ui_delete_prompt_name', { name: group.name })}
                  >
                    <Trash2 className="size-4 text-text-primary" aria-hidden="true" />
                  </Button>
                }
              />
            </OGDialogTrigger>
            <OGDialogTemplate
              title={localize('com_ui_delete_prompt')}
              className="w-11/12 max-w-md"
              main={<Label>{localize('com_ui_prompt_delete_confirm', { 0: group.name })}</Label>}
              selection={
                <Button onClick={handleDelete} variant="destructive">
                  {isDeleting ? <Spinner /> : localize('com_ui_delete')}
                </Button>
              }
            />
          </OGDialog>
        )}
      </div>
    </div>
  );
}

export default memo(DashGroupItemComponent);
