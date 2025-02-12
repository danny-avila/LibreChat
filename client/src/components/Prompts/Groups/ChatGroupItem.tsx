import { useState, useMemo, memo } from 'react';
import { Menu as MenuIcon, Edit as EditIcon, EarthIcon, TextSearch } from 'lucide-react';
import type { TPromptGroup } from 'librechat-data-provider';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui';
import { useLocalize, useSubmitMessage, useCustomLink, useAuthContext } from '~/hooks';
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
  const { user } = useAuthContext();
  const { submitPrompt } = useSubmitMessage();
  const [isPreviewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isVariableDialogOpen, setVariableDialogOpen] = useState(false);
  const onEditClick = useCustomLink<HTMLDivElement>(`/d/prompts/${group._id}`);

  const groupIsGlobal = useMemo(
    () => instanceProjectId != null && group.projectIds?.includes(instanceProjectId),
    [group, instanceProjectId],
  );
  const isOwner = useMemo(() => user?.id === group.author, [user, group]);

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
      <ListCard
        name={group.name}
        category={group.category ?? ''}
        onClick={onCardClick}
        snippet={
          typeof group.oneliner === 'string' && group.oneliner.length > 0
            ? group.oneliner
            : group.productionPrompt?.prompt ?? ''
        }
      >
        <div className="flex flex-row items-center gap-2">
          {groupIsGlobal === true && (
            <EarthIcon className="icon-md text-green-400" aria-label="Global prompt group" />
          )}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                id={`prompt-actions-${group._id}`}
                aria-label={`${group.name} - Actions Menu`}
                aria-expanded="false"
                aria-controls={`prompt-menu-${group._id}`}
                aria-haspopup="menu"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
                className="z-50 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-medium bg-transparent p-0 text-sm font-medium transition-all duration-300 ease-in-out hover:border-border-heavy hover:bg-surface-hover focus:border-border-heavy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                <MenuIcon className="icon-md text-text-secondary" aria-hidden="true" />
                <span className="sr-only">Open actions menu for {group.name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              id={`prompt-menu-${group._id}`}
              aria-label={`Available actions for ${group.name}`}
              className="z-50 w-fit rounded-xl"
              collisionPadding={2}
              align="end"
            >
              <DropdownMenuItem
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewDialogOpen(true);
                }}
                className="w-full cursor-pointer rounded-lg text-text-secondary hover:bg-surface-hover focus:bg-surface-hover disabled:cursor-not-allowed"
              >
                <TextSearch className="mr-2 h-4 w-4" aria-hidden="true" />
                <span>{localize('com_ui_preview')}</span>
              </DropdownMenuItem>
              {isOwner && (
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!isOwner}
                    className="cursor-pointer rounded-lg text-text-secondary hover:bg-surface-hover focus:bg-surface-hover disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditClick(e);
                    }}
                  >
                    <EditIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                    <span>{localize('com_ui_edit')}</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ListCard>
      <PreviewPrompt group={group} open={isPreviewDialogOpen} onOpenChange={setPreviewDialogOpen} />
      <VariableDialog
        open={isVariableDialogOpen}
        onClose={() => setVariableDialogOpen(false)}
        group={group}
      />
    </>
  );
}

export default memo(ChatGroupItem);
