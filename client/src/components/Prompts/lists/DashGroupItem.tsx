import { memo, useState, useCallback, useEffect, useRef } from 'react';
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
  useToastContext,
} from '@librechat/client';
import { useLocalize, useAuthContext, useResourcePermissions } from '~/hooks';
import { useLiveAnnouncer } from '~/Providers';
import { useDeletePromptGroup, useUpdatePromptGroup } from '~/data-provider';
import CategoryIcon from '../utils/CategoryIcon';
import { cn } from '~/utils';

function DashGroupItemComponent({ group }: { group: TPromptGroup }) {
  const params = useParams();
  const navigate = useNavigate();
  const localize = useLocalize();
  const { user } = useAuthContext();

  const isSharedPrompt = group.author !== user?.id && Boolean(group.authorName);

  const { showToast } = useToastContext();
  const { announcePolite } = useLiveAnnouncer();
  const [nameInputValue, setNameInputValue] = useState(group.name);
  const [renameOpen, setRenameOpen] = useState(false);

  useEffect(() => {
    if (!renameOpen) {
      setNameInputValue(group.name);
    }
  }, [group.name, renameOpen]);

  const { hasPermission } = useResourcePermissions(ResourceType.PROMPTGROUP, group._id || '');
  const canEdit = hasPermission(PermissionBits.EDIT);
  const canDelete = hasPermission(PermissionBits.DELETE);

  const isGlobalGroup = group.isPublic === true;

  const updateGroup = useUpdatePromptGroup({
    onSuccess: () => {
      setRenameOpen(false);
      showToast({ status: 'success', message: localize('com_ui_prompt_renamed') });
      announcePolite({ message: localize('com_ui_prompt_renamed'), isStatus: true });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_prompt_update_error') });
    },
  });

  const deleteGroup = useDeletePromptGroup({
    onSuccess: (_response, variables) => {
      announcePolite({
        message: localize('com_ui_prompt_deleted_group', { 0: group.name }),
        isStatus: true,
      });
      if (variables.id === group._id) {
        navigate('/d/prompts');
      }
    },
  });

  const { isLoading: isSaving } = updateGroup;
  const isDeleting = deleteGroup.isLoading;

  const updateGroupRef = useRef(updateGroup);
  updateGroupRef.current = updateGroup;
  const deleteGroupRef = useRef(deleteGroup);
  deleteGroupRef.current = deleteGroup;

  const handleSaveRename = useCallback(() => {
    updateGroupRef.current.mutate({ id: group._id ?? '', payload: { name: nameInputValue } });
  }, [group._id, nameInputValue]);

  const handleDelete = useCallback(() => {
    deleteGroupRef.current.mutate({ id: group._id ?? '' });
  }, [group._id]);

  const handleContainerClick = useCallback(() => {
    navigate(`/d/prompts/${group._id}`, { replace: true });
  }, [group._id, navigate]);

  const ariaLabel = group.category
    ? localize('com_ui_prompt_group_button', {
        name: group.name,
        category: group.category,
      })
    : localize('com_ui_prompt_group_button_no_category', {
        name: group.name,
      });

  return (
    <article
      className={cn(
        'group/card relative flex w-full items-center overflow-hidden rounded-lg border border-border-light bg-transparent text-left hover:bg-surface-secondary',
        params.promptId === group._id && 'bg-surface-hover',
      )}
    >
      <div className="flex w-0 min-w-0 flex-1 items-center gap-2 overflow-hidden p-4">
        <CategoryIcon
          category={group.category ?? ''}
          className="icon-lg shrink-0"
          aria-hidden="true"
        />
        <a
          href={`/d/prompts/${group._id}`}
          onClick={(e) => {
            e.preventDefault();
            handleContainerClick();
          }}
          className="min-w-0 flex-1 truncate text-base font-semibold text-text-primary after:absolute after:inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary focus-visible:ring-offset-2"
          title={group.name}
          aria-label={ariaLabel}
        >
          {group.name}
        </a>
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

      <div className="relative z-10 flex shrink-0 items-center gap-1 pr-2">
        {canEdit && (
          <OGDialog open={renameOpen} onOpenChange={setRenameOpen}>
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
    </article>
  );
}

export default memo(DashGroupItemComponent);
