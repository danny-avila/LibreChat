import { useState, useMemo, useCallback, memo } from 'react';
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

  // Flag if group is global based on instanceProjectId and group's projectIds.
  const groupIsGlobal = useMemo(
    () => instanceProjectId != null && group.projectIds?.includes(instanceProjectId),
    [group, instanceProjectId],
  );

  // Check if the current user is the owner.
  const isOwner = useMemo(() => user?.id === group.author, [user, group]);

  // Precompute the snippet to display on the card.
  const snippet = useMemo(() => {
    if (typeof group.oneliner === 'string' && group.oneliner.length > 0) {
      return group.oneliner;
    }
    return group.productionPrompt?.prompt ?? '';
  }, [group]);

  // Memoized handler for clicking the card.
  const handleCardClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const text = group.productionPrompt?.prompt;
      if (!text?.trim()) {
        return;
      }

      if (detectVariables(text)) {
        setVariableDialogOpen(true);
      } else {
        submitPrompt(text);
      }
    },
    [group, submitPrompt],
  );

  // Memoized handler for opening the preview dialog.
  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewDialogOpen(true);
  }, []);

  // Memoized handler for navigating to the edit view.
  const handleEditClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onEditClick(e);
    },
    [onEditClick],
  );

  // Generic stop propagation handlers
  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const stopKeyPropagation = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <>
      <ListCard
        name={group.name}
        category={group.category ?? ''}
        onClick={handleCardClick}
        snippet={snippet}
      >
        <div className="flex flex-row items-center gap-2">
          {groupIsGlobal && (
            <EarthIcon className="icon-md text-green-400" aria-label="Global prompt group" />
          )}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                id={`prompt-actions-${group._id}`}
                aria-label={`${group.name} - Actions Menu`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    stopKeyPropagation(e);
                  }
                }}
                className="z-50 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-medium bg-transparent p-0 text-sm font-medium transition-all duration-300 ease-in-out hover:border-border-heavy hover:bg-surface-secondary focus:border-border-heavy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                <MenuIcon className="icon-md text-text-secondary" aria-hidden="true" />
                <span className="sr-only">Open actions menu for {group.name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              id={`prompt-menu-${group._id}`}
              aria-label={`Available actions for ${group.name}`}
              className="z-50 mt-2 w-36 rounded-lg"
              collisionPadding={2}
              align="end"
            >
              <DropdownMenuItem
                role="menuitem"
                onClick={handlePreviewClick}
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
                    onClick={handleEditClick}
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
