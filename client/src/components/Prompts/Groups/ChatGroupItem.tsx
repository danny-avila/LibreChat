import { useState, useMemo } from 'react';
import { Menu as MenuIcon, Edit as EditIcon, EarthIcon, TextSearch } from 'lucide-react';
import type { TPromptGroup } from 'librechat-data-provider';
import {
  Button,
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

export default function ChatGroupItem({
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
    () => instanceProjectId && group?.projectIds?.includes(instanceProjectId),
    [group, instanceProjectId],
  );
  const isOwner = useMemo(() => user?.id === group?.author, [user, group]);

  const onCardClick = () => {
    const text = group.productionPrompt?.prompt ?? '';
    if (!text) {
      return;
    }
    const hasVariables = detectVariables(text);
    if (hasVariables) {
      return setVariableDialogOpen(true);
    }

    submitPrompt(text);
  };

  return (
    <>
      <ListCard
        name={group.name}
        category={group.category ?? ''}
        onClick={onCardClick}
        snippet={group.oneliner ? group.oneliner : group?.productionPrompt?.prompt ?? ''}
      >
        <div className="flex flex-row items-center gap-2">
          {groupIsGlobal && <EarthIcon className="icon-md text-green-400" />}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="z-50 h-7 w-7 p-0 transition-all duration-300 ease-in-out hover:border-white dark:bg-gray-800 dark:hover:border-gray-400 dark:focus:border-gray-500"
              >
                <MenuIcon className="icon-md dark:text-gray-300" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="z-50 mt-2 w-36 rounded-lg"
              collisionPadding={2}
              align="end"
            >
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewDialogOpen(true);
                }}
                className="w-full cursor-pointer rounded-lg disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
              >
                <TextSearch className="mr-2 h-4 w-4" />
                <span>{localize('com_ui_preview')}</span>
              </DropdownMenuItem>
              {isOwner && (
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!isOwner}
                    className="cursor-pointer rounded-lg disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditClick(e);
                    }}
                  >
                    <EditIcon className="mr-2 h-4 w-4" />
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
