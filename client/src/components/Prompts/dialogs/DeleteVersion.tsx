import React, { useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Button,
  OGDialog,
  OGDialogTrigger,
  Label,
  TooltipAnchor,
  OGDialogTemplate,
} from '@librechat/client';
import { useDeletePrompt } from '~/data-provider';
import { useLocalize } from '~/hooks';

const DeleteConfirmDialog = ({
  name,
  disabled,
  selectHandler,
}: {
  name: string;
  disabled?: boolean;
  selectHandler: () => void;
}) => {
  const localize = useLocalize();

  return (
    <OGDialog>
      <OGDialogTrigger asChild>
        <TooltipAnchor
          description={localize('com_ui_delete')}
          side="top"
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={localize('com_ui_delete')}
              className="h-9 gap-2 border-border-medium text-text-primary hover:border-red-500 hover:bg-red-500/10 hover:text-red-500"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              <span>{localize('com_ui_delete')}</span>
            </Button>
          }
        />
      </OGDialogTrigger>
      <OGDialogTemplate
        showCloseButton={false}
        title={localize('com_ui_delete_prompt')}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label
                  htmlFor="dialog-delete-confirm-prompt"
                  className="text-left text-sm font-medium"
                >
                  {localize('com_ui_delete_confirm_prompt_version_var', { 0: name })}
                </Label>
              </div>
            </div>
          </>
        }
        selection={{
          selectHandler,
          selectClasses:
            'bg-surface-destructive hover:bg-surface-destructive-hover transition-colors duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
};

interface DeletePromptProps {
  promptId?: string;
  groupId: string;
  promptName: string;
  disabled: boolean;
}

const DeletePrompt = React.memo(
  ({ promptId, groupId, promptName, disabled }: DeletePromptProps) => {
    const deletePromptMutation = useDeletePrompt();

    const handleDelete = useCallback(() => {
      if (!promptId) {
        console.warn('No prompt ID provided for deletion');
        return;
      }
      deletePromptMutation.mutate({
        _id: promptId,
        groupId,
      });
    }, [promptId, groupId, deletePromptMutation]);

    if (!promptId) {
      return null;
    }

    return (
      <DeleteConfirmDialog
        name={promptName}
        disabled={disabled || !promptId}
        selectHandler={handleDelete}
      />
    );
  },
);

DeletePrompt.displayName = 'DeletePrompt';

export default DeletePrompt;
