import { useState, useMemo, memo, useRef } from 'react';
import { PermissionBits, ResourceType } from 'librechat-data-provider';
import { Menu as MenuIcon, Edit as EditIcon, EarthIcon, TextSearch } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@librechat/client';
import type { TPromptGroup } from 'librechat-data-provider';
import { useLocalize, useSubmitMessage, useCustomLink, useResourcePermissions } from '~/hooks';
import VariableDialog from '~/components/Prompts/Groups/VariableDialog';
import PreviewPrompt from '~/components/Prompts/PreviewPrompt';
import ListCard from '~/components/Prompts/Groups/ListCard';
import { detectVariables } from '~/utils';

function ChatGroupItem({
  group,
  instanceProjectId,
}: {
  group: TPromptGroup;
  instanceProjectId?: string;
}) {
  const localize = useLocalize();
  const { submitPrompt } = useSubmitMessage();
  const [isPreviewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isVariableDialogOpen, setVariableDialogOpen] = useState(false);
  const onEditClick = useCustomLink<HTMLDivElement>(`/d/prompts/${group._id}`);

  const groupIsGlobal = useMemo(
    () => instanceProjectId != null && group.projectIds?.includes(instanceProjectId),
    [group, instanceProjectId],
  );

  // Check permissions for the promptGroup
  const { hasPermission } = useResourcePermissions(ResourceType.PROMPTGROUP, group._id || '');
  const canEdit = hasPermission(PermissionBits.EDIT);

  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

  const onCardClick: React.MouseEventHandler<HTMLButtonElement> = () => {
    const text = group.productionPrompt?.prompt;
    if (!text?.trim()) {
      return;
    }

    if (detectVariables(text)) {
      setVariableDialogOpen(true);
      return;
    }

    submitPrompt(text);
  };

  return (
    <>
      <div className="relative my-2 items-stretch justify-between rounded-xl border border-border-light px-1 shadow-sm transition-all duration-300 ease-in-out hover:bg-surface-tertiary hover:shadow-lg">
        <ListCard
          name={group.name}
          category={group.category ?? ''}
          onClick={onCardClick}
          snippet={
            typeof group.oneliner === 'string' && group.oneliner.length > 0
              ? group.oneliner
              : (group.productionPrompt?.prompt ?? '')
          }
        ></ListCard>
        {groupIsGlobal === true && (
          <div className="absolute right-14 top-[16px]">
            <EarthIcon
              className="icon-md text-green-400"
              aria-label={localize('com_ui_sr_global_prompt')}
            />
          </div>
        )}
        <div className="absolute right-0 top-0 mr-1 mt-2.5 items-start pl-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                ref={triggerButtonRef}
                id={`prompt-actions-${group._id}`}
                type="button"
                aria-label={localize('com_ui_sr_actions_menu', { 0: group.name })}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
                className="z-50 mr-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-medium bg-transparent p-0 text-sm font-medium transition-all duration-300 ease-in-out hover:border-border-heavy hover:bg-surface-hover focus:border-border-heavy focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                <MenuIcon className="icon-md text-text-secondary" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              id={`prompt-menu-${group._id}`}
              aria-label={`Available actions for ${group.name}`}
              className="z-50 w-fit rounded-xl"
              collisionPadding={2}
              align="start"
            >
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewDialogOpen(true);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                className="w-full cursor-pointer rounded-lg text-text-primary hover:bg-surface-hover focus:bg-surface-hover disabled:cursor-not-allowed"
              >
                <TextSearch className="mr-2 h-4 w-4 text-text-primary" aria-hidden="true" />
                <span>{localize('com_ui_preview')}</span>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!canEdit}
                    className="cursor-pointer rounded-lg text-text-primary hover:bg-surface-hover focus:bg-surface-hover disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditClick(e);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <EditIcon className="mr-2 h-4 w-4 text-text-primary" aria-hidden="true" />
                    <span>{localize('com_ui_edit')}</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <PreviewPrompt
        group={group}
        open={isPreviewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        onCloseAutoFocus={() => {
          requestAnimationFrame(() => {
            triggerButtonRef.current?.focus({ preventScroll: true });
          });
        }}
      />
      <VariableDialog
        open={isVariableDialogOpen}
        onClose={() => setVariableDialogOpen(false)}
        group={group}
      />
    </>
  );
}

export default memo(ChatGroupItem);
