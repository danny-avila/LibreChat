import React, { useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Button,
  OGDialog,
  OGDialogTrigger,
  TooltipAnchor,
  OGDialogTemplate,
  useToastContext,
} from '@librechat/client';
import { useDeleteSkillMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface DeleteSkillProps {
  skillId: string;
  skillName: string;
  disabled?: boolean;
  onDelete?: () => void;
}

const DeleteSkill = React.memo(({ skillId, skillName, disabled, onDelete }: DeleteSkillProps) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const deleteSkill = useDeleteSkillMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_skill_deleted') });
      onDelete?.();
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_skill_delete_error') });
    },
  });

  const handleDelete = useCallback(() => {
    deleteSkill.mutate({ id: skillId });
  }, [deleteSkill, skillId]);

  return (
    <OGDialog>
      <OGDialogTrigger asChild>
        <TooltipAnchor
          description={localize('com_ui_delete')}
          side="bottom"
          render={
            <Button
              variant="destructive"
              size="icon"
              className="size-9"
              aria-label={localize('com_ui_delete')}
              disabled={disabled || deleteSkill.isLoading}
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="size-5" aria-hidden="true" />
            </Button>
          }
        />
      </OGDialogTrigger>
      <OGDialogTemplate
        showCloseButton={false}
        title={localize('com_ui_delete')}
        className="max-w-[450px]"
        main={
          <p className="text-left text-sm text-text-primary">
            {localize('com_ui_skill_delete_confirm', { 0: skillName })}
          </p>
        }
        selection={{
          selectHandler: handleDelete,
          selectClasses:
            'bg-surface-destructive hover:bg-surface-destructive-hover transition-colors duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
});

DeleteSkill.displayName = 'DeleteSkill';

export default DeleteSkill;
